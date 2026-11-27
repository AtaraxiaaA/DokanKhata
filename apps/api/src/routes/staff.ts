// staff, mounted at /api/shops/:shopId/staff
import { Hono } from 'hono';
import { newStaffSchema, updateStaffSchema } from '@dokankhata/shared';
import { requireShopAccess } from '../auth/guards';
import { execute, query, queryOne, withConn, withTx } from '../db';
import { AppError, notFound } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { paramId } from '../lib/ownership';
import { hashPassword } from '../lib/password';
import { validate } from '../lib/validate';

export const staffRoutes = new Hono<AppEnv>()
  // GET / - current staff first, then people who left
  .get('/', async (c) => {
    const rows = await query<{
      userId: number;
      fullName: string;
      phone: string;
      staffRole: string;
      canGiveCredit: number;
      joinedOn: string;
      leftOn: string | null;
      userStatus: string;
      lastLoginAt: string | null;
    }>(
      `SELECT u.user_id, u.full_name, u.phone, ss.staff_role, ss.can_give_credit, ss.joined_on, ss.left_on,
              u.status AS user_status, u.last_login_at
         FROM shop_staff ss JOIN users u ON u.user_id = ss.user_id
        WHERE ss.shop_id = ?
        ORDER BY ss.left_on IS NOT NULL, ss.staff_role, u.full_name`,
      [c.get('shop').shopId],
    );
    return c.json(rows.map((r) => ({ ...r, canGiveCredit: r.canGiveCredit === 1 })));
  })

  // POST / - add someone by phone. if they don't have a login yet we make one (role staff),
  // which is why the password is only needed for new people. owner or manager
  .post('/', requireShopAccess({ manager: true }), validate('json', newStaffSchema), async (c) => {
    const b = c.req.valid('json');
    const shopId = c.get('shop').shopId;
    const existing = await queryOne<{ userId: number; role: string }>(
      'SELECT user_id, role FROM users WHERE phone = ?',
      [b.phone],
    );
    if (existing && existing.role !== 'staff')
      throw new AppError(
        422,
        'BUSINESS_RULE',
        `This number belongs to a ${existing.role} account, it can't be added as staff`,
      );
    if (!existing && !b.password)
      throw new AppError(400, 'VALIDATION', 'Set a password for the new staff login', [
        { path: 'password', message: 'Required for a new login' },
      ]);

    const passwordHash = b.password ? await hashPassword(b.password) : null;
    const userId = await withTx(c.get('user').fullName, async (conn) => {
      let id = existing?.userId;
      if (!id) {
        const u = await execute(
          `INSERT INTO users (full_name, phone, password_hash, role) VALUES (?, ?, ?, 'staff')`,
          [b.fullName, b.phone, passwordHash],
          conn,
        );
        id = u.insertId;
      }
      // someone who left before can be taken back on
      await execute(
        `INSERT INTO shop_staff (shop_id, user_id, staff_role, can_give_credit, joined_on)
         VALUES (?, ?, ?, ?, CURDATE())
         ON DUPLICATE KEY UPDATE staff_role = VALUES(staff_role), can_give_credit = VALUES(can_give_credit),
                                 joined_on = IF(left_on IS NULL, joined_on, CURDATE()), left_on = NULL`,
        [shopId, id, b.staffRole, b.canGiveCredit ? 1 : 0],
        conn,
      );
      return id;
    });
    return c.json({ userId }, 201);
  })

  // PATCH /:userId - change role, credit permission, or mark them as left today
  .patch(
    '/:userId',
    requireShopAccess({ manager: true }),
    validate('json', updateStaffSchema),
    async (c) => {
      const userId = paramId(c, 'userId');
      const b = c.req.valid('json');
      if (userId === c.get('user').userId && b.left)
        throw new AppError(422, 'BUSINESS_RULE', "You can't remove yourself");

      const cols: [string, unknown][] = [];
      if (b.staffRole !== undefined) cols.push(['staff_role = ?', b.staffRole]);
      if (b.canGiveCredit !== undefined)
        cols.push(['can_give_credit = ?', b.canGiveCredit ? 1 : 0]);
      if (b.left === true) cols.push(['left_on = CURDATE()', undefined]);
      if (b.left === false) cols.push(['left_on = NULL', undefined]);
      if (!cols.length) return c.json({ ok: true });

      const sqlSet = cols.map(([frag]) => frag).join(', ');
      const params = cols.filter(([, v]) => v !== undefined).map(([, v]) => v);
      const r = await withConn(c.get('user').fullName, (conn) =>
        execute(
          `UPDATE shop_staff SET ${sqlSet} WHERE shop_id = ? AND user_id = ?`,
          [...params, c.get('shop').shopId, userId],
          conn,
        ),
      );
      if (!r.affectedRows) throw notFound('Staff member');
      return c.json({ ok: true });
    },
  );
