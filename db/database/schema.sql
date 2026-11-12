-- =====================================================================
--  DokanKhata — Intelligent Baki Management & Credit Tracking
--               Infrastructure for Small Retailers
--  File: schema.sql  (tables, views, triggers, procedures, events)
--
--  Target : XAMPP (MariaDB 10.4 or newer), InnoDB, utf8mb4
--  Import : phpMyAdmin > click the server name (not a database) >
--           Import > choose this file > Go.
--  WARNING: this file DROPS and recreates the `dokankhata` database.
--  Undo   : rollback.sql
--
--  Contents
--    Part 1  21 tables in 5 modules (A-E)
--    Part 2  6 views
--    Part 3  7 stored procedures (before the triggers that call them)
--    Part 4  13 triggers
--    Part 5  5 scheduled events
--
--  Naming conventions
--    tables        snake_case, plural            credit_sales
--    primary key   <singular>_id                 sale_id
--    foreign key   fk_<table>_<column>           fk_credit_sales_staff
--    unique key    uk_<table>_<columns>          uk_payments_trx_ref
--    check         ck_<table>_<rule>             ck_payments_amount
--    index         idx_<table>_<columns>         idx_credit_sales_status_due
--    view          v_<name>                      v_customer_balance
--    trigger       trg_<table>_<bi|bu|bd|ai|au>  trg_credit_sales_bi
--                  (before/after insert, update, delete)
--    procedure     sp_<verb>_<noun>              sp_record_payment
--    event         ev_<job>                      ev_mark_overdue
--
--  Ledger rule: credit sales and payments are never deleted or edited.
--  Mistakes are fixed with an adjustment row, so the history stays intact.
--
--  Bulk loading: triggers that check or maintain data skip their work
--  while the session variable @disable_triggers is set. seed.sql sets it
--  so already-validated history loads quickly. Normal use never sets it.
-- =====================================================================

DROP DATABASE IF EXISTS dokankhata;
CREATE DATABASE dokankhata CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dokankhata;


-- =====================================================================
-- PART 1. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
-- Module A. Platform & access
-- ---------------------------------------------------------------------

-- areas
-- Purpose: location hierarchy (area -> thana -> district -> division), so
--          shops and customers can be grouped for area-wise risk reports.
CREATE TABLE areas (
  area_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(60)  NOT NULL,                    -- e.g. Mirpur 10
  thana       VARCHAR(60)  NOT NULL,                    -- e.g. Mirpur
  district    VARCHAR(40)  NOT NULL,                    -- e.g. Dhaka
  division    ENUM('Dhaka','Chattogram','Rajshahi','Khulna','Barishal',
                   'Sylhet','Rangpur','Mymensingh') NOT NULL,
  PRIMARY KEY (area_id),
  UNIQUE KEY uk_areas_name_thana_district (name, thana, district),
  KEY idx_areas_district (district)
) ENGINE=InnoDB;

-- users
-- Purpose: one login table for every role. Passwords are stored only as
--          PHP password_hash() output (bcrypt), never as plain text.
CREATE TABLE users (
  user_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name      VARCHAR(100) NOT NULL,
  phone          VARCHAR(11)  NOT NULL,                 -- 01XXXXXXXXX
  email          VARCHAR(120) NULL,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('owner','staff','customer','admin') NOT NULL,
  status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_users_phone (phone),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_role (role),
  CONSTRAINT ck_users_phone CHECK (phone REGEXP '^01[3-9][0-9]{8}$')
) ENGINE=InnoDB;

-- shops
-- Purpose: each registered shop. A shop starts as 'pending' and an admin
--          verifies it before it goes live.
CREATE TABLE shops (
  shop_id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id         INT UNSIGNED NOT NULL,
  area_id               INT UNSIGNED NOT NULL,
  name                  VARCHAR(100) NOT NULL,
  shop_type             ENUM('grocery','pharmacy','hardware','stationery','tea_stall',
                             'cosmetics','electronics','other') NOT NULL,
  trade_licence_no      VARCHAR(30)  NULL,
  address               VARCHAR(255) NOT NULL,
  phone                 VARCHAR(11)  NOT NULL,
  default_credit_limit  DECIMAL(12,2) NOT NULL DEFAULT 5000.00,
  default_due_days      SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  status                ENUM('pending','active','suspended','closed') NOT NULL DEFAULT 'pending',
  verified_by           INT UNSIGNED NULL,
  verified_at           DATETIME     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id),
  UNIQUE KEY uk_shops_trade_licence (trade_licence_no),
  KEY idx_shops_owner (owner_user_id),
  KEY idx_shops_area (area_id),
  KEY idx_shops_verified_by (verified_by),
  CONSTRAINT fk_shops_owner       FOREIGN KEY (owner_user_id) REFERENCES users (user_id),
  CONSTRAINT fk_shops_area        FOREIGN KEY (area_id)       REFERENCES areas (area_id),
  CONSTRAINT fk_shops_verified_by FOREIGN KEY (verified_by)   REFERENCES users (user_id),
  CONSTRAINT ck_shops_credit_limit CHECK (default_credit_limit >= 0),
  CONSTRAINT ck_shops_due_days     CHECK (default_due_days BETWEEN 1 AND 90),
  CONSTRAINT ck_shops_verified     CHECK (status = 'pending' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
) ENGINE=InnoDB;

-- shop_staff
-- Purpose: which users work at which shop (M:N between users and shops),
--          and whether each one is allowed to give credit.
CREATE TABLE shop_staff (
  shop_id          INT UNSIGNED NOT NULL,
  user_id          INT UNSIGNED NOT NULL,
  staff_role       ENUM('manager','cashier') NOT NULL DEFAULT 'cashier',
  can_give_credit  TINYINT(1)   NOT NULL DEFAULT 0,
  joined_on        DATE         NOT NULL,
  left_on          DATE         NULL,                   -- NULL = still working here
  PRIMARY KEY (shop_id, user_id),
  KEY idx_shop_staff_user (user_id),
  CONSTRAINT fk_shop_staff_shop FOREIGN KEY (shop_id) REFERENCES shops (shop_id) ON DELETE CASCADE,
  CONSTRAINT fk_shop_staff_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_shop_staff_dates CHECK (left_on IS NULL OR left_on >= joined_on)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- Module B. Customers
-- ---------------------------------------------------------------------

-- customers
-- Purpose: one identity per person across every shop, keyed by phone
--          number. This is what makes the cross-shop trust score possible.
CREATE TABLE customers (
  customer_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone        VARCHAR(11)  NOT NULL,
  full_name    VARCHAR(100) NOT NULL,
  nid          VARCHAR(17)  NULL,                       -- national ID: 10, 13 or 17 digits
  area_id      INT UNSIGNED NULL,
  address      VARCHAR(255) NULL,
  user_id      INT UNSIGNED NULL,                       -- set when the customer claims a portal login
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uk_customers_phone (phone),
  UNIQUE KEY uk_customers_nid (nid),
  UNIQUE KEY uk_customers_user (user_id),
  KEY idx_customers_area (area_id),
  KEY idx_customers_name (full_name),
  CONSTRAINT fk_customers_area FOREIGN KEY (area_id) REFERENCES areas (area_id),
  CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT ck_customers_phone CHECK (phone REGEXP '^01[3-9][0-9]{8}$'),
  CONSTRAINT ck_customers_nid   CHECK (nid IS NULL OR nid REGEXP '^([0-9]{10}|[0-9]{13}|[0-9]{17})$')
) ENGINE=InnoDB;

-- shop_customers
-- Purpose: the account a customer holds at one shop (M:N between shops and
--          customers with its own data): credit limit, due days, status.
CREATE TABLE shop_customers (
  shop_customer_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id           INT UNSIGNED NOT NULL,
  customer_id       INT UNSIGNED NOT NULL,
  credit_limit      DECIMAL(12,2) NOT NULL,
  due_days          SMALLINT UNSIGNED NOT NULL,
  status            ENUM('active','blocked','closed') NOT NULL DEFAULT 'active',
  blocked_reason    VARCHAR(150) NULL,
  joined_on         DATE         NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_customer_id),
  UNIQUE KEY uk_shop_customers_shop_customer (shop_id, customer_id),
  KEY idx_shop_customers_customer (customer_id),
  CONSTRAINT fk_shop_customers_shop     FOREIGN KEY (shop_id)     REFERENCES shops (shop_id),
  CONSTRAINT fk_shop_customers_customer FOREIGN KEY (customer_id) REFERENCES customers (customer_id),
  CONSTRAINT ck_shop_customers_limit    CHECK (credit_limit >= 0),
  CONSTRAINT ck_shop_customers_due_days CHECK (due_days BETWEEN 1 AND 90),
  CONSTRAINT ck_shop_customers_blocked  CHECK (status <> 'blocked' OR blocked_reason IS NOT NULL)
) ENGINE=InnoDB;

