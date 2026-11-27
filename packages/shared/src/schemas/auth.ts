import { z } from 'zod';
import type { UserRole } from '../enums';

export const loginSchema = z.object({
  // phone (01XXXXXXXXX) or email
  identifier: z.string().trim().min(3, 'Enter your phone number or email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// a shop the logged-in user works at
export interface ShopMembership {
  shopId: number;
  shopName: string;
  shopStatus: 'pending' | 'active' | 'suspended' | 'closed';
  // 'owner' for the owner, otherwise their shop_staff.staff_role
  role: 'owner' | 'manager' | 'cashier';
  canGiveCredit: boolean;
}

// what GET /auth/me returns
export interface SessionUser {
  userId: number;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
  // only set for customer logins
  customerId: number | null;
  shops: ShopMembership[];
}
