// promise-to-pay, mounted at /api/shops/:shopId/promises
import { Hono } from 'hono';
import { z } from 'zod';
import { newPromiseSchema, PROMISE_STATUSES } from '@dokankhata/shared';
import { execute, query, withConn } from '../db';
import type { AppEnv } from '../lib/env-types';
import { accountInShop } from '../lib/ownership';
import { validate } from '../lib/validate';

export const promiseRoutes = new Hono<AppEnv>()
  // GET /?status=pending|kept|broken
  // the nightly event (ev_check_promises) is what flips them to kept or broken
  .get(
    '/',
    validate('query', z.object({ status: z.enum(PROMISE_STATUSES).optional() })),
    async (c) => {
      const { status } = c.req.valid('query');
      const params: unknown[] = [c.get('shop').shopId];
      let sqlStatus = '';
      if (status) {
        sqlStatus = 'AND pr.status = ?';
        params.push(status);
      }
      const rows = await query<{
        promiseId: number;
        shopCustomerId: number;
        customerName: string;
        phone: string;
        promisedAmount: number;
        promisedDate: string;
        status: string;
        createdAt: string;
        resolvedAt: string | null;
        recordedBy: string;
        balance: number;
      }>(
        `SELECT pr.promise_id, pr.shop_customer_id, c.full_name AS customer_name, c.phone,
              pr.promised_amount, pr.promised_date, pr.status, pr.created_at, pr.resolved_at,
              u.full_name AS recorded_by, b.balance
         FROM promises pr
         JOIN shop_customers sc    ON sc.shop_customer_id = pr.shop_customer_id
         JOIN customers c          ON c.customer_id = sc.customer_id
         JOIN users u              ON u.user_id = pr.recorded_by
         JOIN v_customer_balance b ON b.shop_customer_id = pr.shop_customer_id
        WHERE sc.shop_id = ? ${sqlStatus}
        ORDER BY pr.status = 'pending' DESC, pr.promised_date DESC`,
        params,
      );
      return c.json(rows);
    },
  )

  // GET /repeat-breakers (Q11) - customers here with 2 or more broken promises
  .get('/repeat-breakers', async (c) => {
    const rows = await query<{
      shopCustomerId: number;
      fullName: string;
      phone: string;
      brokenCount: number;
      brokenAmount: number;
      lastBroken: string;
      balance: number;
    }>(
      `SELECT sc.shop_customer_id, c.full_name, c.phone,
              COUNT(*) AS broken_count, SUM(pr.promised_amount) AS broken_amount,
              MAX(pr.promised_date) AS last_broken, b.balance
         FROM promises pr
         JOIN shop_customers sc    ON sc.shop_customer_id = pr.shop_customer_id
         JOIN customers c          ON c.customer_id = sc.customer_id
         JOIN v_customer_balance b ON b.shop_customer_id = sc.shop_customer_id
        WHERE sc.shop_id = ? AND pr.status = 'broken'
        GROUP BY sc.shop_customer_id, c.full_name, c.phone, b.balance
       HAVING COUNT(*) >= 2
        ORDER BY broken_count DESC, broken_amount DESC`,
      [c.get('shop').shopId],
    );
    return c.json(rows);
  })

  // POST / - "I'll pay 2000 on the 5th"
  .post('/', validate('json', newPromiseSchema), async (c) => {
    const { shopCustomerId, promisedAmount, promisedDate } = c.req.valid('json');
    await accountInShop(shopCustomerId, c.get('shop').shopId);
    const r = await withConn(c.get('user').fullName, (conn) =>
      execute(
        'INSERT INTO promises (shop_customer_id, promised_amount, promised_date, recorded_by) VALUES (?, ?, ?, ?)',
        [shopCustomerId, promisedAmount, promisedDate, c.get('user').userId],
        conn,
      ),
    );
    return c.json({ promiseId: r.insertId }, 201);
  });