-- customer_guarantors
-- Purpose: a jamindar. Another customer of the same shop promises to pay
--          if this account doesn't (recursive relationship on customers).
CREATE TABLE customer_guarantors (
  shop_customer_id       INT UNSIGNED NOT NULL,
  guarantor_customer_id  INT UNSIGNED NOT NULL,
  guarantee_limit        DECIMAL(12,2) NOT NULL,
  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_customer_id, guarantor_customer_id),
  KEY idx_customer_guarantors_guarantor (guarantor_customer_id),
  CONSTRAINT fk_customer_guarantors_account   FOREIGN KEY (shop_customer_id)
             REFERENCES shop_customers (shop_customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_guarantors_guarantor FOREIGN KEY (guarantor_customer_id)
             REFERENCES customers (customer_id),
  CONSTRAINT ck_customer_guarantors_limit CHECK (guarantee_limit > 0)
) ENGINE=InnoDB;

-- customer_trust_scores
-- Purpose: one score (0-100) per customer, rebuilt every night from their
--          history at all shops (1:1 with customers).
CREATE TABLE customer_trust_scores (
  customer_id        INT UNSIGNED NOT NULL,
  score              TINYINT UNSIGNED NOT NULL,
  on_time_pct        DECIMAL(5,2) NULL,                 -- NULL = no settled sales yet
  avg_days_late      DECIMAL(6,2) NOT NULL DEFAULT 0,
  settled_sales      INT UNSIGNED NOT NULL DEFAULT 0,
  overdue_sales      INT UNSIGNED NOT NULL DEFAULT 0,
  broken_promises    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  shops_owed         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  write_offs         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_outstanding  DECIMAL(12,2) NOT NULL DEFAULT 0,
  calculated_at      DATETIME     NOT NULL,
  PRIMARY KEY (customer_id),
  KEY idx_customer_trust_scores_score (score),
  CONSTRAINT fk_customer_trust_scores_customer FOREIGN KEY (customer_id)
             REFERENCES customers (customer_id) ON DELETE CASCADE,
  CONSTRAINT ck_customer_trust_scores_score   CHECK (score <= 100),
  CONSTRAINT ck_customer_trust_scores_on_time CHECK (on_time_pct IS NULL OR on_time_pct BETWEEN 0 AND 100)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- Module C. Products
-- ---------------------------------------------------------------------

-- categories
-- Purpose: product groups for reports (rice & grains, oil, medicine ...).
CREATE TABLE categories (
  category_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(60)  NOT NULL,
  bangla_name  VARCHAR(60)  NULL,
  PRIMARY KEY (category_id),
  UNIQUE KEY uk_categories_name (name)
) ENGINE=InnoDB;

-- products
-- Purpose: one shared catalog for every shop. Loose goods (rice, dal,
--          onion) use the brand 'Loose'.
CREATE TABLE products (
  product_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id  INT UNSIGNED NOT NULL,
  name         VARCHAR(100) NOT NULL,
  bangla_name  VARCHAR(100) NULL,
  brand        VARCHAR(60)  NOT NULL DEFAULT 'Loose',
  unit         ENUM('kg','g','litre','ml','piece','packet','dozen','box','strip','bottle') NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id),
  UNIQUE KEY uk_products_name_brand_unit (name, brand, unit),
  KEY idx_products_category (category_id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories (category_id)
) ENGINE=InnoDB;

-- shop_products
-- Purpose: a shop's own price list and stock (M:N between shops and
--          products with price and stock). Shops that don't count stock,
--          like a tea stall, set track_stock = 0.
CREATE TABLE shop_products (
  shop_product_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_id          INT UNSIGNED NOT NULL,
  product_id       INT UNSIGNED NOT NULL,
  sell_price       DECIMAL(10,2) NOT NULL,
  stock_qty        DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_level    DECIMAL(10,2) NOT NULL DEFAULT 0,
  track_stock      TINYINT(1)   NOT NULL DEFAULT 1,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_product_id),
  UNIQUE KEY uk_shop_products_shop_product (shop_id, product_id),
  KEY idx_shop_products_product (product_id),
  CONSTRAINT fk_shop_products_shop    FOREIGN KEY (shop_id)    REFERENCES shops (shop_id),
  CONSTRAINT fk_shop_products_product FOREIGN KEY (product_id) REFERENCES products (product_id),
  CONSTRAINT ck_shop_products_price   CHECK (sell_price > 0),
  CONSTRAINT ck_shop_products_stock   CHECK (stock_qty >= 0),
  CONSTRAINT ck_shop_products_reorder CHECK (reorder_level >= 0)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- Module D. Credit ledger
-- ---------------------------------------------------------------------

-- credit_sales
-- Purpose: one baki purchase. total_amount is stored (not recalculated)
--          because the credit-limit check needs it at insert time; only
--          sp_record_credit_sale writes it, from the shop's own prices.
CREATE TABLE credit_sales (
  sale_id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_customer_id  INT UNSIGNED NOT NULL,
  staff_user_id     INT UNSIGNED NOT NULL,              -- who gave the credit
  sold_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_amount      DECIMAL(12,2) NOT NULL,
  due_date          DATE         NOT NULL,
  status            ENUM('open','partially_paid','paid','overdue','disputed','written_off')
                    NOT NULL DEFAULT 'open',
  note              VARCHAR(255) NULL,
  PRIMARY KEY (sale_id),
  KEY idx_credit_sales_account_sold (shop_customer_id, sold_at),
  KEY idx_credit_sales_status_due (status, due_date),
  KEY idx_credit_sales_staff (staff_user_id),
  CONSTRAINT fk_credit_sales_account FOREIGN KEY (shop_customer_id) REFERENCES shop_customers (shop_customer_id),
  CONSTRAINT fk_credit_sales_staff   FOREIGN KEY (staff_user_id)    REFERENCES users (user_id),
  CONSTRAINT ck_credit_sales_total   CHECK (total_amount > 0),
  CONSTRAINT ck_credit_sales_due     CHECK (due_date >= CAST(sold_at AS DATE))
) ENGINE=InnoDB;

-- credit_sale_items
-- Purpose: the lines of a credit sale. unit_price is copied from the price
--          list at the moment of sale, so later price changes don't
--          rewrite old bills.
CREATE TABLE credit_sale_items (
  item_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id          INT UNSIGNED NOT NULL,
  shop_product_id  INT UNSIGNED NOT NULL,
  qty              DECIMAL(10,2) NOT NULL,
  unit_price       DECIMAL(10,2) NOT NULL,
  line_total       DECIMAL(12,2) AS (ROUND(qty * unit_price, 2)) PERSISTENT,
  PRIMARY KEY (item_id),
  KEY idx_credit_sale_items_sale (sale_id),
  KEY idx_credit_sale_items_product (shop_product_id),
  CONSTRAINT fk_credit_sale_items_sale    FOREIGN KEY (sale_id)         REFERENCES credit_sales (sale_id) ON DELETE CASCADE,
  CONSTRAINT fk_credit_sale_items_product FOREIGN KEY (shop_product_id) REFERENCES shop_products (shop_product_id),
  CONSTRAINT ck_credit_sale_items_qty     CHECK (qty > 0),
  CONSTRAINT ck_credit_sale_items_price   CHECK (unit_price > 0)
) ENGINE=InnoDB;

