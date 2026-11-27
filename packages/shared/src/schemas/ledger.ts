import { z } from 'zod';
import { PAYMENT_METHODS } from '../enums';
import { idParam, moneySchema } from './common';

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
