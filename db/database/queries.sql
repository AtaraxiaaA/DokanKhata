-- =====================================================================
--  DokanKhata: the 17 main queries
--  File: queries.sql
--
--  Each one is used by an API route (file + endpoint written above it),
--  so if you change one here, change it there too. The API versions use
--  ? instead of the @variables below.
--
--  To try them: phpMyAdmin > dokankhata > SQL, paste the SET lines and
--  the query you want, press Go. EXPECT notes are what the seed data
--  gives right after a fresh import (npm run db:reset).
--
--  Q1  Aging report ........................ reports.ts   GET /reports/aging
--  Q2  Over-limit customers ................ settings.ts  GET /settings/dashboard
--  Q3  Customers owing 3+ shops ............ admin.ts     GET /admin/reports/exposure
--  Q4  Vanished debtors .................... settings.ts  GET /settings/dashboard
--  Q5  On-time ratio and days late ......... portal.ts    GET /portal/trust
--  Q6  Which sales a payment cleared ....... payments.ts  GET /payments/:paymentId
--  Q7  Running statement ................... lib/statement.ts (ledger + portal)
--  Q8  Monthly trend with LAG() ............ reports.ts   GET /reports/trend
--  Q9  Festival credit spike ............... reports.ts   GET /reports/festival
--  Q10 Top 10 debtors per shop (RANK) ...... reports.ts   GET /reports/top-debtors
--  Q11 Repeat promise breakers ............. promises.ts  GET /promises/repeat-breakers
--  Q12 Guarantor risk (self join) .......... customers.ts GET /customers/guarantor-risk
--  Q13 Staff red flags ..................... reports.ts   GET /reports/staff
--  Q14 Area risk ........................... admin.ts     GET /admin/reports/area-risk
--  Q15 What sells on baki .................. reports.ts   GET /reports/products
--  Q16 Days sales outstanding .............. settings.ts  GET /settings/dashboard
--  Q17 Perfect payers ...................... portal.ts    GET /portal/trust
-- =====================================================================

USE dokankhata;
SET @shop_id = 1;          -- Rahim General Store
SET @customer_id = 2;      -- Mohammad Jahangir Gazi (the demo customer login)
SET @shop_customer_id = 19; -- Ruma Begum at Rahim General Store (blocked, 68 days late)
SET @payment_id = 1;


-- ---------------------------------------------------------------------
-- Q1. Aging report: what each customer owes at a shop, split by how late it is.
-- Conditional aggregation (SUM(CASE ...)) over v_sale_balance, which already
-- works out each sale's balance and days overdue. HAVING drops settled accounts.
-- EXPECT (shop 1): 27 customers, Ruma Begum first with Tk 2,103.50 in 31-60
--        and Tk 212.25 in 61-90. The column totals match v_aging for shop 1.
-- ---------------------------------------------------------------------
SELECT sb.shop_customer_id, c.full_name, c.phone,
       SUM(CASE WHEN sb.days_overdue = 0              THEN sb.balance ELSE 0 END) AS not_yet_due,
       SUM(CASE WHEN sb.days_overdue BETWEEN 1 AND 30  THEN sb.balance ELSE 0 END) AS overdue_1_30,
       SUM(CASE WHEN sb.days_overdue BETWEEN 31 AND 60 THEN sb.balance ELSE 0 END) AS overdue_31_60,
       SUM(CASE WHEN sb.days_overdue BETWEEN 61 AND 90 THEN sb.balance ELSE 0 END) AS overdue_61_90,
       SUM(CASE WHEN sb.days_overdue > 90             THEN sb.balance ELSE 0 END) AS overdue_90_plus,
       SUM(sb.balance)                                                             AS total_outstanding,
       MAX(sb.days_overdue)                                                        AS max_days_overdue
FROM v_sale_balance sb
JOIN customers c ON c.customer_id = sb.customer_id
WHERE sb.shop_id = @shop_id AND sb.balance > 0
GROUP BY sb.shop_customer_id, c.full_name, c.phone
HAVING total_outstanding > 0
ORDER BY overdue_90_plus DESC, overdue_61_90 DESC, overdue_31_60 DESC, total_outstanding DESC;

-- shop totals for the bar at the top of the page
SELECT * FROM v_aging WHERE shop_id = @shop_id;


