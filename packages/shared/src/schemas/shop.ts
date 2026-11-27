import { z } from 'zod';
import { ACCOUNT_STATUSES, REMINDER_STATUSES, SHOP_TYPES, STAFF_ROLES } from '../enums';
import { dateSchema, idParam, moneySchema, optionalText, phoneSchema } from './common';

// POST /customers: finds the person by phone (or creates them) and opens an account here
export const newCustomerSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(3, 'Enter the customer name').max(100),
  nid: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{13}|\d{17})$/, 'NID must be 10, 13 or 17 digits')
    .optional()
    .or(z.literal('')),
  areaId: z.coerce.number().int().positive().optional(),
  address: optionalText(255),
  // left empty = use the shop's defaults
  creditLimit: z.coerce.number().min(0).optional(),
  dueDays: z.coerce.number().int().min(1).max(90).optional(),
});
export type NewCustomerInput = z.input<typeof newCustomerSchema>;

// PATCH /customers/:shopCustomerId
export const updateAccountSchema = z
  .object({
    creditLimit: z.coerce.number().min(0).optional(),
    dueDays: z.coerce.number().int().min(1).max(90).optional(),
    status: z.enum(ACCOUNT_STATUSES).optional(),
    blockedReason: optionalText(150),
  })
  .refine((v) => v.status !== 'blocked' || !!v.blockedReason, {
    message: 'Give a reason for blocking',
    path: ['blockedReason'],
  });
export type UpdateAccountInput = z.input<typeof updateAccountSchema>;

// POST /customers/:shopCustomerId/guarantors
export const newGuarantorSchema = z.object({
  guarantorCustomerId: idParam,
  guaranteeLimit: moneySchema,
});

// POST /products: start selling a catalog product
export const addShopProductSchema = z.object({
  productId: idParam,
  sellPrice: moneySchema,
  stockQty: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
  trackStock: z.boolean().default(true),
});

// PATCH /products/:shopProductId
export const updateShopProductSchema = z.object({
  sellPrice: moneySchema.optional(),
  stockQty: z.coerce.number().min(0).optional(),
  reorderLevel: z.coerce.number().min(0).optional(),
  trackStock: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// POST /staff
export const newStaffSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(3).max(100),
  // only needed when this phone has no account yet
  password: z.string().min(8, 'Use at least 8 characters').max(72).optional(),
  staffRole: z.enum(STAFF_ROLES).default('cashier'),
  canGiveCredit: z.boolean().default(false),
});

// PATCH /staff/:userId
export const updateStaffSchema = z.object({
  staffRole: z.enum(STAFF_ROLES).optional(),
  canGiveCredit: z.boolean().optional(),
  // true = they left today
  left: z.boolean().optional(),
});

// PATCH /settings
export const updateShopSchema = z.object({
  name: z.string().trim().min(3).max(100).optional(),
  shopType: z.enum(SHOP_TYPES).optional(),
  tradeLicenceNo: optionalText(30),
  areaId: z.coerce.number().int().positive().optional(),
  address: z.string().trim().min(5).max(255).optional(),
  phone: phoneSchema.optional(),
  defaultCreditLimit: z.coerce.number().min(0).optional(),
  defaultDueDays: z.coerce.number().int().min(1).max(90).optional(),
});

// PATCH /reminders/:reminderId
export const updateReminderSchema = z.object({
  status: z.enum(REMINDER_STATUSES).exclude(['queued']),
});

// shared filter for date ranges on list pages
export const dateRangeQuery = {
  from: dateSchema.optional(),
  to: dateSchema.optional(),
};
