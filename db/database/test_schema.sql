-- =====================================================================
--  DokanKhata: schema smoke test
--
--  Run this right after importing schema.sql, on the EMPTY database, to
--  check that every procedure, trigger and rule works on your XAMPP.
--  Afterwards, import schema.sql again before importing seed.sql.
--
--  phpMyAdmin > dokankhata > SQL tab:
--    PART 1 and PART 2: paste each part whole and press Go.
--    PART 3: paste ONE test at a time. Each one should FAIL with the
--            message shown; phpMyAdmin stops at the first error.
--  The IDs below assume a fresh import (all counters start at 1).
-- =====================================================================

USE dokankhata;

-- =====================================================================
-- PART 1. Minimal test data
-- =====================================================================
INSERT INTO areas (area_id, name, thana, district, division)
VALUES (1, 'Mirpur 10', 'Mirpur', 'Dhaka', 'Dhaka');

-- password_hash values are placeholders; real ones come from PHP password_hash()
INSERT INTO users (user_id, full_name, phone, password_hash, role) VALUES
  (1, 'Rahim Uddin',   '01711000001', '$2y$10$placeholderplaceholderplaceholde', 'owner'),
  (2, 'Salma Akter',   '01711000002', '$2y$10$placeholderplaceholderplaceholde', 'staff'),
  (3, 'Babul Mia',     '01711000003', '$2y$10$placeholderplaceholderplaceholde', 'staff'),
  (4, 'Platform Admin','01811000004', '$2y$10$placeholderplaceholderplaceholde', 'admin'),
  (5, 'Shahana Begum', '01911000005', '$2y$10$placeholderplaceholderplaceholde', 'owner');

INSERT INTO shops (shop_id, owner_user_id, area_id, name, shop_type, trade_licence_no, address, phone,
                   status, verified_by, verified_at) VALUES
  (1, 1, 1, 'Rahim General Store', 'grocery',  'TL-DNCC-10001', 'Road 3, Mirpur 10', '01711000001', 'active', 4, NOW()),
  (2, 5, 1, 'Ma Pharmacy',         'pharmacy', 'TL-DNCC-10002', 'Road 5, Mirpur 10', '01911000005', 'active', 4, NOW());

-- Salma may give credit; Babul may not
INSERT INTO shop_staff (shop_id, user_id, staff_role, can_give_credit, joined_on) VALUES
  (1, 2, 'cashier', 1, CURDATE() - INTERVAL 100 DAY),
  (1, 3, 'cashier', 0, CURDATE() - INTERVAL 30 DAY);

INSERT INTO customers (customer_id, phone, full_name, area_id) VALUES
  (1, '01712345678', 'Karim Hossain', 1),
  (2, '01812345678', 'Jamal Ahmed',   1);

INSERT INTO shop_customers (shop_customer_id, shop_id, customer_id, credit_limit, due_days, joined_on) VALUES
  (1, 1, 1, 3000, 15, CURDATE() - INTERVAL 60 DAY),   -- Karim at Rahim General Store
  (2, 2, 1, 2000, 15, CURDATE() - INTERVAL 60 DAY),   -- Karim at Ma Pharmacy
  (3, 1, 2, 5000, 15, CURDATE() - INTERVAL 60 DAY);   -- Jamal at Rahim General Store

INSERT INTO categories (category_id, name, bangla_name) VALUES
  (1, 'Rice & grains', 'চাল-ডাল'), (2, 'Oil', 'তেল'), (3, 'Eggs & dairy', 'ডিম-দুধ'), (4, 'Medicine', 'ওষুধ');

INSERT INTO products (product_id, category_id, name, bangla_name, brand, unit) VALUES
  (1, 1, 'Miniket rice', 'মিনিকেট চাল', 'Loose', 'kg'),
  (2, 2, 'Soybean oil',  'সয়াবিন তেল', 'Teer',  'litre'),
  (3, 3, 'Farm egg',     'ফার্মের ডিম', 'Loose', 'dozen'),
  (4, 4, 'Napa 500 mg',  'নাপা',       'Beximco', 'strip');

INSERT INTO shop_products (shop_product_id, shop_id, product_id, sell_price, stock_qty, reorder_level) VALUES
  (1, 1, 1,  75.00,  50, 20),     -- rice  Tk 75/kg, 50 kg
  (2, 1, 2, 185.00,  10,  5),     -- oil   Tk 185/L, 10 L
  (3, 1, 3, 150.00,   2,  2),     -- eggs  Tk 150/dozen, 2 dozen
  (4, 2, 4,  12.00, 100, 30);     -- Napa  Tk 12/strip at the pharmacy


