// a shop's customers, mounted at /api/shops/:shopId/customers
import { Hono } from 'hono';
import { z } from 'zod';
import { phoneSchema, type CustomerBalanceRow, type CustomerLookup } from '@dokankhata/shared';
import { query, queryOne } from '../db';
import { notFound, notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

const listQuery = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['active', 'blocked', 'closed']).optional(),
  owing: z.enum(['1']).optional(), // only customers with balance > 0
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const customerRoutes = new Hono<AppEnv>()
  // GET /?q=&status=&owing=1&limit=&offset=
  // filters: only fixed bits go into sqlWhere, the actual values always go through ?
  .get('/', validate('query', listQuery), async (c) => {
    const { q, status, owing, limit, offset } = c.req.valid('query');
    const where = ['b.shop_id = ?'];
    const params: unknown[] = [c.get('shop').shopId];
    if (q) {
      where.push('(b.full_name LIKE ? OR b.phone LIKE ?)');
      params.push(`%${q}%`, `%${q.replace(/\D/g, '') || q}%`);
    }
    if (status) {
      where.push('b.status = ?');
      params.push(status);
    }
    if (owing) where.push('b.balance > 0');

    const sqlWhere = where.join(' AND ');
    const rows = await query<CustomerBalanceRow>(
      `SELECT b.shop_customer_id, b.customer_id, b.full_name, b.phone, b.credit_limit, b.status,
              b.total_sales, b.total_credit, b.total_paid, b.total_adjusted, b.balance,
              b.available_credit, b.unpaid_sales, b.oldest_unpaid_due, b.max_days_overdue,
              b.last_purchase_at, t.score AS trust_score
         FROM v_customer_balance b
         LEFT JOIN customer_trust_scores t ON t.customer_id = b.customer_id
        WHERE ${sqlWhere}
        ORDER BY b.balance DESC, b.full_name
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM v_customer_balance b WHERE ${sqlWhere}`,
      params,
    );
    return c.json({ rows, total: total?.n ?? 0 });
  })

  // GET /lookup?phone=01XXXXXXXXX
  // the check before giving credit: their account here, trust score, and what they owe elsewhere
  .get('/lookup', validate('query', z.object({ phone: phoneSchema })), async (c) => {
    const { phone } = c.req.valid('query');
    const shopId = c.get('shop').shopId;

    const person = await queryOne<{ customerId: number; fullName: string; phone: string }>(
      'SELECT customer_id, full_name, phone FROM customers WHERE phone = ?',
      [phone],
    );
    if (!person) throw notFound('Customer');

    const [account, trust, other] = await Promise.all([
      queryOne<NonNullable<CustomerLookup['account']>>(
        `SELECT sc.shop_customer_id, sc.credit_limit, sc.due_days, sc.status,
                b.balance, b.available_credit, b.max_days_overdue
           FROM shop_customers sc
           JOIN v_customer_balance b ON b.shop_customer_id = sc.shop_customer_id
          WHERE sc.shop_id = ? AND sc.customer_id = ?`,
        [shopId, person.customerId],
      ),
      queryOne<NonNullable<CustomerLookup['trust']>>(
        `SELECT score, on_time_pct, avg_days_late, broken_promises, shops_owed, total_outstanding
           FROM customer_trust_scores WHERE customer_id = ?`,
        [person.customerId],
      ),
      queryOne<{ shopsOwed: number; outstanding: number }>(
        `SELECT COUNT(DISTINCT shop_id) AS shops_owed, COALESCE(SUM(balance), 0) AS outstanding
           FROM v_sale_balance
          WHERE customer_id = ? AND shop_id <> ? AND balance > 0`,
        [person.customerId, shopId],
      ),
    ]);

    const result: CustomerLookup = {
      ...person,
      account,
      trust,
      otherShops: other ?? { shopsOwed: 0, outstanding: 0 },
    };
    return c.json(result);
  })

  // POST / - find-or-create customer by phone, then open a shop_customers account
  .post('/', notImplemented('Member 3'))
  // GET /:shopCustomerId - account detail (balance, guarantors, recent activity)
  .get('/:shopCustomerId', notImplemented('Member 3'))
  // PATCH /:shopCustomerId - credit limit, due days, status (+blocked_reason). Manager only. Audited by trigger.
  .patch('/:shopCustomerId', notImplemented('Member 3'))
  // POST /:shopCustomerId/guarantors - add a jamindar
  .post('/:shopCustomerId/guarantors', notImplemented('Member 3'));
