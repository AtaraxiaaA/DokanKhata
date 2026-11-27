// npm run db:reset, drops the database and imports dokankhata_full.sql again.
// it uses the mysql command line client because the files use DELIMITER, which node drivers don't understand
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, loadEnv, findMysqlBin } from './lib-mysql.mjs';

const cfg = loadEnv();
const bin = findMysqlBin();
const file = join(root, 'db', 'database', process.argv[2] ?? 'dokankhata_full.sql');

const args = [
  '-h',
  cfg.host,
  '-P',
  String(cfg.port),
  '-u',
  cfg.user,
  '--default-character-set=utf8mb4',
];
if (cfg.password) args.push(`-p${cfg.password}`);

console.log(`Importing ${file}\n  using ${bin} as ${cfg.user}@${cfg.host}:${cfg.port} ...`);
const res = spawnSync(bin, args, {
  input: readFileSync(file),
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (res.error) {
  console.error(
    `Could not run mysql (${res.error.message}). Set MYSQL_BIN in .env to your mysql client path.`,
  );
  process.exit(1);
}
if (res.status !== 0) process.exit(res.status ?? 1);
console.log('Done. Run  npm run db:check  to verify.');
