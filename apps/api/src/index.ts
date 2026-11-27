import { serve } from '@hono/node-server';
import { app } from './app';
import { pool } from './db';
import { env } from './env';

try {
  await pool.query('SELECT 1');
} catch (e) {
  console.error(`✗ Cannot reach MariaDB at ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}.`);
  console.error('  Start MySQL in XAMPP and run  npm run db:reset  if the database is missing.');
  console.error(`  (${(e as Error).message})`);
  process.exit(1);
}

serve({ fetch: app.fetch, port: env.API_PORT }, (info) => {
  console.log(`✓ DokanKhata API on http://localhost:${info.port}/api`);
});