-- ---------------------------------------------------------------------
-- Q2. Over-limit customers: balance is higher than their credit limit.
-- Trigger T1 stops a new sale from crossing the limit, so this only happens
-- when the owner lowers someone's limit after they already owe more.
-- EXPECT: 0 rows in the seed. To see it work, lower a limit first:
--         UPDATE shop_customers SET credit_limit = 1000 WHERE shop_customer_id = 19;
-- ---------------------------------------------------------------------
SELECT b.shop_customer_id, b.full_name, b.phone, b.balance, b.credit_limit,
       b.balance - b.credit_limit AS over_by, b.status
FROM v_customer_balance b
WHERE b.shop_id = @shop_id AND b.balance > b.credit_limit
ORDER BY over_by DESC;


-- ---------------------------------------------------------------------
-- Q3. Cross-shop exposure: people who owe money at 3 or more shops at once.
-- GROUP BY the customer across every shop, HAVING COUNT(DISTINCT shop).
-- EXPECT: 1 row, Mohammad Aminul Mondal owing 3 shops (Tk 1,849.30).
--         With >= 2 there are more.
-- ---------------------------------------------------------------------
SELECT c.customer_id, c.full_name, c.phone,
       COUNT(DISTINCT sb.shop_id)                                    AS shops_owed,
       SUM(sb.balance)                                               AS total_outstanding,
       SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance ELSE 0 END) AS overdue_amount,
       MAX(sb.days_overdue)                                          AS max_days_overdue,
       GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ')  AS shop_names,
       t.score                                                       AS trust_score
FROM v_sale_balance sb
JOIN customers c ON c.customer_id = sb.customer_id
JOIN shops s     ON s.shop_id = sb.shop_id
LEFT JOIN customer_trust_scores t ON t.customer_id = c.customer_id
WHERE sb.balance > 0
GROUP BY c.customer_id, c.full_name, c.phone, t.score
HAVING COUNT(DISTINCT sb.shop_id) >= 3
ORDER BY shops_owed DESC, total_outstanding DESC;


-- ---------------------------------------------------------------------
-- Q4. Vanished debtors: still owe money, but no purchase and no payment
-- in the last 60 days. Two anti-joins with NOT EXISTS.
-- EXPECT: none at shop 1. Shops 2, 4 and 8 have one each (SET @shop_id = 2).
-- ---------------------------------------------------------------------
SELECT b.shop_customer_id, b.full_name, b.phone, b.balance, b.last_purchase_at,
       (SELECT MAX(p.paid_at) FROM payments p WHERE p.shop_customer_id = b.shop_customer_id) AS last_payment_at
FROM v_customer_balance b
WHERE b.shop_id = @shop_id AND b.balance > 0
  AND NOT EXISTS (SELECT 1 FROM credit_sales cs
                   WHERE cs.shop_customer_id = b.shop_customer_id AND cs.sold_at >= NOW() - INTERVAL 60 DAY)
  AND NOT EXISTS (SELECT 1 FROM payments p
                   WHERE p.shop_customer_id = b.shop_customer_id AND p.paid_at >= NOW() - INTERVAL 60 DAY)
ORDER BY b.balance DESC;


-- ---------------------------------------------------------------------
-- Q5. Trust score inputs: per shop, how many sales were settled, how many on
-- time, and the average days late (last 12 months). A sale is on time when its
-- last payment came on or before the due date.
-- EXPECT (customer 2): 3 shops, 28 settled sales, all on time, 0 days late.
--        Matches customer_trust_scores (score 95).
-- ---------------------------------------------------------------------
SELECT sb.shop_id, s.name AS shop_name,
       COUNT(*)                                                                         AS settled,
       SUM(COALESCE(CAST(sb.last_paid_at AS DATE), sb.due_date) <= sb.due_date)         AS on_time,
       ROUND(100 * SUM(COALESCE(CAST(sb.last_paid_at AS DATE), sb.due_date) <= sb.due_date) / COUNT(*), 1) AS on_time_pct,
       ROUND(AVG(GREATEST(DATEDIFF(sb.last_paid_at, sb.due_date), 0)), 1)               AS avg_days_late
