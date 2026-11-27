-- =====================================================================
--  DokanKhata: the 17 critical queries
--  File: queries.sql
--
--  Each query is OWNED by the member whose page shows it (vertical
--  slices, see docs/ASSIGNMENTS.md). Workflow for every query:
--    1. Write and test it here in phpMyAdmin against the seed data.
--    2. Write down what the seed data returns (EXPECT) so a reviewer can check.
--    3. Copy it into the API route with ? placeholders (never string-build).
--    4. Keep this file and the API copy in sync.
--
--  Use @shop_id / @customer_id variables while testing here; the API
--  passes them as ? parameters.
--
--  Status:  [x] done   [ ] todo
--    [x] Q1  Aging report ..................... Member 4 (example by Member 1)
--    [ ] Q2  Over-limit customers ............. Member 3
--    [ ] Q3  Cross-shop exposure (3+ shops) ... Member 1
--    [ ] Q4  Vanished debtors ................. Member 3
--    [ ] Q5  Trust score inputs ............... Member 4
--    [ ] Q6  FIFO trace for a payment ......... Member 2
--    [ ] Q7  Running statement ................ Member 2
--    [ ] Q8  Monthly trend with LAG() ......... Member 4
--    [ ] Q9  Festival (Eid/Puja) credit spike . Member 4
--    [ ] Q10 Top debtors per shop (RANK) ...... Member 4
--    [ ] Q11 Repeat promise breakers .......... Member 3
--    [ ] Q12 Guarantor risk (self-join) ....... Member 3
--    [ ] Q13 Staff red flags .................. Member 4
--    [ ] Q14 Area risk ........................ Member 1
--    [ ] Q15 Credit products .................. Member 4
--    [ ] Q16 Days sales outstanding ........... Member 3
--    [ ] Q17 Perfect payers ................... Member 4
-- =====================================================================

USE dokankhata;
SET @shop_id = 1;
SET @customer_id = 2;


-- ---------------------------------------------------------------------
-- Q1. Aging report: how much each customer owes, split by lateness.
-- Owner: Member 4 (written by Member 1 as the example)
-- Page : Reports > Aging        API: GET /api/shops/:shopId/reports/aging
-- Technique: conditional aggregation (SUM(CASE ...)), DATEDIFF via the
--            view's days_overdue column, HAVING to drop settled accounts.
-- Shop totals come straight from the view v_aging.
-- EXPECT (seed, shop 1): one row per customer who still owes money,
--        biggest 90+ first; the column totals equal v_aging for shop 1.
-- ---------------------------------------------------------------------
SELECT c.customer_id,
       c.full_name,
       c.phone,
       SUM(CASE WHEN sb.days_overdue = 0              THEN sb.balance ELSE 0 END) AS not_yet_due,
       SUM(CASE WHEN sb.days_overdue BETWEEN 1 AND 30  THEN sb.balance ELSE 0 END) AS overdue_1_30,
       SUM(CASE WHEN sb.days_overdue BETWEEN 31 AND 60 THEN sb.balance ELSE 0 END) AS overdue_31_60,
       SUM(CASE WHEN sb.days_overdue BETWEEN 61 AND 90 THEN sb.balance ELSE 0 END) AS overdue_61_90,
       SUM(CASE WHEN sb.days_overdue > 90             THEN sb.balance ELSE 0 END) AS overdue_90_plus,
       SUM(sb.balance)                                                             AS total_outstanding,
       MAX(sb.days_overdue)                                                        AS max_days_overdue
FROM v_sale_balance sb
JOIN customers c ON c.customer_id = sb.customer_id
WHERE sb.shop_id = @shop_id
  AND sb.balance > 0
GROUP BY c.customer_id, c.full_name, c.phone
HAVING total_outstanding > 0
ORDER BY overdue_90_plus DESC, overdue_61_90 DESC, total_outstanding DESC;

-- Shop-level totals (the stacked bar on top of the page)
SELECT * FROM v_aging WHERE shop_id = @shop_id;


