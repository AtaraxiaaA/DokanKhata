// disputes (shop side), mounted at /api/shops/:shopId/disputes
import { Hono } from 'hono';
import { notImplemented } from '../errors';
import type { AppEnv } from '../lib/env-types';

export const disputeRoutes = new Hono<AppEnv>()
  // GET / - list ?status=open
  .get('/', notImplemented('Member 2'))
  // PATCH /:disputeId - resolve: accepted/rejected + resolution (trigger restores sale status). Manager only.
  .patch('/:disputeId', notImplemented('Member 2'));
