import { z } from 'zod';

// PATCH /admin/shops/:shopId/verify
export const verifyShopSchema = z.object({
  action: z.enum(['approve', 'suspend', 'reactivate']),
});

// PATCH /admin/users/:userId
export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});
