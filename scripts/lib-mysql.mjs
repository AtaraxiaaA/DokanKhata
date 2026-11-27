// helpers for the db scripts: read .env and find the mysql client from XAMPP
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  const envFile = join(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'dokankhata',
  };
}

export function findMysqlBin() {
  const candidates = [
    process.env.MYSQL_BIN,
    '/Applications/XAMPP/xamppfiles/bin/mysql', // macOS XAMPP
    'C:\\xampp\\mysql\\bin\\mysql.exe', // Windows XAMPP
    '/opt/lampp/bin/mysql', // Linux XAMPP
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? 'mysql'; // fall back to PATH
}
