// reports & analytics, mounted at /api/shops/:shopId/reports
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const reportRoutes = new Hono<AppEnv>()
  // GET /aging - v_aging + per-customer buckets (Q1)
  .get('/aging', notImplemented('Member 4'))
  // GET /trend - monthly credit vs collected with LAG() (Q8)
  .get('/trend', notImplemented('Member 4'))
  // GET /festival - credit before festivals vs normal weeks, uses festivals table (Q9)
  .get('/festival', notImplemented('Member 4'))
  // GET /top-debtors - RANK() OVER (PARTITION BY shop) (Q10)
  .get('/top-debtors', notImplemented('Member 4'))
  // GET /staff - credit given vs collected, disputes, red flags (Q13)
  .get('/staff', notImplemented('Member 4'))
  // GET /products - most bought on baki by product/category (Q15)
  .get('/products', notImplemented('Member 4'));
