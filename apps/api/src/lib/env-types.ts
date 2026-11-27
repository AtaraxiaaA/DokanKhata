import type { SessionUser, ShopMembership } from '@dokankhata/shared';

// things the guards put on the context for the handlers
export type AppEnv = {
  Variables: {
    // set by requireAuth
    user: SessionUser;
    // set by requireShopAccess on /shops/:shopId/* routes
    shop: ShopMembership;
  };
};
