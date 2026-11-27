// npm run db:check, quick check that the database is imported and everything is there
import mysql from 'mysql2/promise';
import { loadEnv } from './lib-mysql.mjs';

const cfg = loadEnv();
let conn;
try {
  conn = await mysql.createConnection(cfg);
} catch (e) {
  console.error(`✗ Cannot connect to ${cfg.database} at ${cfg.host}:${cfg.port}: ${e.message}`);
  console.error('  Is XAMPP MySQL running? Did you run  npm run db:reset ?');
  process.exit(1);
}

const one = async (sql) => Object.values((await conn.query(sql))[0][0])[0];
const checks = [
  [
    'tables',
    `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    23,
  ],
  ['views', `SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE()`, 6],
  [
    'procedures',
    `SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = DATABASE()`,
    7,
  ],
  [
    'triggers',
    `SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()`,
    13,
  ],
  ['events', `SELECT COUNT(*) FROM information_schema.events WHERE event_schema = DATABASE()`, 5],
  ['shops', 'SELECT COUNT(*) FROM shops', null],
  ['customers', 'SELECT COUNT(*) FROM customers', null],
  ['credit_sales', 'SELECT COUNT(*) FROM credit_sales', null],
  ['payments', 'SELECT COUNT(*) FROM payments', null],
];

let ok = true;
for (const [label, sql, expected] of checks) {
  const n = Number(await one(sql));
  const pass = expected == null ? n > 0 : n === expected;
  ok &&= pass;
  console.log(
    `${pass ? '✓' : '✗'} ${label.padEnd(13)} ${n}${expected != null && !pass ? `  (expected ${expected})` : ''}`,
  );
}

const sched = await one('SELECT @@event_scheduler');
console.log(
  `${sched === 'ON' ? '✓' : '!'} event_scheduler ${sched}${sched === 'ON' ? '' : '  -> add event_scheduler=ON under [mysqld] in my.cnf / my.ini and restart MySQL'}`,
);

await conn.end();
process.exit(ok ? 0 : 1);
