// reminder queue, mounted at /api/shops/:shopId/reminders
// ev_queue_reminders fills this every night. we don't have an SMS gateway yet,
// so "sending" is just the shop marking them sent from the page
import { Hono } from 'hono';
import { z } from 'zod';
import {
  dateSchema,
  REMINDER_STATUSES,
  REMINDER_TYPES,
  updateReminderSchema,
} from '@dokankhata/shared';
import { execute, query, withConn } from '../db';
import { notFound } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { paramId } from '../lib/ownership';
import { validate } from '../lib/validate';

export const reminderRoutes = new Hono<AppEnv>()
  // GET /?status=queued&type=&date=
  .get(
    '/',
    validate(
      'query',
      z.object({
        status: z.enum(REMINDER_STATUSES).optional(),
        type: z.enum(REMINDER_TYPES).optional(),
        date: dateSchema.optional(),
      }),
    ),
    async (c) => {
      const f = c.req.valid('query');
      const where = ['sc.shop_id = ?'];
      const params: unknown[] = [c.get('shop').shopId];
      if (f.status) {
        where.push('r.status = ?');
        params.push(f.status);
      }
      if (f.type) {
        where.push('r.reminder_type = ?');
        params.push(f.type);
      }
      if (f.date) {
        where.push('r.scheduled_for = ?');
        params.push(f.date);
      }
      const sqlWhere = where.join(' AND ');
      const rows = await query<{
        reminderId: number;
        shopCustomerId: number;
        saleId: number | null;
        reminderType: string;
        channel: string;
        message: string;
        scheduledFor: string;
        status: string;
        sentAt: string | null;
        customerName: string;
        phone: string;
      }>(
        `SELECT r.reminder_id, r.shop_customer_id, r.sale_id, r.reminder_type, r.channel, r.message,
                r.scheduled_for, r.status, r.sent_at, c.full_name AS customer_name, c.phone
           FROM reminders r
           JOIN shop_customers sc ON sc.shop_customer_id = r.shop_customer_id
           JOIN customers c       ON c.customer_id = sc.customer_id
          WHERE ${sqlWhere}
          ORDER BY r.status = 'queued' DESC, r.scheduled_for DESC, r.reminder_id DESC
          LIMIT 500`,
        params,
      );
      return c.json(rows);
    },
  )

  // PATCH /:reminderId - mark sent, failed or cancelled
  .patch('/:reminderId', validate('json', updateReminderSchema), async (c) => {
    const id = paramId(c, 'reminderId');
    const { status } = c.req.valid('json');
    const r = await withConn(c.get('user').fullName, (conn) =>
      execute(
        `UPDATE reminders r JOIN shop_customers sc ON sc.shop_customer_id = r.shop_customer_id
            SET r.status = ?, r.sent_at = IF(? = 'sent', NOW(), NULL)
          WHERE r.reminder_id = ? AND sc.shop_id = ?`,
        [status, status, id, c.get('shop').shopId],
        conn,
      ),
    );
    if (!r.affectedRows) throw notFound('Reminder');
    return c.json({ ok: true });
  })

  // POST /mark-all-sent - everything queued for today or earlier
  .post('/mark-all-sent', async (c) => {
    const r = await withConn(c.get('user').fullName, (conn) =>
      execute(
        `UPDATE reminders r JOIN shop_customers sc ON sc.shop_customer_id = r.shop_customer_id
            SET r.status = 'sent', r.sent_at = NOW()
          WHERE sc.shop_id = ? AND r.status = 'queued' AND r.scheduled_for <= CURDATE()`,
        [c.get('shop').shopId],
        conn,
      ),
    );
    return c.json({ updated: r.affectedRows });
  });
