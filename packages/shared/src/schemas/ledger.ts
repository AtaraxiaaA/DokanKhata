import { z } from 'zod';
import { ADJUSTMENT_TYPES, PAYMENT_METHODS } from '../enums';
import { dateSchema, idParam, moneySchema } from './common';

// body for POST /shops/:shopId/sales. no prices here on purpose, the DB uses the shop's price list
export const newSaleSchema = z.object({
  shopCustomerId: idParam,
  items: z
    .array(
      z.object({
        shopProductId: idParam,
        qty: z.coerce.number().positive('Quantity must be more than 0').multipleOf(0.01),
      }),
    )
    .min(1, 'Add at least one item'),
  note: z.string().trim().max(255).optional(),
});
export type NewSaleInput = z.infer<typeof newSaleSchema>;

// body for POST /shops/:shopId/payments
export const newPaymentSchema = z
  .object({
    shopCustomerId: idParam,
    amount: moneySchema,
    method: z.enum(PAYMENT_METHODS),
    trxRef: z.string().trim().max(40).optional(),
  })
  .refine((p) => p.method === 'cash' || !!p.trxRef, {
    message: 'A mobile payment needs its transaction ID',
    path: ['trxRef'],
  });
export type NewPaymentInput = z.infer<typeof newPaymentSchema>;

// PATCH /sales/:saleId/due-date (the trigger only allows pushing it later)
export const dueDateSchema = z.object({ dueDate: dateSchema });

// POST /adjustments -> sp_add_adjustment
export const newAdjustmentSchema = z.object({
  saleId: idParam,
  type: z.enum(ADJUSTMENT_TYPES),
  amount: moneySchema,
  reason: z.string().trim().min(3, 'Say why').max(255),
});
export type NewAdjustmentInput = z.input<typeof newAdjustmentSchema>;

// PATCH /disputes/:disputeId
export const resolveDisputeSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  resolution: z.string().trim().min(3, 'Write what was decided').max(255),
});

// POST /disputes (shop records one at the counter) and POST /portal/disputes
export const newDisputeSchema = z.object({
  saleId: idParam,
  reason: z.string().trim().min(5, 'Tell the shop what is wrong').max(255),
});

// POST /promises
export const newPromiseSchema = z.object({
  shopCustomerId: idParam,
  promisedAmount: moneySchema,
  promisedDate: dateSchema,
});
export type NewPromiseInput = z.input<typeof newPromiseSchema>;