-- payments
-- Purpose: money a customer pays into their account at a shop. A payment
--          is split across sales in payment_allocations.
CREATE TABLE payments (
  payment_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_customer_id  INT UNSIGNED NOT NULL,
  amount            DECIMAL(12,2) NOT NULL,
  method            ENUM('cash','bkash','nagad','rocket') NOT NULL,
  trx_ref           VARCHAR(40)  NULL,                  -- mobile banking TrxID
  received_by       INT UNSIGNED NOT NULL,
  paid_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note              VARCHAR(255) NULL,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uk_payments_trx_ref (trx_ref),
  KEY idx_payments_account_paid (shop_customer_id, paid_at),
  KEY idx_payments_received_by (received_by),
  CONSTRAINT fk_payments_account     FOREIGN KEY (shop_customer_id) REFERENCES shop_customers (shop_customer_id),
  CONSTRAINT fk_payments_received_by FOREIGN KEY (received_by)      REFERENCES users (user_id),
  CONSTRAINT ck_payments_amount      CHECK (amount > 0),
  CONSTRAINT ck_payments_trx_ref     CHECK (method = 'cash' OR trx_ref IS NOT NULL)
) ENGINE=InnoDB;

-- payment_allocations
-- Purpose: which payment cleared which sale, and how much (M:N between
--          payments and credit_sales). Filled oldest-sale-first (FIFO).
CREATE TABLE payment_allocations (
  payment_id    INT UNSIGNED NOT NULL,
  sale_id       INT UNSIGNED NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  allocated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id, sale_id),
  KEY idx_payment_allocations_sale_amount (sale_id, amount),   -- covering index for per-sale totals
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments (payment_id),
  CONSTRAINT fk_payment_allocations_sale    FOREIGN KEY (sale_id)    REFERENCES credit_sales (sale_id),
  CONSTRAINT ck_payment_allocations_amount  CHECK (amount > 0)
) ENGINE=InnoDB;

-- adjustments
-- Purpose: the only way to correct a sale: a return, discount, correction
--          or bad-debt write-off. Each one lowers the sale's balance.
CREATE TABLE adjustments (
  adjustment_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id        INT UNSIGNED NOT NULL,
  adj_type       ENUM('return','discount','correction','write_off') NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  reason         VARCHAR(255) NOT NULL,
  approved_by    INT UNSIGNED NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (adjustment_id),
  KEY idx_adjustments_sale_type (sale_id, adj_type),
  KEY idx_adjustments_approved_by (approved_by),
  CONSTRAINT fk_adjustments_sale        FOREIGN KEY (sale_id)     REFERENCES credit_sales (sale_id),
  CONSTRAINT fk_adjustments_approved_by FOREIGN KEY (approved_by) REFERENCES users (user_id),
  CONSTRAINT ck_adjustments_amount      CHECK (amount > 0)
) ENGINE=InnoDB;

-- promises
-- Purpose: "I'll pay Tk 2,000 on the 5th." Marked kept or broken by a
--          nightly event; broken promises lower the trust score.
CREATE TABLE promises (
  promise_id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_customer_id  INT UNSIGNED NOT NULL,
  promised_amount   DECIMAL(12,2) NOT NULL,
  promised_date     DATE         NOT NULL,
  status            ENUM('pending','kept','broken') NOT NULL DEFAULT 'pending',
  recorded_by       INT UNSIGNED NOT NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at       DATETIME     NULL,
  PRIMARY KEY (promise_id),
  KEY idx_promises_account (shop_customer_id),
  KEY idx_promises_status_date (status, promised_date),
  KEY idx_promises_recorded_by (recorded_by),
  CONSTRAINT fk_promises_account     FOREIGN KEY (shop_customer_id) REFERENCES shop_customers (shop_customer_id),
  CONSTRAINT fk_promises_recorded_by FOREIGN KEY (recorded_by)      REFERENCES users (user_id),
  CONSTRAINT ck_promises_amount   CHECK (promised_amount > 0),
  CONSTRAINT ck_promises_date     CHECK (promised_date >= CAST(created_at AS DATE)),
  CONSTRAINT ck_promises_resolved CHECK ((status = 'pending') = (resolved_at IS NULL))
) ENGINE=InnoDB;