-- =====================================================================
-- PART 2. Normal use (no errors expected)
-- =====================================================================

-- 2.1 Salma sells Karim 5 kg rice + 2 L oil on baki
--     EXPECT: total 745.00, status open, due in 15 days; stock rice 45, oil 8
CALL sp_record_credit_sale(1, 2, '[{"shop_product_id": 1, "qty": 5}, {"shop_product_id": 2, "qty": 2}]',
                           'Monthly bazar', @sale1);
SELECT sale_id, total_amount, status, due_date FROM credit_sales WHERE sale_id = @sale1;
SELECT shop_product_id, stock_qty FROM shop_products WHERE shop_product_id IN (1, 2);

-- 2.2 Rahim sells Karim 1 dozen eggs
--     EXPECT: total 150.00; egg stock 1
CALL sp_record_credit_sale(1, 1, '[{"shop_product_id": 3, "qty": 1}]', NULL, @sale2);
SELECT sale_id, total_amount, status FROM credit_sales WHERE sale_id = @sale2;

-- 2.3 Karim pays Tk 800 by bKash. FIFO: 745 clears sale 1, 55 goes to sale 2
--     EXPECT: allocations (sale 1, 745.00) and (sale 2, 55.00);
--             sale 1 paid, sale 2 partially_paid
CALL sp_record_payment(1, 800, 'bkash', 'TRX10001', 2, @pay1);
SELECT payment_id, sale_id, amount FROM payment_allocations WHERE payment_id = @pay1;
SELECT sale_id, status FROM credit_sales WHERE sale_id IN (@sale1, @sale2);

-- 2.4 Rahim gives a Tk 20 discount on the eggs
--     EXPECT: sale 2 balance 75.00 (150 - 55 - 20), still partially_paid
CALL sp_add_adjustment(@sale2, 'discount', 20, 'Regular customer', 1, @adj1);
SELECT sale_id, paid_amount, adjusted_amount, balance, status FROM v_sale_balance WHERE sale_id = @sale2;

-- 2.5 Karim disputes the eggs: sale 2 becomes 'disputed'.
--     Rahim rejects it: sale 2 goes back to 'partially_paid'
INSERT INTO disputes (sale_id, raised_by_customer_id, reason) VALUES (@sale2, 1, 'I did not take eggs');
SET @dispute1 = LAST_INSERT_ID();
SELECT sale_id, status FROM credit_sales WHERE sale_id = @sale2;          -- EXPECT disputed
UPDATE disputes SET status = 'rejected', resolved_by = 1, resolved_at = NOW(),
                    resolution = 'Sale confirmed by the cashier'
 WHERE dispute_id = @dispute1;
SELECT sale_id, status FROM credit_sales WHERE sale_id = @sale2;          -- EXPECT partially_paid

-- 2.6 Jamal becomes Karim's guarantor at Rahim General Store
INSERT INTO customer_guarantors (shop_customer_id, guarantor_customer_id, guarantee_limit)
VALUES (1, 2, 2000);

-- 2.7 Views
--     EXPECT v_customer_balance for account 1: total_credit 895, total_paid 800,
--            total_adjusted 20, balance 75, available_credit 2925
SELECT shop_customer_id, total_credit, total_paid, total_adjusted, balance, available_credit
FROM v_customer_balance WHERE shop_customer_id = 1;
SELECT * FROM v_customer_exposure WHERE customer_id = 1;                  -- EXPECT shops_owed 1, total 75
SELECT * FROM v_aging WHERE shop_id = 1;                                  -- EXPECT not_yet_due 75

-- 2.8 Trust score: one sale settled on time, nothing late
--     EXPECT score 100, on_time_pct 100.00, shops_owed 1
CALL sp_calculate_trust_score(1);
SELECT * FROM customer_trust_scores WHERE customer_id = 1;
CALL sp_refresh_all_trust_scores();                                        -- cursor over all customers
SELECT customer_id, score FROM customer_trust_scores ORDER BY customer_id; -- EXPECT 2 rows

-- 2.9 Monthly statement for this month
--     EXPECT one row: opening 0, credit 895, paid 800, adjustments 20, closing 75
CALL sp_generate_statements(CURDATE());
SELECT shop_customer_id, statement_month, opening_balance, credit_total, paid_total,
       adjustment_total, closing_balance FROM monthly_statements;

-- 2.10 Audit log: raise Karim's limit
--      EXPECT one audit_log row showing 3000.00 -> 4000.00, changed_by rahim
SET @app_user = 'rahim';
UPDATE shop_customers SET credit_limit = 4000 WHERE shop_customer_id = 1;
SELECT table_name, record_id, old_value, new_value, changed_by FROM audit_log;

