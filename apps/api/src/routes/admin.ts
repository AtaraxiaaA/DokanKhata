// platform admin, mounted at /api/admin (admins only)
import { Hono } from 'hono';
import { z } from 'zod';
import {
  dateRangeQuery,
  pageQuery,
  SHOP_STATUSES,
  updateUserStatusSchema,
  USER_ROLES,
  verifyShopSchema,
} from '@dokankhata/shared';
import { execute, query, queryOne, withConn, withTx } from '../db';
import { AppError, notFound } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { paramId } from '../lib/ownership';
import { validate } from '../lib/validate';

export const adminRoutes = new Hono<AppEnv>()
  // GET /overview - the numbers on the admin home page
  .get('/overview', async (c) => {
    const [counts, money, recentShops, shopsByStatus] = await Promise.all([
      queryOne<{
        shops: number;
        pendingShops: number;
        customers: number;
        users: number;
        salesLast30: number;
        creditLast30: number;
      }>(
        `SELECT (SELECT COUNT(*) FROM shops) AS shops,
                (SELECT COUNT(*) FROM shops WHERE status = 'pending') AS pending_shops,
                (SELECT COUNT(*) FROM customers) AS customers,
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM credit_sales WHERE sold_at >= NOW() - INTERVAL 30 DAY) AS sales_last30,
                (SELECT COALESCE(SUM(total_amount), 0) FROM credit_sales WHERE sold_at >= NOW() - INTERVAL 30 DAY) AS credit_last30`,
      ),
      queryOne<{ totalOutstanding: number; overdueAmount: number; customersOwing: number }>(
        `SELECT COALESCE(SUM(total_outstanding), 0) AS total_outstanding,
                COALESCE(SUM(overdue_amount), 0) AS overdue_amount,
                COALESCE(SUM(customers_owing), 0) AS customers_owing
           FROM v_shop_outstanding`,
      ),
      query<{
        shopId: number;
        name: string;
        shopType: string;
        status: string;
        createdAt: string;
        ownerName: string;
        areaName: string;
      }>(
        `SELECT s.shop_id, s.name, s.shop_type, s.status, s.created_at, u.full_name AS owner_name, a.name AS area_name
           FROM shops s JOIN users u ON u.user_id = s.owner_user_id JOIN areas a ON a.area_id = s.area_id
          ORDER BY s.created_at DESC LIMIT 5`,
      ),
      query<{ status: string; n: number }>(
        'SELECT status, COUNT(*) AS n FROM shops GROUP BY status',
      ),
    ]);
    return c.json({ counts: counts!, money: money!, recentShops, shopsByStatus });
  })

  // GET /shops?status=pending
  .get(
    '/shops',
    validate(
      'query',
      z.object({ status: z.enum(SHOP_STATUSES).optional(), q: z.string().trim().optional() }),
    ),
    async (c) => {
      const { status, q } = c.req.valid('query');
      const where: string[] = [];
      const params: unknown[] = [];
      if (status) {
        where.push('s.status = ?');
        params.push(status);
      }
      if (q) {
        where.push('(s.name LIKE ? OR u.full_name LIKE ? OR s.trade_licence_no LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = await query<{
        shopId: number;
        name: string;
        shopType: string;
        tradeLicenceNo: string | null;
        address: string;
        phone: string;
        status: string;
        createdAt: string;
        verifiedAt: string | null;
        verifiedBy: string | null;
        ownerName: string;
        ownerPhone: string;
        areaName: string;
        thana: string;
        district: string;
        customers: number;
        outstanding: number;
      }>(
        `SELECT s.shop_id, s.name, s.shop_type, s.trade_licence_no, s.address, s.phone, s.status, s.created_at,
              s.verified_at, v.full_name AS verified_by, u.full_name AS owner_name, u.phone AS owner_phone,
              a.name AS area_name, a.thana, a.district,
              (SELECT COUNT(*) FROM shop_customers sc WHERE sc.shop_id = s.shop_id) AS customers,
              o.total_outstanding AS outstanding
         FROM shops s
         JOIN users u ON u.user_id = s.owner_user_id
         JOIN areas a ON a.area_id = s.area_id
         LEFT JOIN users v ON v.user_id = s.verified_by
         JOIN v_shop_outstanding o ON o.shop_id = s.shop_id
         ${sqlWhere}
        ORDER BY s.status = 'pending' DESC, s.created_at DESC`,
        params,
      );
      return c.json(rows);
    },
  )

  // PATCH /shops/:shopId/verify - approve a pending shop, suspend one, or bring it back.
  // the schema needs verified_by / verified_at on anything that isn't pending, so we fill
  // them in whichever way it goes
  .patch('/shops/:shopId/verify', validate('json', verifyShopSchema), async (c) => {
    const shopId = paramId(c, 'shopId');
    const { action } = c.req.valid('json');
    const shop = await queryOne<{ status: string }>('SELECT status FROM shops WHERE shop_id = ?', [
      shopId,
    ]);
    if (!shop) throw notFound('Shop');
    if (action === 'approve' && shop.status !== 'pending')
      throw new AppError(422, 'BUSINESS_RULE', 'Only pending shops can be approved');
    if (action === 'reactivate' && shop.status !== 'suspended')
      throw new AppError(422, 'BUSINESS_RULE', 'This shop is not suspended');

    const newStatus = action === 'suspend' ? 'suspended' : 'active';
    await withConn(c.get('user').fullName, (conn) =>
      execute(
        `UPDATE shops SET status = ?, verified_by = COALESCE(verified_by, ?), verified_at = COALESCE(verified_at, NOW())
          WHERE shop_id = ?`,
        [newStatus, c.get('user').userId, shopId],
        conn,
      ),
    );
    return c.json({ ok: true, status: newStatus });
  })

  // GET /users?role=&status=&q=
  .get(
    '/users',
    validate(
      'query',
      z.object({
        role: z.enum(USER_ROLES).optional(),
        status: z.enum(['active', 'suspended']).optional(),
        q: z.string().trim().optional(),
        ...pageQuery,
      }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.role) {
        where.push('u.role = ?');
        params.push(f.role);
      }
      if (f.status) {
        where.push('u.status = ?');
        params.push(f.status);
      }
      if (f.q) {
        where.push('(u.full_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)');
        params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
      }
      const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = await query<{
        userId: number;
        fullName: string;
        phone: string;
        email: string | null;
        role: string;
        status: string;
        lastLoginAt: string | null;
        createdAt: string;
        shops: string | null;
      }>(
        `SELECT u.user_id, u.full_name, u.phone, u.email, u.role, u.status, u.last_login_at, u.created_at,
                (SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ')
                   FROM shops s
                  WHERE s.owner_user_id = u.user_id
                     OR s.shop_id IN (SELECT ss.shop_id FROM shop_staff ss WHERE ss.user_id = u.user_id AND ss.left_on IS NULL)
                ) AS shops
           FROM users u
           ${sqlWhere}
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      );
      const total = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users u ${sqlWhere}`,
        params,
      );
      return c.json({ rows, total: total?.n ?? 0 });
    },
  )

  // PATCH /users/:userId - suspend or reactivate. suspending also deletes their sessions
  // so they get logged out everywhere straight away
  .patch('/users/:userId', validate('json', updateUserStatusSchema), async (c) => {
    const userId = paramId(c, 'userId');
    const { status } = c.req.valid('json');
    if (userId === c.get('user').userId)
      throw new AppError(422, 'BUSINESS_RULE', "You can't suspend yourself");
    await withTx(c.get('user').fullName, async (conn) => {
      const r = await execute(
        'UPDATE users SET status = ? WHERE user_id = ?',
        [status, userId],
        conn,
      );
      if (!r.affectedRows) throw notFound('User');
      if (status === 'suspended')
        await execute('DELETE FROM user_sessions WHERE user_id = ?', [userId], conn);
    });
    return c.json({ ok: true });
  })

  // GET /audit-log?table=&from=&to= - who changed what
  .get(
    '/audit-log',
    validate(
      'query',
      z.object({ table: z.string().trim().max(64).optional(), ...dateRangeQuery, ...pageQuery }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.table) {
        where.push('l.table_name = ?');
        params.push(f.table);
      }
      if (f.from) {
        where.push('l.changed_at >= ?');
        params.push(f.from);
      }
      if (f.to) {
        where.push('l.changed_at < ? + INTERVAL 1 DAY');
        params.push(f.to);
      }
      const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = await query<{
        logId: number;
        tableName: string;
        recordId: number;
        action: string;
        oldValue: string | null;
        newValue: string | null;
        changedBy: string;
        changedAt: string;
        customerName: string | null;
        shopName: string | null;
      }>(
        `SELECT l.log_id, l.table_name, l.record_id, l.action, l.old_value, l.new_value, l.changed_by, l.changed_at,
              c.full_name AS customer_name, s.name AS shop_name
         FROM audit_log l
         LEFT JOIN shop_customers sc ON l.table_name = 'shop_customers' AND sc.shop_customer_id = l.record_id
         LEFT JOIN customers c       ON c.customer_id = sc.customer_id
         LEFT JOIN shops s           ON s.shop_id = sc.shop_id
         ${sqlWhere}
        ORDER BY l.changed_at DESC, l.log_id DESC
        LIMIT ? OFFSET ?`,
        [...params, f.limit, f.offset],
      );
      const total = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM audit_log l ${sqlWhere}`,
        params,
      );
      // old/new are stored as JSON text
      const parse = (v: string | null) => {
        try {
          return v ? (JSON.parse(v) as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      };
      return c.json({
        rows: rows.map((r) => ({ ...r, oldValue: parse(r.oldValue), newValue: parse(r.newValue) })),
        total: total?.n ?? 0,
      });
    },
  )

  // GET /reports/area-risk?level=area|thana|district (Q14) - overdue share of money owed, by place
  .get(
    '/reports/area-risk',
    validate('query', z.object({ level: z.enum(['area', 'thana', 'district']).default('area') })),
    async (c) => {
      const { level } = c.req.valid('query');
      // only these fixed GROUP BYs are possible, nothing from the user goes into the SQL
      const sqlGroup = {
        area: 'a.division, a.district, a.thana, a.name',
        thana: 'a.division, a.district, a.thana',
        district: 'a.division, a.district',
      }[level];
      const sqlPlace = { area: 'a.name', thana: 'a.thana', district: 'a.district' }[level];
      const sqlThana = level === 'district' ? 'NULL' : 'a.thana';
      const rows = await query<{
        division: string;
        district: string;
        thana: string | null;
        place: string;
        shops: number;
        customersOwing: number;
        outstanding: number;
        overdue: number;
        overduePct: number | null;
        overdueSales: number;
      }>(
        `SELECT a.division, a.district, ${sqlThana} AS thana, ${sqlPlace} AS place,
              COUNT(DISTINCT s.shop_id) AS shops,
              COUNT(DISTINCT CASE WHEN sb.balance > 0 THEN sb.shop_customer_id END) AS customers_owing,
              COALESCE(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0)      AS outstanding,
              COALESCE(SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END), 0) AS overdue,
              ROUND(100 * SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance END)
                        / NULLIF(SUM(CASE WHEN sb.balance > 0 THEN sb.balance END), 0), 1) AS overdue_pct,
              COUNT(CASE WHEN sb.days_overdue > 0 THEN 1 END) AS overdue_sales
         FROM areas a
         JOIN shops s ON s.area_id = a.area_id
         LEFT JOIN v_sale_balance sb ON sb.shop_id = s.shop_id
        GROUP BY ${sqlGroup}
        ORDER BY overdue_pct DESC, overdue DESC`,
      );
      return c.json(rows);
    },
  )

  // GET /reports/exposure?minShops=3 (Q3) - people who owe money at several shops at once
  .get(
    '/reports/exposure',
    validate('query', z.object({ minShops: z.coerce.number().int().min(2).max(10).default(3) })),
    async (c) => {
      const { minShops } = c.req.valid('query');
      const rows = await query<{
        customerId: number;
        fullName: string;
        phone: string;
        shopsOwed: number;
        totalOutstanding: number;
        overdueAmount: number;
        maxDaysOverdue: number;
        shopNames: string;
        trustScore: number | null;
      }>(
        `SELECT c.customer_id, c.full_name, c.phone,
              COUNT(DISTINCT sb.shop_id) AS shops_owed,
              SUM(sb.balance) AS total_outstanding,
              SUM(CASE WHEN sb.days_overdue > 0 THEN sb.balance ELSE 0 END) AS overdue_amount,
              MAX(sb.days_overdue) AS max_days_overdue,
              GROUP_CONCAT(DISTINCT s.name ORDER BY s.name SEPARATOR ', ') AS shop_names,
              t.score AS trust_score
         FROM v_sale_balance sb
         JOIN customers c ON c.customer_id = sb.customer_id
         JOIN shops s     ON s.shop_id = sb.shop_id
         LEFT JOIN customer_trust_scores t ON t.customer_id = c.customer_id
        WHERE sb.balance > 0
        GROUP BY c.customer_id, c.full_name, c.phone, t.score
       HAVING COUNT(DISTINCT sb.shop_id) >= ?
        ORDER BY shops_owed DESC, total_outstanding DESC`,
        [minShops],
      );
      return c.json(rows);
    },
  );
