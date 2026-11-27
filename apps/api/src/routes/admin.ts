// platform admin, mounted at /api/admin  (role = admin)
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const adminRoutes = new Hono<AppEnv>()
  // GET /overview - platform KPIs
  .get('/overview', notImplemented('Member 1'))
  // GET /shops - shops ?status=pending
  .get('/shops', notImplemented('Member 1'))
  // PATCH /shops/:shopId/verify - approve/suspend a shop (sets verified_by, verified_at)
  .patch('/shops/:shopId/verify', notImplemented('Member 1'))
  // GET /users - users ?role=&q=
  .get('/users', notImplemented('Member 1'))
  // PATCH /users/:userId - suspend / reactivate (also delete their user_sessions)
  .patch('/users/:userId', notImplemented('Member 1'))
  // GET /audit-log - audit_log ?table=&from=&to=
  .get('/audit-log', notImplemented('Member 1'))
  // GET /reports/area-risk - overdue rate by area/thana (Q14)
  .get('/reports/area-risk', notImplemented('Member 1'))
  // GET /reports/exposure - customers owing 3+ shops (Q3)
  .get('/reports/exposure', notImplemented('Member 1'));
