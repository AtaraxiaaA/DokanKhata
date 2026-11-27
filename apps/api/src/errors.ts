// error handling for the whole API. every error ends up as { error: { code, message } }
//   SIGNAL '45000' from our triggers/procedures -> 422, and we pass the DB message straight through
//   duplicate key (1062)                        -> 409
//   CHECK constraint failed (4025)              -> 422 with a nicer message from the map below
//   bad input (zod)                             -> 400
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody } from '@dokankhata/shared';

export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Record') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have access to this') =>
  new AppError(403, 'FORBIDDEN', msg);

// nicer messages for CHECK constraints a user can actually hit. add more when you run into them
const CHECK_MESSAGES: Record<string, string> = {
  ck_payments_trx_ref: 'A mobile payment needs its transaction ID',
  ck_customers_phone: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)',
  ck_users_phone: 'Enter a valid Bangladeshi mobile number (01XXXXXXXXX)',
  ck_customers_nid: 'NID must be 10, 13 or 17 digits',
  ck_shop_customers_blocked: 'Give a reason when blocking a customer',
  ck_shop_customers_due_days: 'Due days must be between 1 and 90',
  ck_shop_products_stock: 'Stock cannot go below 0',
};

const UNIQUE_MESSAGES: Record<string, string> = {
  uk_users_phone: 'This phone number already has an account',
  uk_users_email: 'This email already has an account',
  uk_customers_phone: 'A customer with this phone number already exists',
  uk_shop_customers_shop_customer: 'This customer already has an account at this shop',
  uk_payments_trx_ref: 'This transaction ID has already been recorded',
  uk_shops_trade_licence: 'This trade licence is already registered',
  uk_disputes_one_open_per_sale: 'This sale already has an open dispute',
  uk_shop_products_shop_product: 'This product is already in your price list',
};

interface MysqlError {
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
}

const isMysqlError = (e: unknown): e is MysqlError =>
  typeof e === 'object' && e !== null && 'sqlState' in e;

export function toErrorResponse(err: unknown): {
  status: ContentfulStatusCode;
  body: ApiErrorBody;
} {
  const body = (code: string, message: string, details?: unknown): ApiErrorBody => ({
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });

  if (err instanceof AppError)
    return { status: err.status, body: body(err.code, err.message, err.details) };
  if (err instanceof HTTPException)
    return { status: err.status as ContentfulStatusCode, body: body('HTTP', err.message) };

  if (isMysqlError(err)) {
    const msg = err.sqlMessage ?? 'Database error';
    if (err.sqlState === '45000') return { status: 422, body: body('BUSINESS_RULE', msg) };
    if (err.errno === 1062) {
      const key = Object.keys(UNIQUE_MESSAGES).find((k) => msg.includes(k));
      return {
        status: 409,
        body: body('DUPLICATE', key ? UNIQUE_MESSAGES[key]! : 'This record already exists'),
      };
    }
    if (err.errno === 4025) {
      const key = Object.keys(CHECK_MESSAGES).find((k) => msg.includes(k));
      return { status: 422, body: body('CHECK_FAILED', key ? CHECK_MESSAGES[key]! : msg) };
    }
    if (err.errno === 1452)
      return { status: 422, body: body('BAD_REFERENCE', 'A linked record does not exist') };
  }

  console.error(err);
  return { status: 500, body: body('INTERNAL', 'Something went wrong. Please try again.') };
}

export function onError(err: Error, c: Context) {
  const { status, body } = toErrorResponse(err);
  return c.json(body, status);
}
