// disputes on the shop side, mounted at /api/shops/:shopId/disputes
import { Hono } from 'hono';
import { z } from 'zod';
import { DISPUTE_STATUSES, newDisputeSchema, resolveDisputeSchema } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { execute, query, queryOne, withConn } from '../db';
import { notFound } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { paramId, saleInShop } from '../lib/ownership';
import { validate } from '../lib/validate';

export const disputeRoutes = new Hono<AppEnv>()
  // GET /?status=open - open ones first
  .get(
    '/',
    validate('query', z.object({ status: z.enum(DISPUTE_STATUSES).optional() })),
    async (c) => {
      const { status } = c.req.valid('query');
      const params: unknown[] = [c.get('shop').shopId];
      let sqlStatus = '';
      if (status) {
        sqlStatus = 'AND d.status = ?';
        params.push(status);
      }
      const rows = await query<{
        disputeId: number;
        saleId: number;
        reason: string;
        status: string;
        resolution: string | null;
        raisedAt: string;
        resolvedAt: string | null;
        resolvedBy: string | null;
        customerName: string;
        phone: string;
        shopCustomerId: number;
        saleTotal: number;
        soldAt: string;
        staffName: string;
      }>(
        `SELECT d.dispute_id, d.sale_id, d.reason, d.status, d.resolution, d.raised_at, d.resolved_at,
              r.full_name AS resolved_by, c.full_name AS customer_name, c.phone, sc.shop_customer_id,
              cs.total_amount AS sale_total, cs.sold_at, st.full_name AS staff_name
         FROM disputes d
         JOIN credit_sales cs   ON cs.sale_id = d.sale_id
         JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
         JOIN customers c       ON c.customer_id = d.raised_by_customer_id
         JOIN users st          ON st.user_id = cs.staff_user_id
         LEFT JOIN users r      ON r.user_id = d.resolved_by
        WHERE sc.shop_id = ? ${sqlStatus}
        ORDER BY d.status = 'open' DESC, d.raised_at DESC`,
        params,
      );
      return c.json(rows);
    },
  )

  // POST / - record a dispute at the counter for the customer. the trigger marks the sale disputed
  .post('/', validate('json', newDisputeSchema), async (c) => {
    const { saleId, reason } = c.req.valid('json');
    const sale = await saleInShop(saleId, c.get('shop').shopId);
    const r = await withConn(c.get('user').fullName, (conn) =>
      execute(
        'INSERT INTO disputes (sale_id, raised_by_customer_id, reason) VALUES (?, ?, ?)',
        [saleId, sale.customerId, reason],
        conn,
      ),
    );
    return c.json({ disputeId: r.insertId }, 201);
  })

  // PATCH /:disputeId - accept or reject. owner or manager.
  // if it's accepted, the shop should also add an adjustment to fix the amount
  .patch(
    '/:disputeId',
    requireShopAccess({ manager: true }),
    validate('json', resolveDisputeSchema),
    async (c) => {
      const disputeId = paramId(c, 'disputeId');
      const { status, resolution } = c.req.valid('json');
      const d = await queryOne<{ saleId: number; status: string }>(
        `SELECT d.sale_id, d.status FROM disputes d
         JOIN credit_sales cs ON cs.sale_id = d.sale_id
         JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
        WHERE d.dispute_id = ? AND sc.shop_id = ?`,
        [disputeId, c.get('shop').shopId],
      );
      if (!d) throw notFound('Dispute');
      if (d.status !== 'open')
        return c.json(
          { error: { code: 'BUSINESS_RULE', message: 'This dispute is already resolved' } },
          422,
        );
      await withConn(c.get('user').fullName, (conn) =>
        execute(
          `UPDATE disputes SET status = ?, resolution = ?, resolved_by = ?, resolved_at = NOW() WHERE dispute_id = ?`,
          [status, resolution, c.get('user').userId, disputeId],
          conn,
        ),
      );
      return c.json({ ok: true, saleId: d.saleId });
    },
  );
