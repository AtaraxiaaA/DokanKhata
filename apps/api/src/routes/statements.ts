// monthly statements, mounted at /api/shops/:shopId/statements
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const statementRoutes = new Hono<AppEnv>()
  // GET / - list ?month=YYYY-MM-01
  .get('/', notImplemented('Member 2'))
  // POST /generate - CALL sp_generate_statements(month). Manager only.
  .post('/generate', notImplemented('Member 2'));