-- disputes
-- Purpose: a customer says a sale is wrong. While a dispute is open the
--          sale is marked 'disputed' and payments skip it.
CREATE TABLE disputes (
  dispute_id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id                INT UNSIGNED NOT NULL,
  raised_by_customer_id  INT UNSIGNED NOT NULL,
  reason                 VARCHAR(255) NOT NULL,
  status                 ENUM('open','accepted','rejected') NOT NULL DEFAULT 'open',
  resolved_by            INT UNSIGNED NULL,
  resolution             VARCHAR(255) NULL,
  raised_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at            DATETIME     NULL,
  -- NULL once resolved, so a sale can have only one OPEN dispute at a time
  open_sale_id           INT UNSIGNED AS (IF(status = 'open', sale_id, NULL)) PERSISTENT,
  PRIMARY KEY (dispute_id),
  UNIQUE KEY uk_disputes_one_open_per_sale (open_sale_id),
  KEY idx_disputes_sale (sale_id),
  KEY idx_disputes_customer (raised_by_customer_id),
  KEY idx_disputes_resolved_by (resolved_by),
  CONSTRAINT fk_disputes_sale        FOREIGN KEY (sale_id)               REFERENCES credit_sales (sale_id),
  CONSTRAINT fk_disputes_customer    FOREIGN KEY (raised_by_customer_id) REFERENCES customers (customer_id),
  CONSTRAINT fk_disputes_resolved_by FOREIGN KEY (resolved_by)           REFERENCES users (user_id),
  CONSTRAINT ck_disputes_resolved CHECK ((status = 'open') = (resolved_at IS NULL)),
  CONSTRAINT ck_disputes_resolver CHECK (status = 'open' OR resolved_by IS NOT NULL)
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- Module E. Communication & records
-- ---------------------------------------------------------------------

-- reminders
-- Purpose: queue of due-date reminders (SMS/app prototype). One reminder
--          of each type per sale, so the nightly event never duplicates.
CREATE TABLE reminders (
  reminder_id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_customer_id  INT UNSIGNED NOT NULL,
  sale_id           INT UNSIGNED NULL,
  reminder_type     ENUM('before_due','on_due','overdue','promise') NOT NULL,
  channel           ENUM('sms','app') NOT NULL DEFAULT 'sms',
  message           VARCHAR(255) NOT NULL,
  scheduled_for     DATE         NOT NULL,
  status            ENUM('queued','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  sent_at           DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (reminder_id),
  UNIQUE KEY uk_reminders_sale_type (sale_id, reminder_type),
  KEY idx_reminders_status_date (status, scheduled_for),
  KEY idx_reminders_account (shop_customer_id),
  CONSTRAINT fk_reminders_account FOREIGN KEY (shop_customer_id) REFERENCES shop_customers (shop_customer_id),
  CONSTRAINT fk_reminders_sale    FOREIGN KEY (sale_id)          REFERENCES credit_sales (sale_id),
  CONSTRAINT ck_reminders_sent    CHECK ((status = 'sent') = (sent_at IS NOT NULL))
) ENGINE=InnoDB;

-- monthly_statements
-- Purpose: a frozen month-end summary per account (opening balance,
--          credit, payments, adjustments, closing balance).
CREATE TABLE monthly_statements (
  statement_id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_customer_id  INT UNSIGNED NOT NULL,
  statement_month   DATE         NOT NULL,              -- always the 1st of the month
  opening_balance   DECIMAL(12,2) NOT NULL,
  credit_total      DECIMAL(12,2) NOT NULL,
  paid_total        DECIMAL(12,2) NOT NULL,
  adjustment_total  DECIMAL(12,2) NOT NULL,
  closing_balance   DECIMAL(12,2) NOT NULL,
  generated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (statement_id),
  UNIQUE KEY uk_monthly_statements_account_month (shop_customer_id, statement_month),
  CONSTRAINT fk_monthly_statements_account FOREIGN KEY (shop_customer_id) REFERENCES shop_customers (shop_customer_id),
  CONSTRAINT ck_monthly_statements_month   CHECK (DAYOFMONTH(statement_month) = 1),
  CONSTRAINT ck_monthly_statements_closing CHECK (closing_balance = opening_balance + credit_total - paid_total - adjustment_total)
) ENGINE=InnoDB;

-- audit_log
-- Purpose: who changed what and when. Written only by triggers. No foreign
--          keys, so the log outlives the rows it describes.
CREATE TABLE audit_log (
  log_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name  VARCHAR(64)  NOT NULL,
  record_id   INT UNSIGNED NOT NULL,
  action      ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  old_value   LONGTEXT     NULL,                        -- JSON
  new_value   LONGTEXT     NULL,                        -- JSON
  changed_by  VARCHAR(100) NOT NULL,
  changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_audit_log_record (table_name, record_id),
  KEY idx_audit_log_changed_at (changed_at)
) ENGINE=InnoDB;


-- =====================================================================
-- PART 2. VIEWS
-- =====================================================================

-- v_sale_amounts: each sale with what has been paid and adjusted so far.
-- Payments and adjustments are summed per sale in two derived tables
-- (one row per sale each), so joining both can't multiply rows.
-- Why not scalar subqueries like (SELECT SUM(...) WHERE sale_id = ...)?
-- MariaDB 10.4 raises #1111 "Invalid use of group function" when a query
-- runs SUM()/COUNT() over view columns built from aggregate subqueries
-- (for example SUM(balance) in sp_record_payment and the report views).
-- With the totals in derived tables, the views' columns are plain values.
CREATE VIEW v_sale_amounts AS
SELECT cs.sale_id, cs.shop_customer_id, sc.shop_id, sc.customer_id,
       cs.staff_user_id, cs.sold_at, cs.due_date, cs.status, cs.total_amount,
       COALESCE(pd.paid_amount, 0)                                       AS paid_amount,
       COALESCE(ad.adjusted_amount, 0)                                   AS adjusted_amount,
       pd.last_paid_at                                                   AS last_paid_at
FROM credit_sales cs
JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
LEFT JOIN (SELECT pa.sale_id, SUM(pa.amount) AS paid_amount, MAX(p.paid_at) AS last_paid_at
             FROM payment_allocations pa
             JOIN payments p ON p.payment_id = pa.payment_id
            GROUP BY pa.sale_id) AS pd ON pd.sale_id = cs.sale_id
LEFT JOIN (SELECT a.sale_id, SUM(a.amount) AS adjusted_amount
             FROM adjustments a
            GROUP BY a.sale_id) AS ad ON ad.sale_id = cs.sale_id;

-- v_sale_balance: the balance of every sale and how many days it is overdue.
CREATE VIEW v_sale_balance AS
SELECT sa.*,
       sa.total_amount - sa.paid_amount - sa.adjusted_amount             AS balance,
       CASE WHEN sa.total_amount - sa.paid_amount - sa.adjusted_amount > 0
             AND sa.due_date < CURDATE()
            THEN DATEDIFF(CURDATE(), sa.due_date) ELSE 0 END             AS days_overdue
FROM v_sale_amounts sa;

-- v_customer_balance: one row per account (customer at a shop).
CREATE VIEW v_customer_balance AS
SELECT sc.shop_customer_id, sc.shop_id, s.name AS shop_name,
       sc.customer_id, c.full_name, c.phone,
       sc.credit_limit, sc.status,
       COUNT(sb.sale_id)                                   AS total_sales,
       COALESCE(SUM(sb.total_amount), 0)                   AS total_credit,
       COALESCE(SUM(sb.paid_amount), 0)                    AS total_paid,
       COALESCE(SUM(sb.adjusted_amount), 0)                AS total_adjusted,
       COALESCE(SUM(sb.balance), 0)                        AS balance,
       sc.credit_limit - COALESCE(SUM(sb.balance), 0)      AS available_credit,
       COALESCE(SUM(sb.balance > 0), 0)                    AS unpaid_sales,
       MIN(CASE WHEN sb.balance > 0 THEN sb.due_date END)  AS oldest_unpaid_due,
       COALESCE(MAX(sb.days_overdue), 0)                   AS max_days_overdue,
       MAX(sb.sold_at)                                     AS last_purchase_at
FROM shop_customers sc
JOIN shops s     ON s.shop_id = sc.shop_id
JOIN customers c ON c.customer_id = sc.customer_id
LEFT JOIN v_sale_balance sb ON sb.shop_customer_id = sc.shop_customer_id
GROUP BY sc.shop_customer_id, sc.shop_id, s.name, sc.customer_id, c.full_name, c.phone,
         sc.credit_limit, sc.status;

-- v_shop_outstanding: money owed to each shop, and how much of it is late.
CREATE VIEW v_shop_outstanding AS
SELECT s.shop_id, s.name AS shop_name,
       COUNT(DISTINCT CASE WHEN sb.balance > 0 THEN sb.shop_customer_id END)  AS customers_owing,
       COALESCE(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0)         AS total_outstanding,
       COALESCE(SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END), 0)    AS overdue_amount
FROM shops s
LEFT JOIN v_sale_balance sb ON sb.shop_id = s.shop_id
GROUP BY s.shop_id, s.name;

-- v_customer_exposure: one customer's total debt across ALL shops.
CREATE VIEW v_customer_exposure AS
SELECT c.customer_id, c.full_name, c.phone,
       COUNT(DISTINCT CASE WHEN sb.balance > 0 THEN sb.shop_id END)           AS shops_owed,
       COALESCE(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0)         AS total_outstanding,
       COALESCE(SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END), 0)    AS overdue_amount,
       COALESCE(MAX(sb.days_overdue), 0)                                      AS max_days_overdue
FROM customers c
LEFT JOIN v_sale_balance sb ON sb.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name, c.phone;

-- v_aging: each shop's unpaid money split by how late it is.
CREATE VIEW v_aging AS
SELECT s.shop_id, s.name AS shop_name,
       COALESCE(SUM(CASE WHEN sb.balance > 0 AND sb.days_overdue = 0             THEN sb.balance END), 0) AS not_yet_due,
       COALESCE(SUM(CASE WHEN sb.balance > 0 AND sb.days_overdue BETWEEN 1 AND 30  THEN sb.balance END), 0) AS overdue_1_30,
       COALESCE(SUM(CASE WHEN sb.balance > 0 AND sb.days_overdue BETWEEN 31 AND 60 THEN sb.balance END), 0) AS overdue_31_60,
       COALESCE(SUM(CASE WHEN sb.balance > 0 AND sb.days_overdue BETWEEN 61 AND 90 THEN sb.balance END), 0) AS overdue_61_90,
       COALESCE(SUM(CASE WHEN sb.balance > 0 AND sb.days_overdue > 90            THEN sb.balance END), 0) AS overdue_90_plus,
       COALESCE(SUM(CASE WHEN sb.balance > 0                                     THEN sb.balance END), 0) AS total_outstanding
FROM shops s
LEFT JOIN v_sale_balance sb ON sb.shop_id = s.shop_id
GROUP BY s.shop_id, s.name;


-- =====================================================================
-- PART 3. STORED PROCEDURES
--   (created before the triggers because three triggers call
--    sp_refresh_sale_status)
-- =====================================================================

DELIMITER $$

-- P1. sp_refresh_sale_status
--     Works out a sale's status from its numbers. Called by the triggers
--     on payment_allocations, adjustments and disputes.
CREATE PROCEDURE sp_refresh_sale_status(IN p_sale_id INT UNSIGNED)
BEGIN
  DECLARE v_total    DECIMAL(12,2);
  DECLARE v_due      DATE;
  DECLARE v_paid     DECIMAL(12,2);
  DECLARE v_adjusted DECIMAL(12,2);
  DECLARE v_disputes INT;
  DECLARE v_writeoff INT;
  DECLARE v_status   VARCHAR(20);

  SET v_total = (SELECT total_amount FROM credit_sales WHERE sale_id = p_sale_id);
  IF v_total IS NOT NULL THEN
    SET v_due      = (SELECT due_date FROM credit_sales WHERE sale_id = p_sale_id);
    SET v_paid     = (SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE sale_id = p_sale_id);
    SET v_adjusted = (SELECT COALESCE(SUM(amount), 0) FROM adjustments WHERE sale_id = p_sale_id);
    SET v_disputes = (SELECT COUNT(*) FROM disputes WHERE sale_id = p_sale_id AND status = 'open');
    SET v_writeoff = (SELECT COUNT(*) FROM adjustments WHERE sale_id = p_sale_id AND adj_type = 'write_off');

    SET v_status = CASE
      WHEN v_disputes > 0                                      THEN 'disputed'
      WHEN v_total - v_paid - v_adjusted <= 0 AND v_writeoff > 0 THEN 'written_off'
      WHEN v_total - v_paid - v_adjusted <= 0                  THEN 'paid'
      WHEN v_due < CURDATE()                                   THEN 'overdue'
      WHEN v_paid + v_adjusted > 0                             THEN 'partially_paid'
      ELSE 'open' END;

    UPDATE credit_sales SET status = v_status
     WHERE sale_id = p_sale_id AND status <> v_status;
  END IF;
