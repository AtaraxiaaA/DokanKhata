// staff management, mounted at /api/shops/:shopId/staff
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const staffRoutes = new Hono<AppEnv>()
  // GET / - current + past staff
  .get('/', notImplemented('Member 3'))
  // POST / - add staff (create user role=staff if phone is new). Manager only.
  .post('/', notImplemented('Member 3'))
  // PATCH /:userId - role, can_give_credit, left_on. Manager only.
  .patch('/:userId', notImplemented('Member 3'));
