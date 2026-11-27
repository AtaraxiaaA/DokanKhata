// login sessions. the browser gets a random token in an HttpOnly cookie and we only
// store sha256(token) in user_sessions, so a leaked table can't be used to log in
import { createHash, randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { SessionUser, ShopMembership, UserRole } from '@dokankhata/shared';
import { env } from '../env';
import { execute, query, queryOne } from '../db';

export const SESSION_COOKIE = 'dk_session';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(c: Context, userId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  await execute(
    `INSERT INTO user_sessions (session_id, user_id, expires_at, ip_address, user_agent)
     VALUES (?, ?, NOW() + INTERVAL ? DAY, ?, ?)`,
    [
      hashToken(token),
      userId,
      env.SESSION_DAYS,
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      c.req.header('user-agent')?.slice(0, 255) ?? null,
    ],
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: env.COOKIE_SECURE,
    path: '/',
    maxAge: env.SESSION_DAYS * 86400,
  });
}

export async function destroySession(c: Context): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await execute('DELETE FROM user_sessions WHERE session_id = ?', [hashToken(token)]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

interface UserRow {
  userId: number;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
  lastSeenAt: string;
  sessionId: string;
}

// returns the logged-in user or null (expired sessions and suspended users count as logged out)
export async function loadSessionUser(c: Context): Promise<SessionUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await queryOne<UserRow>(
    `SELECT u.user_id, u.full_name, u.phone, u.email, u.role, s.last_seen_at, s.session_id
       FROM user_sessions s
       JOIN users u ON u.user_id = s.user_id
      WHERE s.session_id = ? AND s.expires_at > NOW() AND u.status = 'active'`,
    [hashToken(token)],
  );
  if (!row) return null;

  // only update last_seen every 5 min, no need to write on every request
  await execute(
    `UPDATE user_sessions SET last_seen_at = NOW()
      WHERE session_id = ? AND last_seen_at < NOW() - INTERVAL 5 MINUTE`,
    [row.sessionId],
  );

  return buildSessionUser(row);
}

export async function buildSessionUser(
  u: Omit<UserRow, 'lastSeenAt' | 'sessionId'>,
): Promise<SessionUser> {
  // shops this user owns or still works at
  const shops = await query<{
    shopId: number;
    shopName: string;
    shopStatus: ShopMembership['shopStatus'];
    role: ShopMembership['role'];
    canGiveCredit: number;
  }>(
    `SELECT s.shop_id, s.name AS shop_name, s.status AS shop_status, 'owner' AS role, 1 AS can_give_credit
       FROM shops s WHERE s.owner_user_id = ?
     UNION
     SELECT s.shop_id, s.name, s.status, ss.staff_role, ss.can_give_credit
       FROM shop_staff ss JOIN shops s ON s.shop_id = ss.shop_id
      WHERE ss.user_id = ? AND ss.left_on IS NULL
       AND s.owner_user_id <> ?
     ORDER BY shop_name`,
    [u.userId, u.userId, u.userId],
  );

  const customer =
    u.role === 'customer'
      ? await queryOne<{ customerId: number }>(
          'SELECT customer_id FROM customers WHERE user_id = ?',
          [u.userId],
        )
      : null;

  return {
    userId: u.userId,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    role: u.role,
    customerId: customer?.customerId ?? null,
    shops: shops.map((s) => ({ ...s, canGiveCredit: s.canGiveCredit === 1 })),
  };
}