END$$

-- P2. sp_record_credit_sale
--     Records a baki sale and its items as ONE transaction.
--     p_items is a JSON array sent by the frontend, for example:
--       '[{"shop_product_id": 12, "qty": 5}, {"shop_product_id": 40, "qty": 2}]'
--     Prices come from the shop's own price list, never from the browser.
--     Locking the customer's account row stops two counters from passing
--     the credit-limit check at the same moment.
CREATE PROCEDURE sp_record_credit_sale(
  IN  p_shop_customer_id INT UNSIGNED,
  IN  p_staff_user_id    INT UNSIGNED,
  IN  p_items            LONGTEXT,
  IN  p_note             VARCHAR(255),
  OUT p_sale_id          INT UNSIGNED)
BEGIN
  DECLARE v_shop      INT UNSIGNED DEFAULT NULL;
  DECLARE v_due_days  SMALLINT UNSIGNED;
  DECLARE v_allowed   INT;
  DECLARE v_count     INT;
  DECLARE v_i         INT DEFAULT 0;
  DECLARE v_product   INT UNSIGNED;
  DECLARE v_qty       DECIMAL(10,2);
  DECLARE v_price     DECIMAL(10,2);
  DECLARE v_total     DECIMAL(12,2) DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_sale_id = NULL;
  IF p_items IS NULL OR JSON_VALID(p_items) = 0 OR JSON_LENGTH(p_items) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The cart is empty or not valid JSON';
  END IF;
  SET v_count = JSON_LENGTH(p_items);

  START TRANSACTION;

  SELECT shop_id, due_days INTO v_shop, v_due_days
  FROM shop_customers
  WHERE shop_customer_id = p_shop_customer_id
  FOR UPDATE;
  IF v_shop IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer account not found';
  END IF;

  -- only the owner, or staff allowed to give credit, may record baki
  SET v_allowed = (SELECT COUNT(*) FROM shops
                    WHERE shop_id = v_shop AND owner_user_id = p_staff_user_id)
                + (SELECT COUNT(*) FROM shop_staff
                    WHERE shop_id = v_shop AND user_id = p_staff_user_id
                      AND can_give_credit = 1 AND left_on IS NULL);
  IF v_allowed = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This user is not allowed to give credit at this shop';
  END IF;

  -- pass 1: price every item and add up the total
  WHILE v_i < v_count DO
    SET v_product = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].shop_product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].qty')));
    IF v_product IS NULL OR v_qty IS NULL OR v_qty <= 0 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Every cart item needs a shop_product_id and a qty above 0';
    END IF;
    SET v_price = (SELECT sell_price FROM shop_products
                    WHERE shop_product_id = v_product AND shop_id = v_shop AND is_active = 1);
    IF v_price IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A cart item is not sold at this shop';
    END IF;
    SET v_total = v_total + ROUND(v_qty * v_price, 2);
    SET v_i = v_i + 1;
  END WHILE;

  -- the sale row (trg_credit_sales_bi checks blocked status and credit limit)
  INSERT INTO credit_sales (shop_customer_id, staff_user_id, sold_at, total_amount, due_date, status, note)
  VALUES (p_shop_customer_id, p_staff_user_id, NOW(), v_total,
          CURDATE() + INTERVAL v_due_days DAY, 'open', p_note);
  SET p_sale_id = LAST_INSERT_ID();

  -- pass 2: the item rows (trg_credit_sale_items_bi lowers the stock).
  -- Values go in through variables: an INSERT that read shop_products in a
  -- subquery could not fire a trigger that updates shop_products (error 1442).
  SET v_i = 0;
  WHILE v_i < v_count DO
    SET v_product = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].shop_product_id')));
    SET v_qty     = JSON_UNQUOTE(JSON_EXTRACT(p_items, CONCAT('$[', v_i, '].qty')));
    SET v_price   = (SELECT sell_price FROM shop_products WHERE shop_product_id = v_product);
    INSERT INTO credit_sale_items (sale_id, shop_product_id, qty, unit_price)
    VALUES (p_sale_id, v_product, v_qty, v_price);
    SET v_i = v_i + 1;
  END WHILE;

  COMMIT;
END$$

-- P3. sp_record_payment
--     Records a payment and spreads it over the account's unpaid sales,
--     oldest first (FIFO). Disputed sales are skipped. A payment larger than
--     what is owed is refused, so no money is left unallocated.
CREATE PROCEDURE sp_record_payment(
  IN  p_shop_customer_id INT UNSIGNED,
  IN  p_amount           DECIMAL(12,2),
  IN  p_method           VARCHAR(10),
  IN  p_trx_ref          VARCHAR(40),
  IN  p_received_by      INT UNSIGNED,
  OUT p_payment_id       INT UNSIGNED)
BEGIN
  DECLARE v_shop       INT UNSIGNED DEFAULT NULL;
  DECLARE v_payable    DECIMAL(12,2);
  DECLARE v_remaining  DECIMAL(12,2);
  DECLARE v_sale       INT UNSIGNED;
  DECLARE v_sale_bal   DECIMAL(12,2);
  DECLARE v_take       DECIMAL(12,2);
  DECLARE v_msg        VARCHAR(128);
  DECLARE EXIT HANDLER FOR 1062
  BEGIN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This transaction ID has already been recorded';
  END;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_payment_id = NULL;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment amount must be more than 0';
  END IF;

  START TRANSACTION;

  SELECT shop_id INTO v_shop
  FROM shop_customers
  WHERE shop_customer_id = p_shop_customer_id
  FOR UPDATE;
  IF v_shop IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Customer account not found';
  END IF;

  IF (SELECT COUNT(*) FROM shops WHERE shop_id = v_shop AND owner_user_id = p_received_by)
   + (SELECT COUNT(*) FROM shop_staff WHERE shop_id = v_shop AND user_id = p_received_by AND left_on IS NULL) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This user does not work at this shop';
  END IF;

  SET v_payable = (SELECT COALESCE(SUM(balance), 0) FROM v_sale_balance
                    WHERE shop_customer_id = p_shop_customer_id
                      AND balance > 0 AND status <> 'disputed');
  IF p_amount > v_payable THEN
    SET v_msg = CONCAT('Payment is more than the amount owed (Tk ', v_payable, ')');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  INSERT INTO payments (shop_customer_id, amount, method, trx_ref, received_by, paid_at)
  VALUES (p_shop_customer_id, p_amount, p_method, NULLIF(p_trx_ref, ''), p_received_by, NOW());
  SET p_payment_id = LAST_INSERT_ID();

  -- FIFO: always clear the oldest unpaid sale first
  SET v_remaining = p_amount;
  WHILE v_remaining > 0 DO
    SET v_sale = NULL;
    SELECT sale_id, balance INTO v_sale, v_sale_bal
    FROM v_sale_balance
    WHERE shop_customer_id = p_shop_customer_id
      AND balance > 0 AND status <> 'disputed'
    ORDER BY sold_at, sale_id
    LIMIT 1;
    IF v_sale IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Balance changed while saving; please try again';
    END IF;

    SET v_take = LEAST(v_remaining, v_sale_bal);
    INSERT INTO payment_allocations (payment_id, sale_id, amount)
    VALUES (p_payment_id, v_sale, v_take);      -- triggers check it and refresh the sale status
    SET v_remaining = v_remaining - v_take;
  END WHILE;

  COMMIT;
END$$

-- P4. sp_add_adjustment
--     The only way to correct a sale: return, discount, correction or
--     write-off. Only the shop owner or a manager can approve one.
CREATE PROCEDURE sp_add_adjustment(
  IN  p_sale_id     INT UNSIGNED,
  IN  p_type        VARCHAR(12),
  IN  p_amount      DECIMAL(12,2),
  IN  p_reason      VARCHAR(255),
  IN  p_approved_by INT UNSIGNED,
  OUT p_adjustment_id INT UNSIGNED)
