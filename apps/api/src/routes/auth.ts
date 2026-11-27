// login, logout, register, claim
import { Hono } from 'hono';
import { loginSchema, normalizePhone, PHONE_REGEX, type UserRole } from '@dokankhata/shared';
import { execute, queryOne } from '../db';
import { AppError, notImplemented } from '../errors';
import { requireAuth } from '../auth/guards';
import { buildSessionUser, createSession, destroySession } from '../auth/session';
import type { AppEnv } from '../lib/env-types';
import { verifyPassword } from '../lib/password';
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

  // POST /api/auth/register-shop - owner account + pending shop in one transaction
  .post('/register-shop', notImplemented('Member 1'))

  // POST /api/auth/claim - customer claims a portal login for their phone
  .post('/claim', notImplemented('Member 1'));
