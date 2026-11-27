// shop settings + dashboard, mounted at /api/shops/:shopId/settings
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const settingsRoutes = new Hono<AppEnv>()
  // GET / - shop profile + default credit limit / due days
  .get('/', notImplemented('Member 3'))
  // PATCH / - update profile and defaults. Manager only.
  .patch('/', notImplemented('Member 3'))
  // GET /dashboard - KPIs: outstanding, overdue, collected this month, DSO (Q16), over-limit (Q2), vanished (Q4)
  .get('/dashboard', notImplemented('Member 3'));
