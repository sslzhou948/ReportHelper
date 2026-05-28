import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const migrationFile = path.join(
  backendRoot,
  'prisma',
  'migrations',
  '20260529090000_init',
  'migration.sql'
);

function normalizeSql(source) {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

const generated = execFileSync(
  process.execPath,
  [
    path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js'),
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    'prisma/schema.prisma',
    '--script'
  ],
  {
    cwd: backendRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

const committed = fs.readFileSync(migrationFile, 'utf8');
assert.strictEqual(
  normalizeSql(committed),
  normalizeSql(generated),
  'Prisma schema and initial migration drifted. Regenerate backend/prisma/migrations/20260529090000_init/migration.sql.'
);

console.log('Prisma migration check passed');