FROM v_sale_balance sb
JOIN shops s ON s.shop_id = sb.shop_id
WHERE sb.customer_id = @customer_id AND sb.status = 'paid'
  AND sb.sold_at >= NOW() - INTERVAL 12 MONTH
GROUP BY sb.shop_id, s.name
ORDER BY settled DESC;


-- ---------------------------------------------------------------------
-- Q6. FIFO trace: which sales payment X cleared, and how much went to each.
-- payment_allocations is the M:N table between payments and credit_sales.
-- EXPECT (payment 1): the oldest unpaid sale(s) of that account, oldest first,
--        and the amounts add up to the payment amount.
-- ---------------------------------------------------------------------
SELECT pa.sale_id, cs.sold_at, cs.due_date, cs.total_amount, pa.amount AS paid_from_this_payment, cs.status
FROM payment_allocations pa
JOIN credit_sales cs ON cs.sale_id = pa.sale_id
WHERE pa.payment_id = @payment_id
ORDER BY cs.sold_at, cs.sale_id;


-- ---------------------------------------------------------------------
-- Q7. Running statement: one account's ledger with a running balance.
-- UNION ALL of sales (+), payments (-) and adjustments (-), then
-- SUM() OVER (ORDER BY ...) for the balance after each line.
-- EXPECT (account 19): the last running_balance is 2315.75, the same as
--        her balance in v_customer_balance.
-- ---------------------------------------------------------------------
SELECT t.happened_at, t.kind, t.ref_id, t.description, t.debit, t.credit,
       SUM(t.debit - t.credit) OVER (ORDER BY t.happened_at, t.sort_key, t.ref_id) AS running_balance
FROM (
  SELECT cs.sold_at AS happened_at, 'sale' AS kind, cs.sale_id AS ref_id, 1 AS sort_key,
         CONCAT('Credit sale #', cs.sale_id, IFNULL(CONCAT(' · ', cs.note), '')) AS description,
         cs.total_amount AS debit, 0 AS credit
    FROM credit_sales cs
   WHERE cs.shop_customer_id = @shop_customer_id
  UNION ALL
  SELECT p.paid_at, 'payment', p.payment_id, 2,
         CONCAT('Payment by ', p.method, IFNULL(CONCAT(' · ', p.trx_ref), '')),
         0, p.amount
    FROM payments p
   WHERE p.shop_customer_id = @shop_customer_id
  UNION ALL
  SELECT a.created_at, 'adjustment', a.adjustment_id, 3,
         CONCAT(REPLACE(a.adj_type, '_', ' '), ' on sale #', a.sale_id, ' · ', a.reason),
         0, a.amount
    FROM adjustments a
    JOIN credit_sales cs ON cs.sale_id = a.sale_id
   WHERE cs.shop_customer_id = @shop_customer_id
) AS t
ORDER BY t.happened_at, t.sort_key, t.ref_id;


