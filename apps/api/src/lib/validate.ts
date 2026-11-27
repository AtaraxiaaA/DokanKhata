// zod validator that answers with our usual error format instead of hono's default
import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import type { ApiErrorBody } from '@dokankhata/shared';

export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      return c.json<ApiErrorBody>(
        {
          error: {
            code: 'VALIDATION',
            message: first?.message ?? 'Invalid input',
            details: result.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
        400,
      );
    }
  });
