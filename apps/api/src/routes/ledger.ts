// customer ledger & statement, mounted at /api/shops/:shopId/ledger
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const ledgerRoutes = new Hono<AppEnv>()
  // GET /:shopCustomerId - running statement: sales, payments, adjustments with SUM() OVER running balance (Q7)
  .get('/:shopCustomerId', notImplemented('Member 2'));
