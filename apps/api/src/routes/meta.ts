// public stuff: health check and dropdown data
import { Hono } from 'hono';
import { query, queryOne } from '../db';
import type { AppEnv } from '../lib/env-types';

export const metaRoutes = new Hono<AppEnv>()
  // GET /api/meta/health - is the DB up, and is the event scheduler on
  .get('/health', async (c) => {
    const row = await queryOne<{ db: string; scheduler: string; now: string }>(
      'SELECT DATABASE() AS db, @@event_scheduler AS scheduler, NOW() AS now',
    );
    return c.json({ ok: true, ...row });
  })

  // GET /api/meta/areas - for area selects (registration, add customer)
  .get('/areas', async (c) =>
    c.json(
      await query<{
        areaId: number;
        name: string;
        thana: string;
        district: string;
        division: string;
      }>(
        'SELECT area_id, name, thana, district, division FROM areas ORDER BY division, district, thana, name',
      ),
    ),
  )

  // GET /api/meta/categories
  .get('/categories', async (c) =>
    c.json(
      await query<{ categoryId: number; name: string; banglaName: string | null }>(
        'SELECT category_id, name, bangla_name FROM categories ORDER BY name',
      ),
    ),
  );
