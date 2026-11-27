// customer portal, mounted at /api/portal  (role = customer)
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const portalRoutes = new Hono<AppEnv>()
  // GET /balances - my balance at every shop (v_customer_balance WHERE customer_id = me)
  .get('/balances', notImplemented('Member 4'))
  // GET /statement/:shopCustomerId - my running statement at one shop (reuse Q7)
  .get('/statement/:shopCustomerId', notImplemented('Member 4'))
  // GET /trust - my trust score + components + perfect-payer badge (Q5, Q17)
  .get('/trust', notImplemented('Member 4'))
  // POST /disputes - raise a dispute on one of MY sales
  .post('/disputes', notImplemented('Member 4'))
  // POST /pay - bKash/Nagad PROTOTYPE: simulated gateway, then sp_record_payment with received_by = shop owner
  .post('/pay', notImplemented('Member 4'));
