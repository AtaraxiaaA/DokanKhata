// all the API routes live here. the web app imports AppType from this file for the typed client,
// so keep everything chained (.route().route()...) or the frontend loses its types
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requireAuth, requireRole, requireShopAccess } from './auth/guards';
import { onError } from './errors';
import type { AppEnv } from './lib/env-types';
import { adjustmentRoutes } from './routes/adjustments';
import { adminRoutes } from './routes/admin';
import { authRoutes } from './routes/auth';
import { customerRoutes } from './routes/customers';
import { disputeRoutes } from './routes/disputes';
import { ledgerRoutes } from './routes/ledger';
import { metaRoutes } from './routes/meta';
import { paymentRoutes } from './routes/payments';
import { portalRoutes } from './routes/portal';
import { productRoutes } from './routes/products';
import { promiseRoutes } from './routes/promises';
import { reminderRoutes } from './routes/reminders';
import { reportRoutes } from './routes/reports';
import { saleRoutes } from './routes/sales';
import { settingsRoutes } from './routes/settings';
import { staffRoutes } from './routes/staff';
import { statementRoutes } from './routes/statements';

export const app = new Hono<AppEnv>()
  .basePath('/api')
  .use(logger())
  // guards first, they have to run before the routes below
  .use('/shops/:shopId/*', requireAuth, requireShopAccess())
  .use('/portal/*', requireAuth, requireRole('customer'))
  .use('/admin/*', requireAuth, requireRole('admin'))
  // public
  .route('/auth', authRoutes)
  .route('/meta', metaRoutes)
  // shop side (owner + staff)
  .route('/shops/:shopId/settings', settingsRoutes)
  .route('/shops/:shopId/staff', staffRoutes)
  .route('/shops/:shopId/customers', customerRoutes)
  .route('/shops/:shopId/products', productRoutes)
  .route('/shops/:shopId/sales', saleRoutes)
  .route('/shops/:shopId/payments', paymentRoutes)
  .route('/shops/:shopId/ledger', ledgerRoutes)
  .route('/shops/:shopId/adjustments', adjustmentRoutes)
  .route('/shops/:shopId/disputes', disputeRoutes)
  .route('/shops/:shopId/promises', promiseRoutes)
  .route('/shops/:shopId/reminders', reminderRoutes)
  .route('/shops/:shopId/statements', statementRoutes)
  .route('/shops/:shopId/reports', reportRoutes)
  // customer portal
  .route('/portal', portalRoutes)
  // admin
  .route('/admin', adminRoutes)
  .notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }, 404))
  .onError(onError);

export type AppType = typeof app;
