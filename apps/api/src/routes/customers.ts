// a shop's customers, mounted at /api/shops/:shopId/customers
import { Hono } from 'hono';
import { z } from 'zod';
import {
  newCustomerSchema,
  newGuarantorSchema,
  phoneSchema,
  updateAccountSchema,
  type CustomerBalanceRow,
  type CustomerLookup,
} from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { execute, query, queryOne, withConn, withTx } from '../db';
import { notFound } from '../errors';
import { accountInShop, paramId } from '../lib/ownership';
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

  // GET /guarantor-risk (Q12)
  // guarantors whose guaranteed accounts here are overdue. self join: customers as the
  // guarantor (g) and customers as the borrower (c), linked through customer_guarantors
  .get('/guarantor-risk', async (c) => {
    const rows = await query<{
      guarantorId: number;
      guarantorName: string;
      guarantorPhone: string;
      guaranteedAccounts: number;
      overdueAccounts: number;
      overdueBalance: number;
      totalGuaranteed: number;
      overdueBorrowers: string | null;
    }>(
      `SELECT g.customer_id AS guarantor_id, g.full_name AS guarantor_name, g.phone AS guarantor_phone,
              COUNT(*) AS guaranteed_accounts,
              SUM(b.max_days_overdue > 0) AS overdue_accounts,
              SUM(CASE WHEN b.max_days_overdue > 0 THEN b.balance ELSE 0 END) AS overdue_balance,
              SUM(cg.guarantee_limit) AS total_guaranteed,
              GROUP_CONCAT(CASE WHEN b.max_days_overdue > 0 THEN c.full_name END ORDER BY c.full_name SEPARATOR ', ')
                AS overdue_borrowers
         FROM customer_guarantors cg
         JOIN customers g          ON g.customer_id = cg.guarantor_customer_id
         JOIN v_customer_balance b ON b.shop_customer_id = cg.shop_customer_id
         JOIN customers c          ON c.customer_id = b.customer_id
        WHERE b.shop_id = ?
        GROUP BY g.customer_id, g.full_name, g.phone
       HAVING overdue_accounts > 0
        ORDER BY overdue_balance DESC`,
      [c.get('shop').shopId],
    );
    return c.json(rows);
  })

  // POST / - add a customer to this shop.
  // customers are shared across shops by phone, so if the number is already on DokanKhata
  // we reuse that person and just open an account here
  .post('/', validate('json', newCustomerSchema), async (c) => {
    const body = c.req.valid('json');
    const user = c.get('user');
    const shopId = c.get('shop').shopId;

    const created = await withTx(user.fullName, async (conn) => {
      const shop = await queryOne<{ defaultCreditLimit: number; defaultDueDays: number }>(
        'SELECT default_credit_limit, default_due_days FROM shops WHERE shop_id = ?',
        [shopId],
        conn,
      );
      const existing = await queryOne<{ customerId: number }>(
        'SELECT customer_id FROM customers WHERE phone = ? FOR UPDATE',
        [body.phone],
        conn,
      );
      let customerId = existing?.customerId;
      if (!customerId) {
        const r = await execute(
          'INSERT INTO customers (phone, full_name, nid, area_id, address) VALUES (?, ?, ?, ?, ?)',
          [body.phone, body.fullName, body.nid || null, body.areaId ?? null, body.address ?? null],
          conn,
        );
        customerId = r.insertId;
      }
      const acct = await execute(
        `INSERT INTO shop_customers (shop_id, customer_id, credit_limit, due_days, joined_on)
         VALUES (?, ?, ?, ?, CURDATE())`,
        [
          shopId,
          customerId,
          body.creditLimit ?? shop!.defaultCreditLimit,
          body.dueDays ?? shop!.defaultDueDays,
        ],
        conn,
      );
      return { shopCustomerId: acct.insertId, customerId, existingPerson: !!existing };
    });
    return c.json(created, 201);
  })

  // GET /:shopCustomerId - one account: balance, guarantors, who they guarantee, promises
  .get('/:shopCustomerId', async (c) => {
    const shopCustomerId = paramId(c, 'shopCustomerId');
    await accountInShop(shopCustomerId, c.get('shop').shopId);

    const [account, guarantors, guarantees, promises] = await Promise.all([
      queryOne<
        CustomerBalanceRow & {
          dueDays: number;
          blockedReason: string | null;
          joinedOn: string;
          nid: string | null;
          address: string | null;
          areaName: string | null;
        }
      >(
        `SELECT b.shop_customer_id, b.customer_id, b.full_name, b.phone, b.credit_limit, b.status,
                b.total_sales, b.total_credit, b.total_paid, b.total_adjusted, b.balance,
                b.available_credit, b.unpaid_sales, b.oldest_unpaid_due, b.max_days_overdue,
                b.last_purchase_at, t.score AS trust_score,
                sc.due_days, sc.blocked_reason, sc.joined_on, cu.nid, cu.address, a.name AS area_name
           FROM v_customer_balance b
           JOIN shop_customers sc ON sc.shop_customer_id = b.shop_customer_id
           JOIN customers cu      ON cu.customer_id = b.customer_id
           LEFT JOIN areas a      ON a.area_id = cu.area_id
           LEFT JOIN customer_trust_scores t ON t.customer_id = b.customer_id
          WHERE b.shop_customer_id = ?`,
        [shopCustomerId],
      ),
      // people who guarantee this account
      query<{ customerId: number; fullName: string; phone: string; guaranteeLimit: number }>(
        `SELECT g.customer_id, g.full_name, g.phone, cg.guarantee_limit
           FROM customer_guarantors cg JOIN customers g ON g.customer_id = cg.guarantor_customer_id
          WHERE cg.shop_customer_id = ?`,
        [shopCustomerId],
      ),
      // accounts at this shop that THIS customer guarantees
      query<{
        shopCustomerId: number;
        fullName: string;
        balance: number;
        maxDaysOverdue: number;
        guaranteeLimit: number;
      }>(
        `SELECT b.shop_customer_id, b.full_name, b.balance, b.max_days_overdue, cg.guarantee_limit
           FROM customer_guarantors cg
           JOIN v_customer_balance b ON b.shop_customer_id = cg.shop_customer_id
          WHERE cg.guarantor_customer_id = (SELECT customer_id FROM shop_customers WHERE shop_customer_id = ?)
            AND b.shop_id = ?`,
        [shopCustomerId, c.get('shop').shopId],
      ),
      query<{ promiseId: number; promisedAmount: number; promisedDate: string; status: string }>(
        `SELECT promise_id, promised_amount, promised_date, status
           FROM promises WHERE shop_customer_id = ? ORDER BY promised_date DESC LIMIT 10`,
        [shopCustomerId],
      ),
    ]);
    return c.json({ account: account!, guarantors, guarantees, promises });
  })

  // PATCH /:shopCustomerId - limit, due days, block/unblock. owner or manager only.
  // the trigger on shop_customers writes every change to audit_log
  .patch(
    '/:shopCustomerId',
    requireShopAccess({ manager: true }),
    validate('json', updateAccountSchema),
    async (c) => {
      const shopCustomerId = paramId(c, 'shopCustomerId');
      const body = c.req.valid('json');
      await accountInShop(shopCustomerId, c.get('shop').shopId);

      const sets: string[] = [];
      const params: unknown[] = [];
      if (body.creditLimit !== undefined) {
        sets.push('credit_limit = ?');
        params.push(body.creditLimit);
      }
      if (body.dueDays !== undefined) {
        sets.push('due_days = ?');
        params.push(body.dueDays);
      }
      if (body.status !== undefined) {
        sets.push('status = ?', 'blocked_reason = ?');
        params.push(body.status, body.status === 'blocked' ? body.blockedReason : null);
      }
      if (!sets.length) return c.json({ ok: true });

      const sqlSet = sets.join(', ');
      await withConn(c.get('user').fullName, (conn) =>
        execute(
          `UPDATE shop_customers SET ${sqlSet} WHERE shop_customer_id = ?`,
          [...params, shopCustomerId],
          conn,
        ),
      );
      return c.json({ ok: true });
    },
  )

  // POST /:shopCustomerId/guarantors - add a jamindar. the trigger checks they're a
  // customer here too and not the same person
  .post(
    '/:shopCustomerId/guarantors',
    requireShopAccess({ manager: true }),
    validate('json', newGuarantorSchema),
    async (c) => {
      const shopCustomerId = paramId(c, 'shopCustomerId');
      const { guarantorCustomerId, guaranteeLimit } = c.req.valid('json');
      await accountInShop(shopCustomerId, c.get('shop').shopId);
      await withConn(c.get('user').fullName, (conn) =>
        execute(
          'INSERT INTO customer_guarantors (shop_customer_id, guarantor_customer_id, guarantee_limit) VALUES (?, ?, ?)',
          [shopCustomerId, guarantorCustomerId, guaranteeLimit],
          conn,
        ),
      );
      return c.json({ ok: true }, 201);
    },
  );
