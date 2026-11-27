// login, logout, register, claim
import { Hono } from 'hono';
import {
  claimSchema,
  claimStartSchema,
  loginSchema,
  normalizePhone,
  PHONE_REGEX,
  registerShopSchema,
  type UserRole,
} from '@dokankhata/shared';
import { execute, query, queryOne, withTx } from '../db';
import { AppError } from '../errors';
import { requireAuth } from '../auth/guards';
import { buildSessionUser, createSession, destroySession } from '../auth/session';
import type { AppEnv } from '../lib/env-types';
import { hashPassword, verifyPassword } from '../lib/password';
import { validate } from '../lib/validate';

export const authRoutes = new Hono<AppEnv>()
  // POST /api/auth/login - { identifier: phone or email, password }
  .post('/login', validate('json', loginSchema), async (c) => {
    const { identifier, password } = c.req.valid('json');
    const phone = normalizePhone(identifier);
    const byPhone = PHONE_REGEX.test(phone);
    const sqlColumn = byPhone ? 'phone' : 'email'; // fixed column name, never user input

    const user = await queryOne<{
      userId: number;
      fullName: string;
      phone: string;
      email: string | null;
      role: UserRole;
      status: 'active' | 'suspended';
      passwordHash: string;
    }>(
      `SELECT user_id, full_name, phone, email, role, status, password_hash
         FROM users WHERE ${sqlColumn} = ?`,
      [byPhone ? phone : identifier.toLowerCase()],
    );

    // same message for wrong phone and wrong password so nobody can check which numbers exist
    if (!user || !(await verifyPassword(password, user.passwordHash)))
      throw new AppError(401, 'BAD_CREDENTIALS', 'Wrong phone/email or password');
    if (user.status !== 'active')
      throw new AppError(
        403,
        'SUSPENDED',
        'This account is suspended. Contact DokanKhata support.',
      );

    await createSession(c, user.userId);
    await execute('UPDATE users SET last_login_at = NOW() WHERE user_id = ?', [user.userId]);
    return c.json(await buildSessionUser(user));
  })

  // POST /api/auth/logout
  .post('/logout', async (c) => {
    await destroySession(c);
    return c.json({ ok: true });
  })

  // GET /api/auth/me - the logged-in user, or 401
  .get('/me', requireAuth, (c) => c.json(c.get('user')))

  // POST /api/auth/register-shop
  // makes the owner's login and the shop together. the shop starts as 'pending'
  // until an admin approves it, but the owner can log in and look around straight away
  .post('/register-shop', validate('json', registerShopSchema), async (c) => {
    const { owner, shop } = c.req.valid('json');

    const taken = await queryOne<{ userId: number }>('SELECT user_id FROM users WHERE phone = ?', [
      owner.phone,
    ]);
    if (taken)
      throw new AppError(
        409,
        'DUPLICATE',
        'This phone number already has an account. Log in instead.',
      );

    const area = await queryOne<{ areaId: number }>('SELECT area_id FROM areas WHERE area_id = ?', [
      shop.areaId,
    ]);
    if (!area) throw new AppError(422, 'BAD_REFERENCE', 'Pick an area from the list');

    const passwordHash = await hashPassword(owner.password);
    const userId = await withTx(owner.fullName, async (conn) => {
      const u = await execute(
        `INSERT INTO users (full_name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')`,
        [owner.fullName, owner.phone, owner.email || null, passwordHash],
        conn,
      );
      await execute(
        `INSERT INTO shops (owner_user_id, area_id, name, shop_type, trade_licence_no, address, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          u.insertId,
          shop.areaId,
          shop.name,
          shop.shopType,
          shop.tradeLicenceNo || null,
          shop.address,
          shop.phone || owner.phone,
        ],
        conn,
      );
      return u.insertId;
    });

    await createSession(c, userId);
    return c.json(
      await buildSessionUser({
        userId,
        fullName: owner.fullName,
        phone: owner.phone,
        email: owner.email || null,
        role: 'owner',
      }),
      201,
    );
  })

  // POST /api/auth/claim/start
  // step 1 of the customer login: is this number a customer somewhere, and do they already have a login?
  // there's no SMS gateway yet so the code is always DEMO_OTP, and we hand it back in dev so the page can show it
  .post('/claim/start', validate('json', claimStartSchema), async (c) => {
    const { phone } = c.req.valid('json');
    const customer = await claimableCustomer(phone);
    return c.json({
      firstName: customer.fullName.split(' ')[0] ?? customer.fullName,
      shops: customer.shops,
      demoCode: process.env.NODE_ENV === 'production' ? undefined : DEMO_OTP,
    });
  })

  // POST /api/auth/claim
  // step 2: check the code, make a customer login and link it to their customer row
  .post('/claim', validate('json', claimSchema), async (c) => {
    const { phone, otp, password } = c.req.valid('json');
    if (otp !== DEMO_OTP)
      throw new AppError(422, 'BAD_CODE', 'That code is not right. Check the SMS and try again.');
    const customer = await claimableCustomer(phone);

    const passwordHash = await hashPassword(password);
    const userId = await withTx(customer.fullName, async (conn) => {
      const u = await execute(
        `INSERT INTO users (full_name, phone, password_hash, role) VALUES (?, ?, ?, 'customer')`,
        [customer.fullName, phone, passwordHash],
        conn,
      );
      // user_id IS NULL here too, in case two claims race each other
      const upd = await execute(
        'UPDATE customers SET user_id = ? WHERE customer_id = ? AND user_id IS NULL',
        [u.insertId, customer.customerId],
        conn,
      );
      if (upd.affectedRows !== 1)
        throw new AppError(409, 'DUPLICATE', 'This account was already claimed');
      return u.insertId;
    });

    await createSession(c, userId);
    return c.json(
      await buildSessionUser({
        userId,
        fullName: customer.fullName,
        phone,
        email: null,
        role: 'customer',
      }),
      201,
    );
  });

// prototype OTP, see /claim/start
const DEMO_OTP = '123456';

// the phone has to belong to a customer who doesn't have a login yet,
// and no other account (owner/staff) can be using that number
async function claimableCustomer(phone: string) {
  const customer = await queryOne<{ customerId: number; fullName: string; userId: number | null }>(
    'SELECT customer_id, full_name, user_id FROM customers WHERE phone = ?',
    [phone],
  );
  if (!customer)
    throw new AppError(
      404,
      'NOT_FOUND',
      'No shop on DokanKhata has this number yet. Ask your shop to add you first.',
    );
  if (customer.userId)
    throw new AppError(409, 'DUPLICATE', 'You already have a login. Log in with this number.');
  const user = await queryOne<{ userId: number }>('SELECT user_id FROM users WHERE phone = ?', [
    phone,
  ]);
  if (user) throw new AppError(409, 'DUPLICATE', 'This number already has a DokanKhata login.');

  const shops = await query<{ shopName: string }>(
    `SELECT s.name AS shop_name FROM shop_customers sc JOIN shops s ON s.shop_id = sc.shop_id
      WHERE sc.customer_id = ? ORDER BY s.name`,
    [customer.customerId],
  );
  return { ...customer, shops: shops.map((s) => s.shopName) };
}
