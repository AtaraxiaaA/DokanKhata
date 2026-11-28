// npm run db:seed  (or: npm run db:seed -- --today 2026-12-10)
// makes db/database/seed.sql with the generator, checks it, then rebuilds dokankhata_full.sql.
// it doesn't touch MySQL, run npm run db:reset after to load it.
// needs python 3 and php (XAMPP has php, we look for it there).
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { root } from './lib-mysql.mjs';

const gen = join(root, 'db', 'generator');
const dbDir = join(root, 'db', 'database');

// python3 on mac/linux, python on windows
const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version']).status === 0);
if (!python) {
  console.error('Python 3 is needed for the seed generator (python.org).');
  process.exit(1);
}

// the generator calls `php` for the bcrypt hashes, so put XAMPP's php on the PATH
const php = [
  process.env.PHP_BIN,
  '/Applications/XAMPP/xamppfiles/bin/php',
  'C:\\xampp\\php\\php.exe',
  '/opt/lampp/bin/php',
].find((p) => p && existsSync(p));
const env = {
  ...process.env,
  PATH: php ? dirname(php) + delimiter + process.env.PATH : process.env.PATH,
};
if (!php && spawnSync('php', ['-v'], { env }).status !== 0) {
  console.error('php not found. Install XAMPP or set PHP_BIN in .env to your php path.');
  process.exit(1);
}

const passArgs = process.argv.slice(2); // e.g. --today 2026-12-10
console.log('Generating seed.sql ...');
const made = spawnSync(python, [join(gen, 'make_seed.py'), ...passArgs], {
  env,
  maxBuffer: 64 * 1024 * 1024,
});
if (made.status !== 0) {
  console.error(made.stderr.toString());
  process.exit(1);
}
writeFileSync(join(dbDir, 'seed.sql'), made.stdout);

// check it for the import day (today, or the --today you passed)
const i = passArgs.indexOf('--today');
const importDay = i >= 0 ? passArgs[i + 1] : new Date().toLocaleDateString('en-CA');
console.log(`Checking it against schema.sql for an import on ${importDay} ...`);
const checked = spawnSync(
  python,
  [join(gen, 'check_seed.py'), join(dbDir, 'schema.sql'), join(dbDir, 'seed.sql'), importDay],
  {
    env,
    stdio: 'inherit',
  },
);
if (checked.status !== 0) process.exit(checked.status ?? 1);

const built = spawnSync(process.execPath, [join(root, 'scripts', 'build-full.mjs')], {
  stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status ?? 1);
console.log('Done. Run  npm run db:reset  to load it.');