BEGIN
  DECLARE v_shop    INT UNSIGNED DEFAULT NULL;
  DECLARE v_balance DECIMAL(12,2);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  SET p_adjustment_id = NULL;
  START TRANSACTION;

  SELECT sc.shop_id INTO v_shop
  FROM credit_sales cs
  JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
  WHERE cs.sale_id = p_sale_id
  FOR UPDATE;
  IF v_shop IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sale not found';
  END IF;

  IF (SELECT COUNT(*) FROM shops WHERE shop_id = v_shop AND owner_user_id = p_approved_by)
   + (SELECT COUNT(*) FROM shop_staff WHERE shop_id = v_shop AND user_id = p_approved_by
         AND staff_role = 'manager' AND left_on IS NULL) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only the shop owner or a manager can approve an adjustment';
  END IF;

  SET v_balance = (SELECT balance FROM v_sale_balance WHERE sale_id = p_sale_id);
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_balance THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Adjustment must be more than 0 and not more than the sale balance';
  END IF;

  INSERT INTO adjustments (sale_id, adj_type, amount, reason, approved_by)
  VALUES (p_sale_id, p_type, p_amount, p_reason, p_approved_by);   -- trigger refreshes the status
  SET p_adjustment_id = LAST_INSERT_ID();

  COMMIT;
END$$

-- P5. sp_calculate_trust_score
--     Scores one customer from 0 to 100 using their history at ALL shops.
--     Start: on-time % of settled sales in the last 12 months (60 if none)
--     Minus: average days late (max -24), broken promises (max -20),
--            each extra shop owed (max -15), overdue sales now (max -15),
--            bad-debt write-offs (max -30).
--     Uses SET ... = (SELECT aggregate) only, which always returns one row,
--     so no "no data" warning can leak into the cursor loop in P6.
CREATE PROCEDURE sp_calculate_trust_score(IN p_customer_id INT UNSIGNED)
BEGIN
  DECLARE v_settled      INT;
  DECLARE v_on_time      INT;
  DECLARE v_late_days    DECIMAL(12,2);
  DECLARE v_overdue      INT;
  DECLARE v_overdue_days DECIMAL(12,2);
  DECLARE v_broken       INT;
  DECLARE v_shops_owed   INT;
  DECLARE v_writeoffs    INT;
  DECLARE v_outstanding  DECIMAL(12,2);
  DECLARE v_on_time_pct  DECIMAL(5,2);
  DECLARE v_avg_late     DECIMAL(10,2);
  DECLARE v_score        DECIMAL(8,2);

  SET v_settled = (SELECT COUNT(*) FROM v_sale_balance
                    WHERE customer_id = p_customer_id AND status = 'paid'
                      AND sold_at >= NOW() - INTERVAL 12 MONTH);
  SET v_on_time = (SELECT COUNT(*) FROM v_sale_balance
                    WHERE customer_id = p_customer_id AND status = 'paid'
                      AND sold_at >= NOW() - INTERVAL 12 MONTH
                      AND COALESCE(CAST(last_paid_at AS DATE), due_date) <= due_date);
  SET v_late_days = (SELECT COALESCE(SUM(GREATEST(DATEDIFF(last_paid_at, due_date), 0)), 0)
                       FROM v_sale_balance
                      WHERE customer_id = p_customer_id AND status = 'paid'
                        AND sold_at >= NOW() - INTERVAL 12 MONTH
                        AND last_paid_at IS NOT NULL);
  SET v_overdue = (SELECT COUNT(*) FROM v_sale_balance
                    WHERE customer_id = p_customer_id AND days_overdue > 0);
  SET v_overdue_days = (SELECT COALESCE(SUM(days_overdue), 0) FROM v_sale_balance
                         WHERE customer_id = p_customer_id AND days_overdue > 0);
  SET v_broken = (SELECT COUNT(*) FROM promises pr
                    JOIN shop_customers sc ON sc.shop_customer_id = pr.shop_customer_id
                   WHERE sc.customer_id = p_customer_id AND pr.status = 'broken'
                     AND pr.promised_date >= CURDATE() - INTERVAL 180 DAY);
  SET v_shops_owed = (SELECT COUNT(DISTINCT shop_id) FROM v_sale_balance
                       WHERE customer_id = p_customer_id AND balance > 0);
  SET v_writeoffs = (SELECT COUNT(*) FROM adjustments a
                       JOIN credit_sales cs   ON cs.sale_id = a.sale_id
                       JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
                      WHERE sc.customer_id = p_customer_id AND a.adj_type = 'write_off');
  SET v_outstanding = (SELECT COALESCE(SUM(balance), 0) FROM v_sale_balance
                        WHERE customer_id = p_customer_id AND balance > 0);

  SET v_on_time_pct = IF(v_settled = 0, NULL, ROUND(100 * v_on_time / v_settled, 2));
  SET v_avg_late = IF(v_settled + v_overdue = 0, 0,
                      ROUND((v_late_days + v_overdue_days) / (v_settled + v_overdue), 2));

  SET v_score = COALESCE(v_on_time_pct, 60)
              - LEAST(v_avg_late, 30) * 0.8
              - LEAST(v_broken, 5) * 4
              - LEAST(GREATEST(v_shops_owed - 1, 0), 3) * 5
              - LEAST(v_overdue, 5) * 3
              - LEAST(v_writeoffs, 3) * 10;
  SET v_score = GREATEST(0, LEAST(100, ROUND(v_score)));

  INSERT INTO customer_trust_scores
         (customer_id, score, on_time_pct, avg_days_late, settled_sales, overdue_sales,
          broken_promises, shops_owed, write_offs, total_outstanding, calculated_at)
  VALUES (p_customer_id, v_score, v_on_time_pct, LEAST(v_avg_late, 9999), v_settled, v_overdue,
          v_broken, v_shops_owed, v_writeoffs, v_outstanding, NOW())
  ON DUPLICATE KEY UPDATE
          score = VALUES(score), on_time_pct = VALUES(on_time_pct),
          avg_days_late = VALUES(avg_days_late), settled_sales = VALUES(settled_sales),
          overdue_sales = VALUES(overdue_sales), broken_promises = VALUES(broken_promises),
          shops_owed = VALUES(shops_owed), write_offs = VALUES(write_offs),
          total_outstanding = VALUES(total_outstanding), calculated_at = VALUES(calculated_at);
END$$

-- P6. sp_refresh_all_trust_scores
--     Walks every customer with a cursor and recalculates their score.
CREATE PROCEDURE sp_refresh_all_trust_scores()
BEGIN
  DECLARE v_done     INT DEFAULT 0;
  DECLARE v_customer INT UNSIGNED;
  DECLARE cur_customers CURSOR FOR
    SELECT DISTINCT customer_id FROM shop_customers ORDER BY customer_id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur_customers;
  read_loop: LOOP
    FETCH cur_customers INTO v_customer;
    IF v_done = 1 THEN
      LEAVE read_loop;
    END IF;
    CALL sp_calculate_trust_score(v_customer);
  END LOOP;
  CLOSE cur_customers;
END$$

