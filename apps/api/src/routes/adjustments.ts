// adjustments & write-offs, mounted at /api/shops/:shopId/adjustments
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const adjustmentRoutes = new Hono<AppEnv>()
  // GET / - list ?type=&from=&to=
  .get('/', notImplemented('Member 2'))
  // POST / - return/discount/correction/write_off -> sp_add_adjustment. Manager only.
  .post('/', notImplemented('Member 2'));
