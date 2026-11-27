// payments, mounted at /api/shops/:shopId/payments
import { Hono } from 'hono';
import { z } from 'zod';
import { dateRangeQuery, newPaymentSchema, pageQuery, PAYMENT_METHODS } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { callProc, query, queryOne, withConn } from '../db';
import type { AppEnv } from '../lib/env-types';
import { accountInShop, paramId } from '../lib/ownership';
import { validate } from '../lib/validate';

// Q6: which sales a payment cleared and how much went to each
export async function paymentAllocations(paymentId: number) {
  return query<{
    saleId: number;
    soldAt: string;
    dueDate: string;
    totalAmount: number;
    amount: number;
    status: string;
  }>(
    `SELECT pa.sale_id, cs.sold_at, cs.due_date, cs.total_amount, pa.amount, cs.status
       FROM payment_allocations pa
       JOIN credit_sales cs ON cs.sale_id = pa.sale_id
      WHERE pa.payment_id = ?
      ORDER BY cs.sold_at, cs.sale_id`,
    [paymentId],
  );
}

export const paymentRoutes = new Hono<AppEnv>()
  // POST / - take a payment. sp_record_payment saves it and spreads it over the oldest
  // unpaid sales first. it refuses overpaying and a TrxID that was used before
  .post('/', requireShopAccess({ active: true }), validate('json', newPaymentSchema), async (c) => {
    const { shopCustomerId, amount, method, trxRef } = c.req.valid('json');
    const user = c.get('user');
    await accountInShop(shopCustomerId, c.get('shop').shopId);

    const paymentId = await withConn(user.fullName, (conn) =>
      callProc<number>(conn, 'sp_record_payment', [
        shopCustomerId,
        amount,
        method,
        trxRef ?? null,
        user.userId,
      ]),
    );
    const payment = await queryOne<{
      paymentId: number;
      amount: number;
      method: string;
      trxRef: string | null;
      paidAt: string;
    }>('SELECT payment_id, amount, method, trx_ref, paid_at FROM payments WHERE payment_id = ?', [
      paymentId,
    ]);
    return c.json({ payment: payment!, allocations: await paymentAllocations(paymentId) }, 201);
  })

  // GET /preview?shopCustomerId=&amount= - shows which sales this amount WOULD clear, without saving.
  // same order as the procedure: oldest first, disputed sales skipped.
  // running total of balances tells us how much is left for each sale
  .get(
    '/preview',
    validate(
      'query',
      z.object({
        shopCustomerId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive(),
      }),
    ),
    async (c) => {
      const { shopCustomerId, amount } = c.req.valid('query');
      await accountInShop(shopCustomerId, c.get('shop').shopId);
      const rows = await query<{
        saleId: number;
        soldAt: string;
        dueDate: string;
        balance: number;
        takes: number;
        clears: number;
      }>(
        `SELECT x.sale_id, x.sold_at, x.due_date, x.balance,
                LEAST(x.balance, GREATEST(? - (x.running - x.balance), 0)) AS takes,
                (? >= x.running) AS clears
           FROM (
             SELECT sale_id, sold_at, due_date, balance,
                    SUM(balance) OVER (ORDER BY sold_at, sale_id) AS running
               FROM v_sale_balance
              WHERE shop_customer_id = ? AND balance > 0 AND status <> 'disputed'
           ) AS x
          ORDER BY x.sold_at, x.sale_id`,
        [amount, amount, shopCustomerId],
      );
      const payable = rows.reduce((s, r) => s + r.balance, 0);
      return c.json({
        payable: Math.round(payable * 100) / 100,
        tooMuch: amount > payable + 0.001,
        allocations: rows.filter((r) => r.takes > 0).map((r) => ({ ...r, clears: r.clears === 1 })),
      });
    },
  )

  // GET /?from=&to=&method=&shopCustomerId= - payment history
  .get(
    '/',
    validate(
      'query',
      z.object({
        method: z.enum(PAYMENT_METHODS).optional(),
        shopCustomerId: z.coerce.number().int().positive().optional(),
        ...dateRangeQuery,
        ...pageQuery,
      }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where = ['sc.shop_id = ?'];
      const params: unknown[] = [c.get('shop').shopId];
      if (f.method) {
        where.push('p.method = ?');
        params.push(f.method);
      }
      if (f.shopCustomerId) {
        where.push('p.shop_customer_id = ?');
        params.push(f.shopCustomerId);
      }
      if (f.from) {
        where.push('p.paid_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        where.push('p.paid_at < ? + INTERVAL 1 DAY');
        params.push(f.to);
      }
      const sqlWhere = where.join(' AND ');

      const rows = await query<{
        paymentId: number;
        paidAt: string;
        amount: number;
        method: string;
        trxRef: string | null;
        shopCustomerId: number;
        customerName: string;
        phone: string;
        receivedBy: string;
        salesCleared: number;
      }>(
        `SELECT p.payment_id, p.paid_at, p.amount, p.method, p.trx_ref, p.shop_customer_id,
                c.full_name AS customer_name, c.phone, u.full_name AS received_by,
                (SELECT COUNT(*) FROM payment_allocations pa WHERE pa.payment_id = p.payment_id) AS sales_cleared
           FROM payments p
           JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
           JOIN customers c       ON c.customer_id = sc.customer_id
           JOIN users u           ON u.user_id = p.received_by
          WHERE ${sqlWhere}
          ORDER BY p.paid_at DESC, p.payment_id DESC
          LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      );
      const totals = await queryOne<{ n: number; total: number }>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(p.amount), 0) AS total
           FROM payments p JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
          WHERE ${sqlWhere}`,
        params,
      );
      return c.json({ rows, total: totals?.n ?? 0, sumAmount: totals?.total ?? 0 });
    },
  )

  // GET /:paymentId - one payment and the sales it cleared (Q6)
  .get('/:paymentId', async (c) => {
    const paymentId = paramId(c, 'paymentId');
    const payment = await queryOne<{
      paymentId: number;
      paidAt: string;
      amount: number;
      method: string;
      trxRef: string | null;
      note: string | null;
      shopCustomerId: number;
      customerName: string;
      phone: string;
      receivedBy: string;
    }>(
      `SELECT p.payment_id, p.paid_at, p.amount, p.method, p.trx_ref, p.note, p.shop_customer_id,
              c.full_name AS customer_name, c.phone, u.full_name AS received_by
         FROM payments p
         JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
         JOIN customers c       ON c.customer_id = sc.customer_id
         JOIN users u           ON u.user_id = p.received_by
        WHERE p.payment_id = ? AND sc.shop_id = ?`,
      [paymentId, c.get('shop').shopId],
    );
    if (!payment)
      return c.json({ error: { code: 'NOT_FOUND', message: 'Payment not found' } }, 404);
    return c.json({ payment, allocations: await paymentAllocations(paymentId) });
  });
