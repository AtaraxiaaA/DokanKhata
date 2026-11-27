import { z } from 'zod';

// BD mobile number, same rule as ck_customers_phone in the schema
export const PHONE_REGEX = /^01[3-9][0-9]{8}$/;

// people type numbers like +8801712-345678 or 01712 345678, this turns them into 01XXXXXXXXX
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  return digits;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(PHONE_REGEX, 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)'));

export const idParam = z.coerce.number().int().positive();

// amount typed in a form: positive, max 2 decimals
export const moneySchema = z.coerce
  .number()
  .positive('Amount must be more than 0')
  .multipleOf(0.01, 'At most 2 decimal places');

// 'YYYY-MM-DD'
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-05');

// optional text field: '' from a form counts as not given
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// list endpoints all take these
export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};
