// credit sales, mounted at /api/shops/:shopId/sales
import { Hono } from 'hono';
import { z } from 'zod';
import {
  dateRangeQuery,
  dueDateSchema,
  newSaleSchema,
  pageQuery,
  SALE_STATUSES,
  type SaleRow,
} from '@dokankhata/shared';
import { callProc, execute, query, queryOne, withConn } from '../db';
import { forbidden } from '../errors';
import { paramId, saleInShop } from '../lib/ownership';
import { requireShopAccess } from '../auth/guards';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

export const saleRoutes = new Hono<AppEnv>()
  // POST / - record a credit sale through sp_record_credit_sale.
  // all the writes work like this: validate, check the record is ours, withConn, call the procedure.
  // if the DB refuses (limit, stock, blocked) the error handler turns it into a 422
  .post(
    '/',
    requireShopAccess({ canGiveCredit: true, active: true }),
    validate('json', newSaleSchema),
    async (c) => {
      const { shopCustomerId, items, note } = c.req.valid('json');
      const user = c.get('user');
      const shopId = c.get('shop').shopId;

      // the account has to be at this shop, not just any shop the user works at
      const acct = await queryOne<{ shopId: number }>(
        'SELECT shop_id FROM shop_customers WHERE shop_customer_id = ?',
        [shopCustomerId],
      );
      if (acct?.shopId !== shopId) throw forbidden('This customer account is not at this shop');

      const cart = JSON.stringify(
        items.map((i) => ({ shop_product_id: i.shopProductId, qty: i.qty })),
      );
      const sale = await withConn(user.fullName, async (conn) => {
        const saleId = await callProc<number>(conn, 'sp_record_credit_sale', [
          shopCustomerId,
          user.userId,
          cart,
          note || null,
        ]);
        return queryOne<{ saleId: number; totalAmount: number; dueDate: string; soldAt: string }>(
          'SELECT sale_id, total_amount, due_date, sold_at FROM credit_sales WHERE sale_id = ?',
          [saleId],
          conn,
        );
      });
      return c.json(sale!, 201);
    },
  )
  // GET /?status=&from=&to=&shopCustomerId=&staffUserId=&limit=&offset= - sales history
  .get(
    '/',
    validate(
      'query',
      z.object({
        status: z.enum(SALE_STATUSES).optional(),
        shopCustomerId: z.coerce.number().int().positive().optional(),
        staffUserId: z.coerce.number().int().positive().optional(),
        unpaid: z.enum(['1']).optional(),
        ...dateRangeQuery,
        ...pageQuery,
      }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where = ['sb.shop_id = ?'];
      const params: unknown[] = [c.get('shop').shopId];
      if (f.status) {
        where.push('sb.status = ?');
        params.push(f.status);
      }
      if (f.shopCustomerId) {
        where.push('sb.shop_customer_id = ?');
        params.push(f.shopCustomerId);
      }
      if (f.staffUserId) {
        where.push('sb.staff_user_id = ?');
        params.push(f.staffUserId);
      }
      if (f.unpaid) where.push('sb.balance > 0');
      if (f.from) {
        where.push('sb.sold_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        where.push('sb.sold_at < ? + INTERVAL 1 DAY');
        params.push(f.to);
      }
      const sqlWhere = where.join(' AND ');

      const rows = await query<
        SaleRow & {
          shopCustomerId: number;
          customerName: string;
          phone: string;
          staffName: string;
          daysOverdue: number;
        }
      >(
        `SELECT sb.sale_id, sb.sold_at, sb.due_date, sb.total_amount, sb.paid_amount, sb.adjusted_amount,
                sb.balance, sb.status, sb.days_overdue, sb.shop_customer_id,
                c.full_name AS customer_name, c.phone, u.full_name AS staff_name
           FROM v_sale_balance sb
           JOIN customers c ON c.customer_id = sb.customer_id
           JOIN users u     ON u.user_id = sb.staff_user_id
          WHERE ${sqlWhere}
          ORDER BY sb.sold_at DESC, sb.sale_id DESC
          LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      );
      const totals = await queryOne<{ n: number; total: number; outstanding: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(sb.total_amount), 0) AS total, COALESCE(SUM(sb.balance), 0) AS outstanding
           FROM v_sale_balance sb WHERE ${sqlWhere}`,
        params,
      );
      return c.json({
        rows,
        total: totals?.n ?? 0,
        sumTotal: totals?.total ?? 0,
        sumOutstanding: totals?.outstanding ?? 0,
      });
    },
  )

  // GET /:saleId - one bill with its items, the payments that cleared it, adjustments and disputes
  .get('/:saleId', async (c) => {
    const saleId = paramId(c, 'saleId');
    await saleInShop(saleId, c.get('shop').shopId);

    const [sale, items, allocations, adjustments, disputes] = await Promise.all([
      queryOne<
        SaleRow & {
          note: string | null;
          daysOverdue: number;
          shopCustomerId: number;
          customerName: string;
          phone: string;
          staffName: string;
        }
      >(
        `SELECT sb.sale_id, sb.sold_at, sb.due_date, sb.total_amount, sb.paid_amount, sb.adjusted_amount,
                sb.balance, sb.status, sb.days_overdue, sb.shop_customer_id, cs.note,
                c.full_name AS customer_name, c.phone, u.full_name AS staff_name
           FROM v_sale_balance sb
           JOIN credit_sales cs ON cs.sale_id = sb.sale_id
           JOIN customers c     ON c.customer_id = sb.customer_id
           JOIN users u         ON u.user_id = sb.staff_user_id
          WHERE sb.sale_id = ?`,
        [saleId],
      ),
      query<{
        itemId: number;
        name: string;
        banglaName: string | null;
        brand: string;
        unit: string;
        qty: number;
        unitPrice: number;
        lineTotal: number;
      }>(
        `SELECT i.item_id, p.name, p.bangla_name, p.brand, p.unit, i.qty, i.unit_price, i.line_total
           FROM credit_sale_items i
           JOIN shop_products sp ON sp.shop_product_id = i.shop_product_id
           JOIN products p       ON p.product_id = sp.product_id
          WHERE i.sale_id = ?
          ORDER BY i.item_id`,
        [saleId],
      ),
      query<{
        paymentId: number;
        amount: number;
        paidAt: string;
        method: string;
        trxRef: string | null;
      }>(
        `SELECT pa.payment_id, pa.amount, p.paid_at, p.method, p.trx_ref
           FROM payment_allocations pa JOIN payments p ON p.payment_id = pa.payment_id
          WHERE pa.sale_id = ?
          ORDER BY p.paid_at`,
        [saleId],
      ),
      query<{
        adjustmentId: number;
        adjType: string;
        amount: number;
        reason: string;
        approvedBy: string;
        createdAt: string;
      }>(
        `SELECT a.adjustment_id, a.adj_type, a.amount, a.reason, u.full_name AS approved_by, a.created_at
           FROM adjustments a JOIN users u ON u.user_id = a.approved_by
          WHERE a.sale_id = ?
          ORDER BY a.created_at`,
        [saleId],
      ),
      query<{
        disputeId: number;
        reason: string;
        status: string;
        resolution: string | null;
        raisedAt: string;
        resolvedAt: string | null;
      }>(
        `SELECT dispute_id, reason, status, resolution, raised_at, resolved_at
           FROM disputes WHERE sale_id = ? ORDER BY raised_at`,
        [saleId],
      ),
    ]);
    return c.json({ sale: sale!, items, allocations, adjustments, disputes });
  })

  // PATCH /:saleId/due-date - give the customer more time. owner or manager.
  // the trigger refuses moving it earlier; afterwards we recalc the status so an
  // overdue sale with a new future date goes back to open / partially paid
  .patch(
    '/:saleId/due-date',
    requireShopAccess({ manager: true }),
    validate('json', dueDateSchema),
    async (c) => {
      const saleId = paramId(c, 'saleId');
      const { dueDate } = c.req.valid('json');
      await saleInShop(saleId, c.get('shop').shopId);
      await withConn(c.get('user').fullName, async (conn) => {
        await execute(
          'UPDATE credit_sales SET due_date = ? WHERE sale_id = ?',
          [dueDate, saleId],
          conn,
        );
        await conn.query('CALL sp_refresh_sale_status(?)', [saleId]);
      });
      return c.json({ ok: true });
    },
  );
