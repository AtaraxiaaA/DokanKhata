// env vars with defaults. real values come from the .env in the repo root (copy .env.example)
import { z } from 'zod';

const schema = z.object({
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('dokankhata'),
  API_PORT: z.coerce.number().default(3001),
  SESSION_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

export const env = schema.parse(process.env);
