// customer portal, mounted at /api/portal (customers only)
// everything here is filtered by the logged-in customer's own customer_id
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { newDisputeSchema, portalPaySchema } from '@dokankhata/shared';
import { callProc, execute, query, queryOne, withConn } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { paramId } from '../lib/ownership';
import { getStatement } from '../lib/statement';
import { validate } from '../lib/validate';
import { paymentAllocations } from './payments';

// customer logins should always be linked, but just in case
function myCustomerId(c: { get: (k: 'user') => { customerId: number | null } }) {
  const id = c.get('user').customerId;
  if (!id) throw forbidden('This login is not linked to a customer yet');
  return id;
}

async function myAccount(shopCustomerId: number, customerId: number) {
  const acct = await queryOne<{ shopCustomerId: number; shopId: number }>(
    'SELECT shop_customer_id, shop_id FROM shop_customers WHERE shop_customer_id = ? AND customer_id = ?',
    [shopCustomerId, customerId],
  );
  if (!acct) throw notFound('Account');
  return acct;
}

export const portalRoutes = new Hono<AppEnv>()
  // GET /balances - what I owe at every shop
  .get('/balances', async (c) => {
    const customerId = myCustomerId(c);
    const rows = await query<{
      shopCustomerId: number;
      shopId: number;
      shopName: string;
      shopType: string;
      areaName: string;
      shopPhone: string;
      balance: number;
      creditLimit: number;
      availableCredit: number;
      status: string;
      oldestUnpaidDue: string | null;
      nextDueDate: string | null;
      maxDaysOverdue: number;
      lastPurchaseAt: string | null;
    }>(
      `SELECT b.shop_customer_id, b.shop_id, b.shop_name, s.shop_type, a.name AS area_name, s.phone AS shop_phone,
              b.balance, b.credit_limit, b.available_credit, b.status, b.oldest_unpaid_due,
              (SELECT MIN(sb.due_date) FROM v_sale_balance sb
                WHERE sb.shop_customer_id = b.shop_customer_id AND sb.balance > 0 AND sb.due_date >= CURDATE()) AS next_due_date,
              b.max_days_overdue, b.last_purchase_at
         FROM v_customer_balance b
         JOIN shops s ON s.shop_id = b.shop_id
         JOIN areas a ON a.area_id = s.area_id
        WHERE b.customer_id = ?
        ORDER BY b.balance DESC`,
      [customerId],
    );
    const total = rows.reduce((s, r) => s + r.balance, 0);
    return c.json({
      totalOwed: Math.round(total * 100) / 100,
      shopsOwed: rows.filter((r) => r.balance > 0).length,
      accounts: rows,
    });
  })

  // GET /statement/:shopCustomerId - my khata page at one shop (same Q7 query as the shop side)
  .get('/statement/:shopCustomerId', async (c) => {
    const id = paramId(c, 'shopCustomerId');
    await myAccount(id, myCustomerId(c));
    return c.json(await getStatement(id));
  })

  // GET /trust - my score, what it's made of, and the perfect payer badge
  .get('/trust', async (c) => {
    const customerId = myCustomerId(c);
    const [score, byShop, perfect] = await Promise.all([
      queryOne<{
        score: number;
        onTimePct: number | null;
        avgDaysLate: number;
        settledSales: number;
        overdueSales: number;
        brokenPromises: number;
        shopsOwed: number;
        writeOffs: number;
        totalOutstanding: number;
        calculatedAt: string;
      }>(
        `SELECT score, on_time_pct, avg_days_late, settled_sales, overdue_sales, broken_promises,
                shops_owed, write_offs, total_outstanding, calculated_at
           FROM customer_trust_scores WHERE customer_id = ?`,
        [customerId],
      ),
      // Q5: on-time ratio and average days late, per shop, last 12 months
      query<{
        shopId: number;
        shopName: string;
        settled: number;
        onTime: number;
        onTimePct: number | null;
        avgDaysLate: number | null;
      }>(
        `SELECT sb.shop_id, s.name AS shop_name,
                COUNT(*) AS settled,
                SUM(COALESCE(CAST(sb.last_paid_at AS DATE), sb.due_date) <= sb.due_date) AS on_time,
                ROUND(100 * SUM(COALESCE(CAST(sb.last_paid_at AS DATE), sb.due_date) <= sb.due_date) / COUNT(*), 1) AS on_time_pct,
                ROUND(AVG(GREATEST(DATEDIFF(sb.last_paid_at, sb.due_date), 0)), 1) AS avg_days_late
           FROM v_sale_balance sb
           JOIN shops s ON s.shop_id = sb.shop_id
          WHERE sb.customer_id = ? AND sb.status = 'paid' AND sb.sold_at >= NOW() - INTERVAL 12 MONTH
          GROUP BY sb.shop_id, s.name
          ORDER BY settled DESC`,
        [customerId],
      ),
      // Q17 for one customer: buying for 6+ months, never paid late, nothing overdue now
      queryOne<{ perfect: number; firstSale: string | null }>(
        `SELECT (MIN(sb.sold_at) <= NOW() - INTERVAL 6 MONTH
                 AND NOT EXISTS (SELECT 1 FROM v_sale_balance x
                                  WHERE x.customer_id = ?
                                    AND (x.days_overdue > 0
                                         OR (x.last_paid_at IS NOT NULL AND CAST(x.last_paid_at AS DATE) > x.due_date)))) AS perfect,
                MIN(sb.sold_at) AS first_sale
           FROM v_sale_balance sb WHERE sb.customer_id = ?`,
        [customerId, customerId],
      ),
    ]);
    return c.json({
      score,
      byShop,
      perfectPayer: perfect?.perfect === 1,
      firstSale: perfect?.firstSale ?? null,
    });
  })

  // GET /sales/:shopCustomerId - my unpaid / recent sales at a shop, for the dispute form
  .get('/sales/:shopCustomerId', async (c) => {
    const id = paramId(c, 'shopCustomerId');
    await myAccount(id, myCustomerId(c));
    const rows = await query<{
      saleId: number;
      soldAt: string;
      totalAmount: number;
      balance: number;
      status: string;
      hasOpenDispute: number;
    }>(
      `SELECT sb.sale_id, sb.sold_at, sb.total_amount, sb.balance, sb.status,
              EXISTS (SELECT 1 FROM disputes d WHERE d.sale_id = sb.sale_id AND d.status = 'open') AS has_open_dispute
         FROM v_sale_balance sb
        WHERE sb.shop_customer_id = ?
        ORDER BY sb.sold_at DESC
        LIMIT 100`,
      [id],
    );
    return c.json(rows.map((r) => ({ ...r, hasOpenDispute: r.hasOpenDispute === 1 })));
  })

  // POST /disputes - "I never bought this". only on my own sales
  .post('/disputes', validate('json', newDisputeSchema), async (c) => {
    const { saleId, reason } = c.req.valid('json');
    const customerId = myCustomerId(c);
    const sale = await queryOne<{ saleId: number }>(
      `SELECT cs.sale_id FROM credit_sales cs
         JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
        WHERE cs.sale_id = ? AND sc.customer_id = ?`,
      [saleId, customerId],
    );
    if (!sale) throw notFound('Sale');
    const r = await withConn(c.get('user').fullName, (conn) =>
      execute(
        'INSERT INTO disputes (sale_id, raised_by_customer_id, reason) VALUES (?, ?, ?)',
        [saleId, customerId, reason],
        conn,
      ),
    );
    return c.json({ disputeId: r.insertId }, 201);
  })

  // POST /pay - bKash / Nagad / Rocket PROTOTYPE. no real money moves.
  // we pretend the wallet said yes, make up a TrxID, and record it like a normal payment
  // with the shop owner as the receiver (sp_record_payment wants someone from the shop)
  .post('/pay', validate('json', portalPaySchema), async (c) => {
    const { shopCustomerId, amount, method } = c.req.valid('json');
    const acct = await myAccount(shopCustomerId, myCustomerId(c));
    const shop = await queryOne<{ ownerUserId: number; status: string }>(
      'SELECT owner_user_id, status FROM shops WHERE shop_id = ?',
      [acct.shopId],
    );
    if (shop?.status !== 'active')
      throw new AppError(422, 'BUSINESS_RULE', 'This shop is not taking payments right now');

    const prefix = { bkash: 'BK', nagad: 'NG', rocket: 'RK' }[method];
    const trxRef = prefix + randomBytes(5).toString('hex').toUpperCase();
    const paymentId = await withConn(c.get('user').fullName, (conn) =>
      callProc<number>(conn, 'sp_record_payment', [
        shopCustomerId,
        amount,
        method,
        trxRef,
        shop.ownerUserId,
      ]),
    );
    return c.json(
      { paymentId, trxRef, amount, method, allocations: await paymentAllocations(paymentId) },
      201,
    );
  });
