// reminder queue, mounted at /api/shops/:shopId/reminders
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const reminderRoutes = new Hono<AppEnv>()
  // GET / - queue ?status=queued&date=
  .get('/', notImplemented('Member 3'))
  // PATCH /:reminderId - mark sent / failed / cancelled (prototype: no real SMS)
  .patch('/:reminderId', notImplemented('Member 3'));
