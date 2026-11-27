import { z } from 'zod';
import { idParam, moneySchema } from './common';

// POST /portal/pay (prototype, no real gateway)
export const portalPaySchema = z.object({
  shopCustomerId: idParam,
  amount: moneySchema,
  method: z.enum(['bkash', 'nagad', 'rocket']),
});
export type PortalPayInput = z.input<typeof portalPaySchema>;