-- ---------------------------------------------------------------------
-- Q2. Over-limit customers: accounts whose balance is above their limit.
-- Owner: Member 3   Page: Shop dashboard / Customers filter
-- Technique: view + JOIN + HAVING (or WHERE on the view)
-- Hint: v_customer_balance has balance and credit_limit already.
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q3. Cross-shop exposure: customers who owe 3 or more shops at once.
-- Owner: Member 1   Page: Admin dashboard
-- Technique: GROUP BY customer, HAVING COUNT(DISTINCT shop_id) >= 3
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q4. Vanished debtors: still owe money, no purchase AND no payment in 60 days.
-- Owner: Member 3   Page: Shop dashboard
-- Technique: anti-join with NOT EXISTS (two of them)
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q5. Trust score inputs: on-time ratio and average days late per customer.
-- Owner: Member 4   Page: Portal > My trust score
-- Technique: aggregates over v_sale_balance (last_paid_at vs due_date).
-- Must match what sp_calculate_trust_score computes; compare with
-- customer_trust_scores for a few customers.
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q6. FIFO trace: which sales did payment X clear, and how much of each?
-- Owner: Member 2   Page: Payment history / Record payment receipt
-- Technique: M:N JOIN payments -> payment_allocations -> credit_sales
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q7. Running statement: one account's ledger with a running balance.
-- Owner: Member 2   Page: Customer ledger, Portal > My statement
-- Technique: UNION ALL of sales (+), payments (-), adjustments (-),
--            then SUM(amount) OVER (ORDER BY happened_at, sort_key)
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q8. Monthly trend: credit given vs collected per month, with change.
-- Owner: Member 4   Page: Reports > Collection trends
-- Technique: CTE per month + LAG() OVER (ORDER BY month)
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q9. Festival spike: credit in the 14 days before each festival vs the
--     shop's average 14-day credit.
-- Owner: Member 4   Page: Reports > Collection trends (callout)
-- Technique: JOIN festivals (reference table) with a date range,
--            compare against an average from a derived table.
-- NOTE: the seed covers ~5 months back from import day. Only festivals
--       inside that window will have data; check which ones do.
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q10. Top 10 debtors at each shop.
-- Owner: Member 4   Page: Reports > Top debtors
-- Technique: RANK() OVER (PARTITION BY shop_id ORDER BY balance DESC)
--            in a derived table, then WHERE rnk <= 10
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q11. Repeat promise breakers: 2 or more broken promises.
-- Owner: Member 3   Page: Promises
-- Technique: GROUP BY + HAVING COUNT(*) >= 2
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q12. Guarantor risk: guarantors whose guaranteed accounts are overdue.
-- Owner: Member 3   Page: Add/edit customer (warning)
-- Technique: self-join on customers through customer_guarantors
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q13. Staff red flags: per staff member, credit given vs collected,
--      disputed sales ratio, credit given to blocked customers.
-- Owner: Member 4   Page: Reports > Staff performance
-- Technique: multi-table JOIN, ratios, conditional aggregation
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q14. Area risk: overdue rate by area, thana and district.
-- Owner: Member 1   Page: Admin > Area risk
-- Technique: hierarchy JOIN (shops -> areas) + aggregation
--            (optional: GROUP BY ... WITH ROLLUP for subtotals)
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q15. Credit products: what is bought most on baki, by product and category.
-- Owner: Member 4   Page: Reports > Credit by product
-- Technique: JOIN credit_sale_items -> shop_products -> products -> categories
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q16. Days sales outstanding: average days a shop waits to be paid.
-- Owner: Member 3   Page: Shop dashboard
-- Technique: derived metric over paid sales (last_paid_at - sold_at)
-- ---------------------------------------------------------------------
-- TODO


-- ---------------------------------------------------------------------
-- Q17. Perfect payers: 6+ months of history, never late, nothing overdue.
-- Owner: Member 4   Page: Portal > My trust score (badge)
-- Technique: NOT EXISTS + date range
-- ---------------------------------------------------------------------
-- TODO