-- P7. sp_generate_statements
--     Builds month-end statements for every account that had any activity
--     up to the end of p_month. Safe to run again: it updates the rows.
CREATE PROCEDURE sp_generate_statements(IN p_month DATE)
BEGIN
  DECLARE v_start DATE;
  DECLARE v_end   DATE;
  SET v_start = DATE_FORMAT(p_month, '%Y-%m-01');
  SET v_end   = v_start + INTERVAL 1 MONTH;

  INSERT INTO monthly_statements
         (shop_customer_id, statement_month, opening_balance, credit_total,
          paid_total, adjustment_total, closing_balance, generated_at)
  SELECT t.shop_customer_id, v_start,
         t.credit_before - t.paid_before - t.adj_before,
         t.credit_in, t.paid_in, t.adj_in,
         t.credit_before - t.paid_before - t.adj_before + t.credit_in - t.paid_in - t.adj_in,
         NOW()
  FROM (
    SELECT sc.shop_customer_id,
      (SELECT COALESCE(SUM(cs.total_amount), 0) FROM credit_sales cs
        WHERE cs.shop_customer_id = sc.shop_customer_id AND cs.sold_at < v_start)  AS credit_before,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        WHERE p.shop_customer_id = sc.shop_customer_id AND p.paid_at < v_start)    AS paid_before,
      (SELECT COALESCE(SUM(a.amount), 0) FROM adjustments a
         JOIN credit_sales cs ON cs.sale_id = a.sale_id
        WHERE cs.shop_customer_id = sc.shop_customer_id AND a.created_at < v_start) AS adj_before,
      (SELECT COALESCE(SUM(cs.total_amount), 0) FROM credit_sales cs
        WHERE cs.shop_customer_id = sc.shop_customer_id
          AND cs.sold_at >= v_start AND cs.sold_at < v_end)                        AS credit_in,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
        WHERE p.shop_customer_id = sc.shop_customer_id
          AND p.paid_at >= v_start AND p.paid_at < v_end)                          AS paid_in,
      (SELECT COALESCE(SUM(a.amount), 0) FROM adjustments a
         JOIN credit_sales cs ON cs.sale_id = a.sale_id
        WHERE cs.shop_customer_id = sc.shop_customer_id
          AND a.created_at >= v_start AND a.created_at < v_end)                    AS adj_in
    FROM shop_customers sc
  ) AS t
  WHERE t.credit_before + t.credit_in > 0
  ON DUPLICATE KEY UPDATE
    opening_balance  = VALUES(opening_balance),
    credit_total     = VALUES(credit_total),
    paid_total       = VALUES(paid_total),
    adjustment_total = VALUES(adjustment_total),
    closing_balance  = VALUES(closing_balance),
    generated_at     = VALUES(generated_at);
END$$

DELIMITER ;


-- =====================================================================
-- PART 4. TRIGGERS
-- =====================================================================

DELIMITER $$

-- T1. Refuse a credit sale if the account is blocked or the sale would push
--     the balance over the credit limit.
CREATE TRIGGER trg_credit_sales_bi
BEFORE INSERT ON credit_sales
FOR EACH ROW
BEGIN
  DECLARE v_status  VARCHAR(10);
  DECLARE v_limit   DECIMAL(12,2);
  DECLARE v_balance DECIMAL(12,2);
  DECLARE v_msg     VARCHAR(128);

  IF @disable_triggers IS NULL THEN
    SET v_status = (SELECT status FROM shop_customers WHERE shop_customer_id = NEW.shop_customer_id);
    SET v_limit  = (SELECT credit_limit FROM shop_customers WHERE shop_customer_id = NEW.shop_customer_id);
    IF v_status <> 'active' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This customer account is blocked or closed; no new credit';
    END IF;

    SET v_balance = (SELECT COALESCE(SUM(total_amount), 0) FROM credit_sales
                      WHERE shop_customer_id = NEW.shop_customer_id)
                  - (SELECT COALESCE(SUM(pa.amount), 0) FROM payment_allocations pa
                       JOIN credit_sales cs ON cs.sale_id = pa.sale_id
                      WHERE cs.shop_customer_id = NEW.shop_customer_id)
                  - (SELECT COALESCE(SUM(a.amount), 0) FROM adjustments a
                       JOIN credit_sales cs ON cs.sale_id = a.sale_id
                      WHERE cs.shop_customer_id = NEW.shop_customer_id);
    IF v_balance + NEW.total_amount > v_limit THEN
      SET v_msg = CONCAT('Credit limit exceeded: owes Tk ', v_balance, ', this sale Tk ',
                         NEW.total_amount, ', limit Tk ', v_limit);
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
  END IF;
END$$

-- T2. A recorded sale's money and history can't be edited. Only the status,
--     the note, and a LATER due date (an extension) may change.
CREATE TRIGGER trg_credit_sales_bu
BEFORE UPDATE ON credit_sales
FOR EACH ROW
BEGIN
  IF NEW.total_amount <> OLD.total_amount
     OR NEW.shop_customer_id <> OLD.shop_customer_id
     OR NEW.staff_user_id <> OLD.staff_user_id
     OR NEW.sold_at <> OLD.sold_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A recorded sale cannot be edited; add an adjustment instead';
  END IF;
  IF NEW.due_date < OLD.due_date THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A due date can only be extended, not brought forward';
  END IF;
END$$

-- T3. Sales are never deleted.
CREATE TRIGGER trg_credit_sales_bd
BEFORE DELETE ON credit_sales
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger rows cannot be deleted; add an adjustment instead';
END$$

-- T4. An item must come from the same shop as the sale, and there must be
--     enough stock. Then the stock goes down.
CREATE TRIGGER trg_credit_sale_items_bi
BEFORE INSERT ON credit_sale_items
FOR EACH ROW
BEGIN
  DECLARE v_sale_shop INT UNSIGNED;
  DECLARE v_item_shop INT UNSIGNED;
  DECLARE v_track     TINYINT;
  DECLARE v_stock     DECIMAL(10,2);
  DECLARE v_name      VARCHAR(100);
  DECLARE v_msg       VARCHAR(128);

  IF @disable_triggers IS NULL THEN
    SET v_sale_shop = (SELECT sc.shop_id FROM credit_sales cs
                         JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
                        WHERE cs.sale_id = NEW.sale_id);
    SET v_item_shop = (SELECT shop_id     FROM shop_products WHERE shop_product_id = NEW.shop_product_id);
    SET v_track     = (SELECT track_stock FROM shop_products WHERE shop_product_id = NEW.shop_product_id);
    SET v_stock     = (SELECT stock_qty   FROM shop_products WHERE shop_product_id = NEW.shop_product_id);

    IF v_item_shop IS NULL OR v_item_shop <> v_sale_shop THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This product does not belong to the shop of this sale';
    END IF;

    IF v_track = 1 THEN
      IF v_stock < NEW.qty THEN
        SET v_name = (SELECT p.name FROM shop_products sp JOIN products p ON p.product_id = sp.product_id
                       WHERE sp.shop_product_id = NEW.shop_product_id);
        SET v_msg = LEFT(CONCAT('Not enough stock: ', v_name, ' (', v_stock, ' left)'), 128);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
      END IF;
      UPDATE shop_products SET stock_qty = stock_qty - NEW.qty
       WHERE shop_product_id = NEW.shop_product_id;
    END IF;
  END IF;
END$$

-- T5. A recorded payment's money can't be edited (only the note).
CREATE TRIGGER trg_payments_bu
BEFORE UPDATE ON payments
FOR EACH ROW
BEGIN
  IF NEW.amount <> OLD.amount
     OR NEW.shop_customer_id <> OLD.shop_customer_id
     OR NEW.method <> OLD.method
     OR NOT (NEW.trx_ref <=> OLD.trx_ref)
     OR NEW.paid_at <> OLD.paid_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A recorded payment cannot be edited';
  END IF;
END$$

-- T6. Payments are never deleted.
CREATE TRIGGER trg_payments_bd
BEFORE DELETE ON payments
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ledger rows cannot be deleted';
END$$

-- T7. An allocation must stay inside its payment and inside the sale's
--     balance, and both must belong to the same customer account.
CREATE TRIGGER trg_payment_allocations_bi
BEFORE INSERT ON payment_allocations
FOR EACH ROW
BEGIN
  DECLARE v_pay_account  INT UNSIGNED;
  DECLARE v_sale_account INT UNSIGNED;
  DECLARE v_pay_amount   DECIMAL(12,2);
  DECLARE v_allocated    DECIMAL(12,2);
  DECLARE v_sale_balance DECIMAL(12,2);

  IF @disable_triggers IS NULL THEN
    SET v_pay_account  = (SELECT shop_customer_id FROM payments     WHERE payment_id = NEW.payment_id);
    SET v_pay_amount   = (SELECT amount           FROM payments     WHERE payment_id = NEW.payment_id);
    SET v_sale_account = (SELECT shop_customer_id FROM credit_sales WHERE sale_id    = NEW.sale_id);

    IF v_pay_account <> v_sale_account THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Payment and sale belong to different customer accounts';
    END IF;

    SET v_allocated = (SELECT COALESCE(SUM(amount), 0) FROM payment_allocations
                        WHERE payment_id = NEW.payment_id);
    IF v_allocated + NEW.amount > v_pay_amount THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocations cannot add up to more than the payment';
    END IF;

    SET v_sale_balance = (SELECT total_amount FROM credit_sales WHERE sale_id = NEW.sale_id)
                       - (SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE sale_id = NEW.sale_id)
                       - (SELECT COALESCE(SUM(amount), 0) FROM adjustments WHERE sale_id = NEW.sale_id);
    IF NEW.amount > v_sale_balance THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Allocation is more than the sale balance';
    END IF;
  END IF;