-- ---------------------------------------------------------------------
-- Q8. Monthly trend: credit given vs collected each month, with the % change
-- from the month before. The recursive CTE makes one row per month (so a month
-- with no sales still shows 0), then LAG() looks at the previous row.
-- EXPECT (shop 1, 6 months): Jun is 0 (the seed starts in July), then credit
--        grows from Tk 8,579.50 in Jul; collected follows a few weeks behind.
-- ---------------------------------------------------------------------
WITH RECURSIVE months AS (
  SELECT CAST(DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01') AS DATE) AS m
  UNION ALL
  SELECT m + INTERVAL 1 MONTH FROM months WHERE m < DATE_FORMAT(CURDATE(), '%Y-%m-01')
),
credit AS (
  SELECT CAST(DATE_FORMAT(cs.sold_at, '%Y-%m-01') AS DATE) AS m, SUM(cs.total_amount) AS amount, COUNT(*) AS n
    FROM credit_sales cs
    JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
   WHERE sc.shop_id = @shop_id
   GROUP BY 1
),
collected AS (
  SELECT CAST(DATE_FORMAT(p.paid_at, '%Y-%m-01') AS DATE) AS m, SUM(p.amount) AS amount
    FROM payments p
    JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
   WHERE sc.shop_id = @shop_id
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
ORDER BY month;


-- ---------------------------------------------------------------------
-- Q9. Festival spike: credit in the 14 days before each festival, compared
-- with a normal 14 days at the same shop (its average credit per day x 14).
-- Only festivals inside the period the shop has sales for are counted.
-- EXPECT (shop 1): Durga Puja 2026 only (Eid falls outside the seed's 5 months),
--        about 1.35x normal. The seed has no planted spike, so it's mild.
-- ---------------------------------------------------------------------
SELECT f.name, f.bangla_name, f.festival_date,
       COALESCE(SUM(cs.total_amount), 0) AS credit_before,
       COUNT(cs.sale_id)                 AS sales_before,
       ROUND(base.per_day * 14, 2)       AS normal_14_days,
       ROUND(COALESCE(SUM(cs.total_amount), 0) / NULLIF(base.per_day * 14, 0), 2) AS times_normal
FROM festivals f
CROSS JOIN (
  SELECT SUM(cs.total_amount) / (DATEDIFF(MAX(cs.sold_at), MIN(cs.sold_at)) + 1) AS per_day,
         MIN(cs.sold_at) AS first_sale, MAX(cs.sold_at) AS last_sale
    FROM credit_sales cs
    JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
   WHERE sc.shop_id = @shop_id
) AS base
LEFT JOIN (credit_sales cs JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id AND sc.shop_id = @shop_id)
       ON cs.sold_at >= f.festival_date - INTERVAL 14 DAY AND cs.sold_at < f.festival_date
WHERE f.festival_date - INTERVAL 14 DAY >= DATE(base.first_sale)
  AND f.festival_date <= DATE(base.last_sale) + INTERVAL 1 DAY
GROUP BY f.festival_id, f.name, f.bangla_name, f.festival_date, base.per_day
ORDER BY f.festival_date;


-- ---------------------------------------------------------------------
-- Q10. Top 10 debtors at each shop. RANK() OVER (PARTITION BY shop) ranks
-- everyone inside their own shop; the outer query keeps the top 10.
-- Remove the "r.shop_id = @shop_id AND" to see every shop's top 10 at once.
-- EXPECT (shop 1): 1 Ruma Begum Tk 2,315.75, 2 Zahid Islam Tk 1,933,
--        3 Puja Rani Roy Tk 1,383 ...
-- ---------------------------------------------------------------------
SELECT r.shop_name, r.rnk, r.full_name, r.phone, r.balance, r.credit_limit, r.max_days_overdue, r.trust_score
FROM (
  SELECT b.shop_id, b.shop_name, b.full_name, b.phone, b.balance, b.credit_limit, b.max_days_overdue,
         t.score AS trust_score,
         RANK() OVER (PARTITION BY b.shop_id ORDER BY b.balance DESC) AS rnk
    FROM v_customer_balance b
    LEFT JOIN customer_trust_scores t ON t.customer_id = b.customer_id
   WHERE b.balance > 0
) AS r
WHERE r.shop_id = @shop_id AND r.rnk <= 10
ORDER BY r.shop_id, r.rnk;


-- ---------------------------------------------------------------------
-- Q11. Repeat promise breakers: 2 or more broken promises at the shop.
-- EXPECT (shop 1): Mohammad Aminul Mondal and Rubel Hossain, 2 each.
-- ---------------------------------------------------------------------
SELECT sc.shop_customer_id, c.full_name, c.phone,
       COUNT(*) AS broken_count, SUM(pr.promised_amount) AS broken_amount,
       MAX(pr.promised_date) AS last_broken, b.balance
FROM promises pr
JOIN shop_customers sc    ON sc.shop_customer_id = pr.shop_customer_id
JOIN customers c          ON c.customer_id = sc.customer_id
JOIN v_customer_balance b ON b.shop_customer_id = sc.shop_customer_id
WHERE sc.shop_id = @shop_id AND pr.status = 'broken'
GROUP BY sc.shop_customer_id, c.full_name, c.phone, b.balance
HAVING COUNT(*) >= 2
ORDER BY broken_count DESC, broken_amount DESC;


-- ---------------------------------------------------------------------
-- Q12. Guarantor risk: guarantors whose guaranteed accounts are overdue.
-- Self join on customers: g is the guarantor, c is the person they vouched
-- for, linked through customer_guarantors.
-- EXPECT (shop 1): Mohammad Mizan Haque, guaranteeing Rubel Hossain (overdue).
-- ---------------------------------------------------------------------
SELECT g.customer_id AS guarantor_id, g.full_name AS guarantor_name, g.phone AS guarantor_phone,
       COUNT(*)                                                     AS guaranteed_accounts,
       SUM(b.max_days_overdue > 0)                                  AS overdue_accounts,
       SUM(CASE WHEN b.max_days_overdue > 0 THEN b.balance ELSE 0 END) AS overdue_balance,
       SUM(cg.guarantee_limit)                                      AS total_guaranteed,
       GROUP_CONCAT(CASE WHEN b.max_days_overdue > 0 THEN c.full_name END ORDER BY c.full_name SEPARATOR ', ')
                                                                    AS overdue_borrowers
FROM customer_guarantors cg
JOIN customers g          ON g.customer_id = cg.guarantor_customer_id
JOIN v_customer_balance b ON b.shop_customer_id = cg.shop_customer_id
JOIN customers c          ON c.customer_id = b.customer_id
WHERE b.shop_id = @shop_id
GROUP BY g.customer_id, g.full_name, g.phone
HAVING overdue_accounts > 0
ORDER BY overdue_balance DESC;


-- ---------------------------------------------------------------------
-- Q13. Staff red flags: per person, credit given, money collected, how many of
-- their sales got disputed, and sales to accounts that are blocked now.
-- Red flag = 2+ disputed sales AND a dispute rate over double the shop average
-- (AVG() OVER () gives the average across the rows without grouping again).
-- EXPECT (shop 1): Jamal Hossain 122 sales / 3 disputed (2.5%), Sumon Mia,
--        Rahim Uddin. Nobody is over 2x the average, so no flags in the seed.
-- ---------------------------------------------------------------------
SELECT x.*,
       ROUND(AVG(x.dispute_pct) OVER (), 1) AS shop_avg_dispute_pct,
       (x.disputed_sales >= 2 AND x.dispute_pct > 2 * AVG(x.dispute_pct) OVER ()) AS red_flag
FROM (
  SELECT u.user_id, u.full_name,
         IF(s.owner_user_id = u.user_id, 'owner', COALESCE(ss.staff_role, 'former staff')) AS role,
         COUNT(cs.sale_id)                 AS sales,
         COALESCE(SUM(cs.total_amount), 0) AS credit_given,
         (SELECT COALESCE(SUM(p.amount), 0)
            FROM payments p
            JOIN shop_customers sc2 ON sc2.shop_customer_id = p.shop_customer_id
           WHERE p.received_by = u.user_id AND sc2.shop_id = s.shop_id) AS collected,
         COUNT(d.sale_id)                  AS disputed_sales,
         ROUND(100 * COUNT(d.sale_id) / NULLIF(COUNT(cs.sale_id), 0), 1) AS dispute_pct,
         SUM(sc.status = 'blocked')        AS sales_to_blocked
    FROM credit_sales cs
    JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
    JOIN shops s           ON s.shop_id = sc.shop_id
    JOIN users u           ON u.user_id = cs.staff_user_id
    LEFT JOIN shop_staff ss ON ss.shop_id = s.shop_id AND ss.user_id = u.user_id AND ss.left_on IS NULL
    LEFT JOIN (SELECT DISTINCT sale_id FROM disputes) d ON d.sale_id = cs.sale_id
   WHERE sc.shop_id = @shop_id
   GROUP BY u.user_id, u.full_name, s.owner_user_id, s.shop_id, ss.staff_role
) AS x
ORDER BY red_flag DESC, x.credit_given DESC;


-- ---------------------------------------------------------------------
-- Q14. Area risk: how much of the money owed in each area is overdue.
-- Area -> thana -> district -> division join, then aggregate.
-- For thana or district level, group by fewer columns (the API has all three).
-- EXPECT: Agrabad (Chattogram) worst at about 47% overdue, then
--         Mohammadpur Town Hall about 31%.
-- ---------------------------------------------------------------------
SELECT a.division, a.district, a.thana, a.name AS area,
       COUNT(DISTINCT s.shop_id)                                              AS shops,
       COUNT(DISTINCT CASE WHEN sb.balance > 0 THEN sb.shop_customer_id END)  AS customers_owing,
       COALESCE(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0)         AS outstanding,
       COALESCE(SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END), 0)    AS overdue,
       ROUND(100 * SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END)
                 / NULLIF(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0), 1) AS overdue_pct
FROM areas a
JOIN shops s ON s.area_id = a.area_id
LEFT JOIN v_sale_balance sb ON sb.shop_id = s.shop_id
GROUP BY a.division, a.district, a.thana, a.name
ORDER BY overdue_pct DESC, overdue DESC;


-- ---------------------------------------------------------------------
-- Q15. What people buy on baki: by product, then by category with its share.
-- items -> shop_products -> products -> categories.
-- EXPECT (shop 1): Coarse Rice first (Tk 19,082), Rice & Grains the biggest
--        category at about 24%, Edible Oil next.
-- ---------------------------------------------------------------------
SELECT p.name, p.bangla_name, p.brand, p.unit, cat.name AS category,
       SUM(i.qty) AS qty, SUM(i.line_total) AS amount,
       COUNT(DISTINCT cs.sale_id) AS sales, COUNT(DISTINCT cs.shop_customer_id) AS customers
FROM credit_sale_items i
JOIN credit_sales cs   ON cs.sale_id = i.sale_id
JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
JOIN shop_products sp  ON sp.shop_product_id = i.shop_product_id
JOIN products p        ON p.product_id = sp.product_id
JOIN categories cat    ON cat.category_id = p.category_id
WHERE sc.shop_id = @shop_id
GROUP BY p.product_id, p.name, p.bangla_name, p.brand, p.unit, cat.name
ORDER BY amount DESC
LIMIT 20;

SELECT cat.name AS category, SUM(i.line_total) AS amount, COUNT(DISTINCT cs.sale_id) AS sales,
       ROUND(100 * SUM(i.line_total) / SUM(SUM(i.line_total)) OVER (), 1) AS share_pct
FROM credit_sale_items i
JOIN credit_sales cs   ON cs.sale_id = i.sale_id
JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
JOIN shop_products sp  ON sp.shop_product_id = i.shop_product_id
JOIN products p        ON p.product_id = sp.product_id
JOIN categories cat    ON cat.category_id = p.category_id
WHERE sc.shop_id = @shop_id
GROUP BY cat.name
ORDER BY amount DESC;


-- ---------------------------------------------------------------------
-- Q16. Days sales outstanding: on average, how many days after a sale the
-- shop gets fully paid (paid sales from the last 90 days).
-- EXPECT (shop 1): about 9.5 days over 234 paid sales.
-- ---------------------------------------------------------------------
SELECT ROUND(AVG(DATEDIFF(sb.last_paid_at, sb.sold_at)), 1) AS days_sales_outstanding,
       COUNT(*) AS paid_sales
FROM v_sale_balance sb
WHERE sb.shop_id = @shop_id AND sb.status = 'paid' AND sb.last_paid_at IS NOT NULL
  AND sb.sold_at >= NOW() - INTERVAL 90 DAY;


-- ---------------------------------------------------------------------
-- Q17. Perfect payers: been buying for 4+ months, never paid a sale late,
-- and nothing overdue right now. EXISTS for the history, NOT EXISTS for
-- any late sale. (The plan said 6 months, but the seed only goes back
-- about 5, so 4 for now. Change the INTERVAL when there's more data.)
-- EXPECT: 18 customers, including customer 2 (the demo login).
-- ---------------------------------------------------------------------
SELECT c.customer_id, c.full_name, c.phone,
       (SELECT MIN(sb.sold_at) FROM v_sale_balance sb WHERE sb.customer_id = c.customer_id) AS first_sale,
       t.score AS trust_score
FROM customers c
LEFT JOIN customer_trust_scores t ON t.customer_id = c.customer_id
WHERE EXISTS (SELECT 1 FROM v_sale_balance sb
               WHERE sb.customer_id = c.customer_id AND sb.sold_at <= NOW() - INTERVAL 4 MONTH)
  AND NOT EXISTS (SELECT 1 FROM v_sale_balance sb
                   WHERE sb.customer_id = c.customer_id
                     AND (sb.days_overdue > 0
                          OR (sb.last_paid_at IS NOT NULL AND CAST(sb.last_paid_at AS DATE) > sb.due_date)))
ORDER BY t.score DESC, c.full_name;
