// reports, mounted at /api/shops/:shopId/reports
// the same SQL is in db/database/queries.sql with notes, keep both in sync
import { Hono } from 'hono';
import { z } from 'zod';
import { dateRangeQuery } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { query, queryOne } from '../db';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

export const reportRoutes = new Hono<AppEnv>()
  // GET /aging (Q1) - who owes what, split by how late it is
  .get('/aging', async (c) => {
    const shopId = c.get('shop').shopId;
    const [totals, rows] = await Promise.all([
      queryOne<{
        notYetDue: number;
        overdue130: number;
        overdue3160: number;
        overdue6190: number;
        overdue90Plus: number;
        totalOutstanding: number;
      }>(
        `SELECT not_yet_due, overdue_1_30, overdue_31_60, overdue_61_90, overdue_90_plus, total_outstanding
           FROM v_aging WHERE shop_id = ?`,
        [shopId],
      ),
      query<{
        shopCustomerId: number;
        customerId: number;
        fullName: string;
        phone: string;
        notYetDue: number;
        overdue130: number;
        overdue3160: number;
        overdue6190: number;
        overdue90Plus: number;
        totalOutstanding: number;
        maxDaysOverdue: number;
      }>(
        `SELECT sb.shop_customer_id, c.customer_id, c.full_name, c.phone,
                SUM(CASE WHEN sb.days_overdue = 0              THEN sb.balance ELSE 0 END) AS not_yet_due,
                SUM(CASE WHEN sb.days_overdue BETWEEN 1 AND 30  THEN sb.balance ELSE 0 END) AS overdue_1_30,
                SUM(CASE WHEN sb.days_overdue BETWEEN 31 AND 60 THEN sb.balance ELSE 0 END) AS overdue_31_60,
                SUM(CASE WHEN sb.days_overdue BETWEEN 61 AND 90 THEN sb.balance ELSE 0 END) AS overdue_61_90,
                SUM(CASE WHEN sb.days_overdue > 90             THEN sb.balance ELSE 0 END) AS overdue_90_plus,
                SUM(sb.balance)                                                             AS total_outstanding,
                MAX(sb.days_overdue)                                                        AS max_days_overdue
           FROM v_sale_balance sb
           JOIN customers c ON c.customer_id = sb.customer_id
          WHERE sb.shop_id = ? AND sb.balance > 0
          GROUP BY sb.shop_customer_id, c.customer_id, c.full_name, c.phone
         HAVING total_outstanding > 0
          ORDER BY overdue_90_plus DESC, overdue_61_90 DESC, overdue_31_60 DESC, total_outstanding DESC`,
        [shopId],
      ),
    ]);
    return c.json({ totals: totals!, rows });
  })

  // GET /trend?months=6 (Q8) - credit given vs collected each month, with change from last month.
  // the recursive CTE makes a row for every month so months with nothing still show up as 0
  .get(
    '/trend',
    validate('query', z.object({ months: z.coerce.number().int().min(2).max(24).default(6) })),
    async (c) => {
      const { months } = c.req.valid('query');
      const shopId = c.get('shop').shopId;
      const rows = await query<{
        month: string;
        creditGiven: number;
        salesCount: number;
        collected: number;
        net: number;
        creditChangePct: number | null;
        collectedChangePct: number | null;
      }>(
        `WITH RECURSIVE months AS (
         SELECT CAST(DATE_FORMAT(CURDATE() - INTERVAL ? MONTH, '%Y-%m-01') AS DATE) AS m
         UNION ALL
         SELECT m + INTERVAL 1 MONTH FROM months WHERE m < DATE_FORMAT(CURDATE(), '%Y-%m-01')
       ),
       credit AS (
         SELECT CAST(DATE_FORMAT(cs.sold_at, '%Y-%m-01') AS DATE) AS m,
                SUM(cs.total_amount) AS amount, COUNT(*) AS n
           FROM credit_sales cs
           JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
          WHERE sc.shop_id = ?
          GROUP BY 1
       ),
       collected AS (
         SELECT CAST(DATE_FORMAT(p.paid_at, '%Y-%m-01') AS DATE) AS m, SUM(p.amount) AS amount
           FROM payments p
           JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
          WHERE sc.shop_id = ?
          GROUP BY 1
       ),
       joined AS (
         SELECT mo.m AS month, COALESCE(cr.amount, 0) AS credit_given, COALESCE(cr.n, 0) AS sales_count,
                COALESCE(co.amount, 0) AS collected
           FROM months mo
           LEFT JOIN credit cr    ON cr.m = mo.m
           LEFT JOIN collected co ON co.m = mo.m
       )
       SELECT month, credit_given, sales_count, collected, credit_given - collected AS net,
              ROUND(100 * (credit_given - LAG(credit_given) OVER (ORDER BY month))
                    / NULLIF(LAG(credit_given) OVER (ORDER BY month), 0), 1) AS credit_change_pct,
              ROUND(100 * (collected - LAG(collected) OVER (ORDER BY month))
                    / NULLIF(LAG(collected) OVER (ORDER BY month), 0), 1) AS collected_change_pct
         FROM joined
        ORDER BY month`,
        [months - 1, shopId, shopId],
      );
      return c.json(rows);
    },
  )

  // GET /festival (Q9) - credit in the 14 days before each festival compared with the 4 weeks
  // before that (per 14 days), so a shop that's still growing doesn't make early festivals look small
  .get('/festival', async (c) => {
    const rows = await query<{
      festivalId: number;
      name: string;
      banglaName: string | null;
      festivalDate: string;
      creditBefore: number;
      salesBefore: number;
      normal14Days: number;
      timesNormal: number | null;
    }>(
      `SELECT f.festival_id, f.name, f.bangla_name, f.festival_date,
               SUM(CASE WHEN cs.sold_at >= f.festival_date - INTERVAL 14 DAY THEN cs.total_amount ELSE 0 END) AS credit_before,
               SUM(cs.sold_at >= f.festival_date - INTERVAL 14 DAY)                                       AS sales_before,
               ROUND(SUM(CASE WHEN cs.sold_at < f.festival_date - INTERVAL 14 DAY THEN cs.total_amount ELSE 0 END) / 2, 2)
                                                                                                          AS normal_14_days,
               ROUND(SUM(CASE WHEN cs.sold_at >= f.festival_date - INTERVAL 14 DAY THEN cs.total_amount ELSE 0 END)
                     / NULLIF(SUM(CASE WHEN cs.sold_at < f.festival_date - INTERVAL 14 DAY THEN cs.total_amount ELSE 0 END) / 2, 0), 2)
                                                                                                          AS times_normal
        FROM festivals f
        JOIN credit_sales cs   ON cs.sold_at >= f.festival_date - INTERVAL 42 DAY AND cs.sold_at < f.festival_date
        JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id AND sc.shop_id = ?
        WHERE f.festival_date <= CURDATE()
          AND f.festival_date - INTERVAL 42 DAY >= (SELECT DATE(MIN(cs2.sold_at))
                                                      FROM credit_sales cs2
                                                      JOIN shop_customers sc2 ON sc2.shop_customer_id = cs2.shop_customer_id
                                                     WHERE sc2.shop_id = ?)
        GROUP BY f.festival_id, f.name, f.bangla_name, f.festival_date
        ORDER BY f.festival_date`,
      [c.get('shop').shopId, c.get('shop').shopId],
    );
    return c.json(rows);
  })

  // GET /top-debtors?limit=10 (Q10) - RANK() per shop, then keep this shop's top N
  .get(
    '/top-debtors',
    validate('query', z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) })),
    async (c) => {
      const { limit } = c.req.valid('query');
      const rows = await query<{
        rnk: number;
        shopCustomerId: number;
        fullName: string;
        phone: string;
        balance: number;
        creditLimit: number;
        maxDaysOverdue: number;
        oldestUnpaidDue: string | null;
        unpaidSales: number;
        trustScore: number | null;
      }>(
        `SELECT r.rnk, r.shop_customer_id, r.full_name, r.phone, r.balance, r.credit_limit,
              r.max_days_overdue, r.oldest_unpaid_due, r.unpaid_sales, r.trust_score
         FROM (
           SELECT b.shop_id, b.shop_customer_id, b.full_name, b.phone, b.balance, b.credit_limit,
                  b.max_days_overdue, b.oldest_unpaid_due, b.unpaid_sales, t.score AS trust_score,
                  RANK() OVER (PARTITION BY b.shop_id ORDER BY b.balance DESC) AS rnk
             FROM v_customer_balance b
             LEFT JOIN customer_trust_scores t ON t.customer_id = b.customer_id
            WHERE b.balance > 0
         ) AS r
        WHERE r.shop_id = ? AND r.rnk <= ?
        ORDER BY r.rnk, r.full_name`,
        [c.get('shop').shopId, limit],
      );
      return c.json(rows);
    },
  )

  // GET /staff (Q13) - per person: credit given, money collected, and how many of their sales got
  // disputed. red flag = at least 2 disputed sales AND a dispute rate over double the shop's average.
  // sales_to_blocked is just for info: the trigger already stops sales on blocked accounts, so these
  // are sales to people who got blocked later (worth knowing who keeps lending to bad payers)
  .get(
    '/staff',
    requireShopAccess({ manager: true }),
    validate('query', z.object(dateRangeQuery)),
    async (c) => {
      const { from, to } = c.req.valid('query');
      const shopId = c.get('shop').shopId;
      const rows = await query<{
        userId: number;
        fullName: string;
        role: string;
        sales: number;
        creditGiven: number;
        collected: number;
        disputedSales: number;
        disputePct: number;
        salesToBlocked: number;
        shopAvgDisputePct: number;
        redFlag: number;
      }>(
        `SELECT x.*,
              ROUND(AVG(x.dispute_pct) OVER (), 1) AS shop_avg_dispute_pct,
              (x.disputed_sales >= 2 AND x.dispute_pct > 2 * AVG(x.dispute_pct) OVER ()) AS red_flag
         FROM (
           SELECT u.user_id, u.full_name,
                  IF(s.owner_user_id = u.user_id, 'owner', COALESCE(ss.staff_role, 'former staff')) AS role,
                  COUNT(cs.sale_id)                                          AS sales,
                  COALESCE(SUM(cs.total_amount), 0)                          AS credit_given,
                  (SELECT COALESCE(SUM(p.amount), 0)
                     FROM payments p
                     JOIN shop_customers sc2 ON sc2.shop_customer_id = p.shop_customer_id
                    WHERE p.received_by = u.user_id AND sc2.shop_id = s.shop_id
                      AND p.paid_at >= COALESCE(?, '1000-01-01') AND p.paid_at < COALESCE(? + INTERVAL 1 DAY, '9999-12-31')
                  )                                                          AS collected,
                  COUNT(d.sale_id)                                           AS disputed_sales,
                  ROUND(100 * COUNT(d.sale_id) / NULLIF(COUNT(cs.sale_id), 0), 1) AS dispute_pct,
                  SUM(sc.status = 'blocked')                                 AS sales_to_blocked
             FROM credit_sales cs
             JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
             JOIN shops s           ON s.shop_id = sc.shop_id
             JOIN users u           ON u.user_id = cs.staff_user_id
             LEFT JOIN shop_staff ss ON ss.shop_id = s.shop_id AND ss.user_id = u.user_id AND ss.left_on IS NULL
             LEFT JOIN (SELECT DISTINCT sale_id FROM disputes) d ON d.sale_id = cs.sale_id
            WHERE sc.shop_id = ?
              AND cs.sold_at >= COALESCE(?, '1000-01-01') AND cs.sold_at < COALESCE(? + INTERVAL 1 DAY, '9999-12-31')
            GROUP BY u.user_id, u.full_name, s.owner_user_id, s.shop_id, ss.staff_role
         ) AS x
        ORDER BY red_flag DESC, x.credit_given DESC`,
        [from ?? null, to ?? null, shopId, from ?? null, to ?? null],
      );
      return c.json(rows.map((r) => ({ ...r, redFlag: r.redFlag === 1 })));
    },
  )

  // GET /products?from=&to=&limit= (Q15) - what people buy on baki, by product and by category
  .get(
    '/products',
    validate(
      'query',
      z.object({ ...dateRangeQuery, limit: z.coerce.number().int().min(1).max(100).default(20) }),
    ),
    async (c) => {
      const { from, to, limit } = c.req.valid('query');
      const shopId = c.get('shop').shopId;
      const params = [shopId, from ?? null, to ?? null];
      const sqlFrom = `
          FROM credit_sale_items i
          JOIN credit_sales cs   ON cs.sale_id = i.sale_id
          JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
          JOIN shop_products sp  ON sp.shop_product_id = i.shop_product_id
          JOIN products p        ON p.product_id = sp.product_id
          JOIN categories cat    ON cat.category_id = p.category_id
         WHERE sc.shop_id = ?
           AND cs.sold_at >= COALESCE(?, '1000-01-01') AND cs.sold_at < COALESCE(? + INTERVAL 1 DAY, '9999-12-31')`;
      const [products, categories] = await Promise.all([
        query<{
          productId: number;
          name: string;
          banglaName: string | null;
          brand: string;
          unit: string;
          category: string;
          qty: number;
          amount: number;
          sales: number;
          customers: number;
        }>(
          `SELECT p.product_id, p.name, p.bangla_name, p.brand, p.unit, cat.name AS category,
                  SUM(i.qty) AS qty, SUM(i.line_total) AS amount,
                  COUNT(DISTINCT cs.sale_id) AS sales, COUNT(DISTINCT cs.shop_customer_id) AS customers
           ${sqlFrom}
            GROUP BY p.product_id, p.name, p.bangla_name, p.brand, p.unit, cat.name
            ORDER BY amount DESC
            LIMIT ?`,
          [...params, limit],
        ),
        query<{ category: string; amount: number; sales: number; sharePct: number }>(
          `SELECT cat.name AS category, SUM(i.line_total) AS amount, COUNT(DISTINCT cs.sale_id) AS sales,
                  ROUND(100 * SUM(i.line_total) / SUM(SUM(i.line_total)) OVER (), 1) AS share_pct
           ${sqlFrom}
            GROUP BY cat.name
            ORDER BY amount DESC`,
          params,
        ),
      ]);
      return c.json({ products, categories });
    },
  );
