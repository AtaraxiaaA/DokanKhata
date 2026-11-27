import { z } from 'zod';
import { SHOP_TYPES, type UserRole } from '../enums';
import { phoneSchema } from './common';

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

// POST /auth/register-shop: the owner's account and their shop in one go
export const registerShopSchema = z.object({
  owner: z.object({
    fullName: z.string().trim().min(3, 'Enter your full name').max(100),
    phone: phoneSchema,
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Enter a valid email')
      .max(120)
      .optional()
      .or(z.literal('')),
    password: z.string().min(8, 'Use at least 8 characters').max(72),
  }),
  shop: z.object({
    name: z.string().trim().min(3, 'Enter the shop name').max(100),
    shopType: z.enum(SHOP_TYPES),
    tradeLicenceNo: z.string().trim().max(30).optional().or(z.literal('')),
    areaId: z.coerce.number().int().positive('Pick an area'),
    address: z.string().trim().min(5, 'Enter the shop address').max(255),
    phone: phoneSchema.optional().or(z.literal('')),
  }),
});
export type RegisterShopInput = z.input<typeof registerShopSchema>;

// POST /auth/claim/start: check the number and "send" the OTP
export const claimStartSchema = z.object({ phone: phoneSchema });

// POST /auth/claim: finish with the OTP and a password
export const claimSchema = z.object({
  phone: phoneSchema,
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is 6 digits'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});
export type ClaimInput = z.input<typeof claimSchema>;
