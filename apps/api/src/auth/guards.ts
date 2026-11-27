// route guards. everything except login, register, claim and /meta needs requireAuth
import { createMiddleware } from 'hono/factory';
import type { UserRole } from '@dokankhata/shared';
import { AppError, forbidden } from '../errors';
import type { AppEnv } from '../lib/env-types';
import { loadSessionUser } from './session';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const user = await loadSessionUser(c);
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
  c.set('user', user);
  await next();
});

// only let these roles through (put it after requireAuth)
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!roles.includes(c.get('user').role)) throw forbidden();
    await next();
  });

interface ShopAccessOptions {
  // owner or manager only (settings, staff, adjustments, credit limits)
  manager?: boolean;
  // owner, or staff with can_give_credit = 1
  canGiveCredit?: boolean;
}

// for /shops/:shopId/* routes. makes sure the user owns or works at that shop and
// puts their membership in c.get('shop'). the procedures check permissions again anyway
export const requireShopAccess = (opts: ShopAccessOptions = {}) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const shopId = Number(c.req.param('shopId'));
    const membership = c.get('user').shops.find((s) => s.shopId === shopId);
    if (!membership) throw forbidden('You do not work at this shop');
    if (opts.manager && membership.role === 'cashier')
      throw forbidden('Only the shop owner or a manager can do this');
    if (opts.canGiveCredit && !membership.canGiveCredit)
      throw forbidden('You are not allowed to give credit at this shop');
    c.set('shop', membership);
    await next();
  });