-- 2.11 Events are installed
SHOW EVENTS;                                                               -- EXPECT 5 events


-- =====================================================================
-- PART 3. Safety rules (run ONE test at a time; each must FAIL)
-- =====================================================================

-- 3.1 Credit limit: Karim's pharmacy limit is Tk 2,000; 200 strips = Tk 2,400
--     EXPECT: Credit limit exceeded: owes Tk 0.00, this sale Tk 2400.00, limit Tk 2000.00
CALL sp_record_credit_sale(2, 5, '[{"shop_product_id": 4, "qty": 200}]', NULL, @x);

-- 3.2 Babul is not allowed to give credit
--     EXPECT: This user is not allowed to give credit at this shop
CALL sp_record_credit_sale(1, 3, '[{"shop_product_id": 1, "qty": 1}]', NULL, @x);

-- 3.3 Napa is sold at the pharmacy, not at Rahim General Store
--     EXPECT: A cart item is not sold at this shop
CALL sp_record_credit_sale(1, 1, '[{"shop_product_id": 4, "qty": 1}]', NULL, @x);

-- 3.4 Only 1 dozen eggs left
--     EXPECT: Not enough stock: Farm egg (1.00 left)
CALL sp_record_credit_sale(3, 1, '[{"shop_product_id": 3, "qty": 5}]', NULL, @x);

-- 3.5 Empty cart
--     EXPECT: The cart is empty or not valid JSON
CALL sp_record_credit_sale(1, 1, '[]', NULL, @x);

-- 3.6 Paying more than is owed (Karim owes Tk 75)
--     EXPECT: Payment is more than the amount owed (Tk 75.00)
CALL sp_record_payment(1, 5000, 'cash', NULL, 1, @x);

-- 3.7 The same bKash TrxID twice
--     EXPECT: This transaction ID has already been recorded
CALL sp_record_payment(1, 10, 'bkash', 'TRX10001', 1, @x);

-- 3.8 bKash payment without a TrxID
--     EXPECT: CONSTRAINT `ck_payments_trx_ref` failed
CALL sp_record_payment(1, 10, 'bkash', NULL, 1, @x);

-- 3.9 Allocating more than a payment holds (payment 1 is fully used)
--     EXPECT: Allocations cannot add up to more than the payment
INSERT INTO payment_allocations (payment_id, sale_id, amount) VALUES (1, 2, 1);

-- 3.10 Deleting a sale
--      EXPECT: Ledger rows cannot be deleted; add an adjustment instead
DELETE FROM credit_sales WHERE sale_id = 1;

-- 3.11 Editing a sale's amount
--      EXPECT: A recorded sale cannot be edited; add an adjustment instead
UPDATE credit_sales SET total_amount = 1 WHERE sale_id = 1;

-- 3.12 Moving a due date earlier
--      EXPECT: A due date can only be extended, not brought forward
UPDATE credit_sales SET due_date = due_date - INTERVAL 5 DAY WHERE sale_id = 2;

-- 3.13 Editing a payment
--      EXPECT: A recorded payment cannot be edited
UPDATE payments SET amount = 1 WHERE payment_id = 1;

-- 3.14 A cashier approving a discount
--      EXPECT: Only the shop owner or a manager can approve an adjustment
CALL sp_add_adjustment(2, 'discount', 5, 'test', 2, @x);

-- 3.15 An adjustment bigger than the balance (sale 2 balance is Tk 75)
--      EXPECT: Adjustment must be more than 0 and not more than the sale balance
CALL sp_add_adjustment(2, 'discount', 1000, 'test', 1, @x);

-- 3.16 A customer guaranteeing themselves
--      EXPECT: A customer cannot be their own guarantor
INSERT INTO customer_guarantors (shop_customer_id, guarantor_customer_id, guarantee_limit) VALUES (1, 1, 500);

-- 3.17 A badly formatted phone number
--      EXPECT: CONSTRAINT `ck_customers_phone` failed
INSERT INTO customers (phone, full_name) VALUES ('12345', 'Test Person');

-- 3.18 A blocked customer gets no new credit
--      EXPECT: This customer account is blocked or closed; no new credit
UPDATE shop_customers SET status = 'blocked', blocked_reason = 'Unpaid for 6 months' WHERE shop_customer_id = 3;
CALL sp_record_credit_sale(3, 1, '[{"shop_product_id": 1, "qty": 1}]', NULL, @x);

-- End of test. Import schema.sql again before importing seed.sql.
