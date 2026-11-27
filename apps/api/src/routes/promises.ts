// promise-to-pay, mounted at /api/shops/:shopId/promises
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const promiseRoutes = new Hono<AppEnv>()
  // GET / - list ?status=pending|kept|broken
  .get('/', notImplemented('Member 3'))
  // POST / - record a promise { shopCustomerId, promisedAmount, promisedDate }
  .post('/', notImplemented('Member 3'))
  // GET /repeat-breakers - customers with 2+ broken promises (Q11)
  .get('/repeat-breakers', notImplemented('Member 3'));
