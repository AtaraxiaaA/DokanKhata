// shop settings and the dashboard numbers, mounted at /api/shops/:shopId/settings
import { Hono } from 'hono';
import { updateShopSchema } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { execute, query, queryOne, withConn } from '../db';
import type { AppEnv } from '../lib/env-types';
import { validate } from '../lib/validate';

export const settingsRoutes = new Hono<AppEnv>()
  // GET / - shop profile
  .get('/', async (c) => {
    const shop = await queryOne<{
      shopId: number;
      name: string;
      shopType: string;
      tradeLicenceNo: string | null;
      address: string;
      phone: string;
      areaId: number;
      areaName: string;
      thana: string;
      district: string;
      defaultCreditLimit: number;
      defaultDueDays: number;
      status: string;
      verifiedAt: string | null;
      createdAt: string;
      ownerName: string;
    }>(
      `SELECT s.shop_id, s.name, s.shop_type, s.trade_licence_no, s.address, s.phone, s.area_id,
              a.name AS area_name, a.thana, a.district, s.default_credit_limit, s.default_due_days,
              s.status, s.verified_at, s.created_at, u.full_name AS owner_name
         FROM shops s
         JOIN areas a ON a.area_id = s.area_id
         JOIN users u ON u.user_id = s.owner_user_id
        WHERE s.shop_id = ?`,
      [c.get('shop').shopId],
    );
    return c.json(shop!);
  })

  // PATCH / - owner or manager. the new defaults only apply to customers added from now on
  .patch(
    '/',
    requireShopAccess({ manager: true }),
    validate('json', updateShopSchema),
    async (c) => {
      const b = c.req.valid('json');
      const map: [keyof typeof b, string][] = [
        ['name', 'name'],
        ['shopType', 'shop_type'],
        ['tradeLicenceNo', 'trade_licence_no'],
        ['areaId', 'area_id'],
        ['address', 'address'],
        ['phone', 'phone'],
        ['defaultCreditLimit', 'default_credit_limit'],
        ['defaultDueDays', 'default_due_days'],
      ];
      const cols = map.filter(([k]) => b[k] !== undefined);
      if (!cols.length) return c.json({ ok: true });
      const sqlSet = cols.map(([, col]) => `${col} = ?`).join(', ');
      await withConn(c.get('user').fullName, (conn) =>
        execute(
          `UPDATE shops SET ${sqlSet} WHERE shop_id = ?`,
          [...cols.map(([k]) => b[k]), c.get('shop').shopId],
          conn,
        ),
      );
      return c.json({ ok: true });
    },
  )

  // GET /dashboard - everything on the shop's home page in one call
  .get('/dashboard', async (c) => {
    const shopId = c.get('shop').shopId;
    const [kpis, aging, overLimit, vanished, dso, lowStock, dueSoon] = await Promise.all([
      queryOne<{
        customersOwing: number;
        totalOutstanding: number;
        overdueAmount: number;
        collectedThisMonth: number;
        creditThisMonth: number;
      }>(
        `SELECT o.customers_owing, o.total_outstanding, o.overdue_amount,
                (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
                   JOIN shop_customers sc ON sc.shop_customer_id = p.shop_customer_id
                  WHERE sc.shop_id = o.shop_id AND p.paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS collected_this_month,
                (SELECT COALESCE(SUM(cs.total_amount), 0) FROM credit_sales cs
                   JOIN shop_customers sc ON sc.shop_customer_id = cs.shop_customer_id
                  WHERE sc.shop_id = o.shop_id AND cs.sold_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS credit_this_month
           FROM v_shop_outstanding o WHERE o.shop_id = ?`,
        [shopId],
      ),
      queryOne<{
        notYetDue: number;
        overdue130: number;
        overdue3160: number;
        overdue6190: number;
        overdue90Plus: number;
      }>(
        `SELECT not_yet_due, overdue_1_30, overdue_31_60, overdue_61_90, overdue_90_plus
           FROM v_aging WHERE shop_id = ?`,
        [shopId],
      ),
      // Q2: accounts whose balance is over their credit limit
      query<{
        shopCustomerId: number;
        fullName: string;
        phone: string;
        balance: number;
        creditLimit: number;
        overBy: number;
        status: string;
      }>(
        `SELECT b.shop_customer_id, b.full_name, b.phone, b.balance, b.credit_limit,
                b.balance - b.credit_limit AS over_by, b.status
           FROM v_customer_balance b
          WHERE b.shop_id = ? AND b.balance > b.credit_limit
          ORDER BY over_by DESC`,
        [shopId],
      ),
      // Q4: still owe money but haven't bought or paid anything in 60 days
      query<{
        shopCustomerId: number;
        fullName: string;
        phone: string;
        balance: number;
        lastPurchaseAt: string | null;
        lastPaymentAt: string | null;
      }>(
        `SELECT b.shop_customer_id, b.full_name, b.phone, b.balance, b.last_purchase_at,
                (SELECT MAX(p.paid_at) FROM payments p WHERE p.shop_customer_id = b.shop_customer_id) AS last_payment_at
           FROM v_customer_balance b
          WHERE b.shop_id = ? AND b.balance > 0
            AND NOT EXISTS (SELECT 1 FROM credit_sales cs
                             WHERE cs.shop_customer_id = b.shop_customer_id AND cs.sold_at >= NOW() - INTERVAL 60 DAY)
            AND NOT EXISTS (SELECT 1 FROM payments p
                             WHERE p.shop_customer_id = b.shop_customer_id AND p.paid_at >= NOW() - INTERVAL 60 DAY)
          ORDER BY b.balance DESC`,
        [shopId],
      ),
      // Q16: days sales outstanding, how long the shop waits to get paid (paid sales, last 90 days)
      queryOne<{ dso: number | null; paidSales: number }>(
        `SELECT ROUND(AVG(DATEDIFF(sb.last_paid_at, sb.sold_at)), 1) AS dso, COUNT(*) AS paid_sales
           FROM v_sale_balance sb
          WHERE sb.shop_id = ? AND sb.status = 'paid' AND sb.last_paid_at IS NOT NULL
            AND sb.sold_at >= NOW() - INTERVAL 90 DAY`,
        [shopId],
      ),
      query<{
        shopProductId: number;
        name: string;
        unit: string;
        stockQty: number;
        reorderLevel: number;
      }>(
        `SELECT sp.shop_product_id, p.name, p.unit, sp.stock_qty, sp.reorder_level
           FROM shop_products sp JOIN products p ON p.product_id = sp.product_id
          WHERE sp.shop_id = ? AND sp.is_active = 1 AND sp.track_stock = 1 AND sp.stock_qty <= sp.reorder_level
          ORDER BY sp.stock_qty / NULLIF(sp.reorder_level, 0)`,
        [shopId],
      ),
      query<{
        saleId: number;
        shopCustomerId: number;
        customerName: string;
        dueDate: string;
        balance: number;
      }>(
        `SELECT sb.sale_id, sb.shop_customer_id, c.full_name AS customer_name, sb.due_date, sb.balance
           FROM v_sale_balance sb JOIN customers c ON c.customer_id = sb.customer_id
          WHERE sb.shop_id = ? AND sb.balance > 0 AND sb.status <> 'disputed'
            AND sb.due_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY
          ORDER BY sb.due_date`,
        [shopId],
      ),
    ]);
    return c.json({
      kpis: kpis!,
      aging: aging!,
      overLimit,
      vanished,
      dso: dso!,
      lowStock,
      dueSoon,
    });
  });
