// payments, mounted at /api/shops/:shopId/payments
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const paymentRoutes = new Hono<AppEnv>()
  // POST / - record a payment -> sp_record_payment (FIFO allocation). Body: newPaymentSchema
  .post('/', notImplemented('Member 2'))
  // GET / - payment history ?from=&to=&method=&shopCustomerId=
  .get('/', notImplemented('Member 2'))
  // GET /preview - FIFO preview ?shopCustomerId=&amount=  which sales this amount would clear (no write)
  .get('/preview', notImplemented('Member 2'))
  // GET /:paymentId - payment + its allocations (Q6 FIFO trace)
  .get('/:paymentId', notImplemented('Member 2'));
