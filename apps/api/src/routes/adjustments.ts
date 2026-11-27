// adjustments and write-offs, mounted at /api/shops/:shopId/adjustments
import { Hono } from 'hono';
import { z } from 'zod';
import {
  ADJUSTMENT_TYPES,
  dateRangeQuery,
  newAdjustmentSchema,
  pageQuery,
} from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { callProc, query, queryOne, withConn } from '../db';
import type { AppEnv } from '../lib/env-types';
import { saleInShop } from '../lib/ownership';
import { validate } from '../lib/validate';

export const adjustmentRoutes = new Hono<AppEnv>()
  // GET /?type=&from=&to=
  .get(
    '/',
    validate(
      'query',
      z.object({ type: z.enum(ADJUSTMENT_TYPES).optional(), ...dateRangeQuery, ...pageQuery }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where = ['sc.shop_id = ?'];
      const params: unknown[] = [c.get('shop').shopId];
      if (f.type) {
        where.push('a.adj_type = ?');
        params.push(f.type);
      }
      if (f.from) {
        where.push('a.created_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        where.push('a.created_at < ? + INTERVAL 1 DAY');
        params.push(f.to);
      }
      const sqlWhere = where.join(' AND ');

      const rows = await query<{
        adjustmentId: number;
        saleId: number;
        adjType: string;
        amount: number;
        reason: string;
        createdAt: string;
        approvedBy: string;
        shopCustomerId: number;
        customerName: string;
      }>(
        `SELECT a.adjustment_id, a.sale_id, a.adj_type, a.amount, a.reason, a.created_at,
                u.full_name AS approved_by, sc.shop_customer_id, c.full_name AS customer_name
           FROM adjustments a
           JOIN credit_sales cs   ON cs.sale_id = a.sale_id
           JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
           JOIN customers c       ON c.customer_id = sc.customer_id
           JOIN users u           ON u.user_id = a.approved_by
          WHERE ${sqlWhere}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      );
      const totals = await queryOne<{ n: number; total: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(a.amount), 0) AS total
           FROM adjustments a
           JOIN credit_sales cs   ON cs.sale_id = a.sale_id
           JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
          WHERE ${sqlWhere}`,
        params,
      );
      return c.json({ rows, total: totals?.n ?? 0, sumAmount: totals?.total ?? 0 });
    },
  )

  // POST / - return, discount, correction or write-off on one sale. owner or manager.
  // sp_add_adjustment checks who's approving and that it's not more than the balance
  .post(
    '/',
    requireShopAccess({ manager: true }),
    validate('json', newAdjustmentSchema),
    async (c) => {
      const { saleId, type, amount, reason } = c.req.valid('json');
      const user = c.get('user');
      await saleInShop(saleId, c.get('shop').shopId);
      const adjustmentId = await withConn(user.fullName, (conn) =>
        callProc<number>(conn, 'sp_add_adjustment', [saleId, type, amount, reason, user.userId]),
      );
      return c.json({ adjustmentId }, 201);
    },
  );