END$$

-- T8. After money is allocated, update the sale's status.
CREATE TRIGGER trg_payment_allocations_ai
AFTER INSERT ON payment_allocations
FOR EACH ROW
BEGIN
  IF @disable_triggers IS NULL THEN
    CALL sp_refresh_sale_status(NEW.sale_id);
  END IF;
END$$

-- T9. After an adjustment, update the sale's status.
CREATE TRIGGER trg_adjustments_ai
AFTER INSERT ON adjustments
FOR EACH ROW
BEGIN
  IF @disable_triggers IS NULL THEN
    CALL sp_refresh_sale_status(NEW.sale_id);
  END IF;
END$$

-- T10. A new dispute marks the sale 'disputed'.
CREATE TRIGGER trg_disputes_ai
AFTER INSERT ON disputes
FOR EACH ROW
BEGIN
  IF @disable_triggers IS NULL THEN
    CALL sp_refresh_sale_status(NEW.sale_id);
  END IF;
END$$

-- T11. A resolved dispute puts the sale back to its normal status.
CREATE TRIGGER trg_disputes_au
AFTER UPDATE ON disputes
FOR EACH ROW
BEGIN
  IF @disable_triggers IS NULL AND NOT (NEW.status <=> OLD.status) THEN
    CALL sp_refresh_sale_status(NEW.sale_id);
  END IF;
END$$

-- T12. A customer can't guarantee themselves, and the guarantor must also
--      be a customer of the same shop.
CREATE TRIGGER trg_customer_guarantors_bi
BEFORE INSERT ON customer_guarantors
FOR EACH ROW
BEGIN
  DECLARE v_customer INT UNSIGNED;
  DECLARE v_shop     INT UNSIGNED;

  SET v_customer = (SELECT customer_id FROM shop_customers WHERE shop_customer_id = NEW.shop_customer_id);
  SET v_shop     = (SELECT shop_id     FROM shop_customers WHERE shop_customer_id = NEW.shop_customer_id);
  IF v_customer = NEW.guarantor_customer_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A customer cannot be their own guarantor';
  END IF;
  IF (SELECT COUNT(*) FROM shop_customers
       WHERE shop_id = v_shop AND customer_id = NEW.guarantor_customer_id) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The guarantor must also be a customer of this shop';
  END IF;
END$$

-- T13. Every change to a credit limit, due days or account status is logged.
--      The PHP API runs SET @app_user = '<user name>' so the log shows who did it.
CREATE TRIGGER trg_shop_customers_au
AFTER UPDATE ON shop_customers
FOR EACH ROW
BEGIN
  IF NOT (NEW.credit_limit <=> OLD.credit_limit)
     OR NOT (NEW.due_days <=> OLD.due_days)
     OR NOT (NEW.status <=> OLD.status) THEN
    INSERT INTO audit_log (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES ('shop_customers', NEW.shop_customer_id, 'UPDATE',
            JSON_OBJECT('credit_limit', OLD.credit_limit, 'due_days', OLD.due_days,
                        'status', OLD.status, 'blocked_reason', OLD.blocked_reason),
            JSON_OBJECT('credit_limit', NEW.credit_limit, 'due_days', NEW.due_days,
                        'status', NEW.status, 'blocked_reason', NEW.blocked_reason),
            COALESCE(@app_user, CURRENT_USER()));
  END IF;
END$$

DELIMITER ;


-- =====================================================================
-- PART 5. SCHEDULED EVENTS
--   XAMPP turns the event scheduler off after every restart. To keep it
--   on, add  event_scheduler=ON  under [mysqld] in my.ini (Windows) or
--   my.cnf (macOS: /Applications/XAMPP/xamppfiles/etc/my.cnf).
-- =====================================================================

SET GLOBAL event_scheduler = ON;

-- E1. Every night: unpaid sales past their due date become 'overdue'.
CREATE EVENT ev_mark_overdue
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 5 MINUTE
DO
  UPDATE credit_sales
     SET status = 'overdue'
   WHERE status IN ('open','partially_paid')
     AND due_date < CURDATE();

DELIMITER $$

-- E2. Every night: settle promises. Kept if the customer paid at least the
--     promised amount between the promise and its date; otherwise broken
--     once the date has passed.
CREATE EVENT ev_check_promises
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 10 MINUTE
DO
BEGIN
  UPDATE promises pr
     SET pr.status = 'kept', pr.resolved_at = NOW()
   WHERE pr.status = 'pending'
     AND (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
           WHERE p.shop_customer_id = pr.shop_customer_id
             AND p.paid_at >= pr.created_at
             AND p.paid_at <  pr.promised_date + INTERVAL 1 DAY) >= pr.promised_amount;

  UPDATE promises
     SET status = 'broken', resolved_at = NOW()
   WHERE status = 'pending'
     AND promised_date < CURDATE();
END$$

-- E3. Every night: queue reminders 1-3 days before the due date, on the due
--     date, and once a sale is 7+ days late. The unique key on
--     (sale_id, reminder_type) means each reminder is queued only once.
CREATE EVENT ev_queue_reminders
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 15 MINUTE
DO
BEGIN
  INSERT IGNORE INTO reminders (shop_customer_id, sale_id, reminder_type, channel, message, scheduled_for)
  SELECT sb.shop_customer_id, sb.sale_id, 'before_due', 'sms',
         LEFT(CONCAT(s.name, ': Tk ', FORMAT(sb.balance, 0), ' baki is due on ',
                     DATE_FORMAT(sb.due_date, '%d %b'), '.'), 255),
         CURDATE()
  FROM v_sale_balance sb JOIN shops s ON s.shop_id = sb.shop_id
  WHERE sb.balance > 0 AND sb.status <> 'disputed'
    AND sb.due_date BETWEEN CURDATE() + INTERVAL 1 DAY AND CURDATE() + INTERVAL 3 DAY;

  INSERT IGNORE INTO reminders (shop_customer_id, sale_id, reminder_type, channel, message, scheduled_for)
  SELECT sb.shop_customer_id, sb.sale_id, 'on_due', 'sms',
         LEFT(CONCAT(s.name, ': Tk ', FORMAT(sb.balance, 0), ' baki is due today.'), 255),
         CURDATE()
  FROM v_sale_balance sb JOIN shops s ON s.shop_id = sb.shop_id
  WHERE sb.balance > 0 AND sb.status <> 'disputed'
    AND sb.due_date BETWEEN CURDATE() - INTERVAL 6 DAY AND CURDATE();

  INSERT IGNORE INTO reminders (shop_customer_id, sale_id, reminder_type, channel, message, scheduled_for)
  SELECT sb.shop_customer_id, sb.sale_id, 'overdue', 'sms',
         LEFT(CONCAT(s.name, ': Tk ', FORMAT(sb.balance, 0), ' baki is ', sb.days_overdue,
                     ' days late. Please pay soon.'), 255),
         CURDATE()
  FROM v_sale_balance sb JOIN shops s ON s.shop_id = sb.shop_id
  WHERE sb.balance > 0 AND sb.status <> 'disputed'
    AND sb.days_overdue >= 7;
END$$

DELIMITER ;

-- E4. Every night: recalculate every customer's trust score.
CREATE EVENT ev_trust_scores
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY + INTERVAL 30 MINUTE
DO
  CALL sp_refresh_all_trust_scores();

-- E5. On the 1st of every month: statements for the month that just ended.
CREATE EVENT ev_monthly_statements
ON SCHEDULE EVERY 1 MONTH
STARTS DATE_FORMAT(CURRENT_DATE + INTERVAL 1 MONTH, '%Y-%m-01') + INTERVAL 1 HOUR
DO
  CALL sp_generate_statements(DATE_FORMAT(CURRENT_DATE - INTERVAL 1 MONTH, '%Y-%m-01'));

-- End of schema.sql. Next: import seed.sql.
