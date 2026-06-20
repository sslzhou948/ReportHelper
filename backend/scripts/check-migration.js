import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const migrationsRoot = path.join(backendRoot, 'prisma', 'migrations');
const prismaEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://migration:check@localhost:5432/migration_check'
};

function normalizeSql(source) {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function sqlStatements(source) {
  return source
    .replace(/^\uFEFF/, '')
    .replace(/--.*$/gm, '')
    .replace(/\r\n/g, '\n')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const generated = execFileSync(
  process.execPath,
  [
    path.join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js'),
    'validate',
    '--schema',
    'prisma/schema.prisma'
  ],
  {
    cwd: backendRoot,
    env: prismaEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

const generatedDiff = execFileSync(
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
    env: prismaEnv,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

assert.ok(generated.includes('The schema at'), 'Prisma schema validation did not report success');

const migrationFiles = fs.readdirSync(migrationsRoot)
  .filter((entry) => fs.statSync(path.join(migrationsRoot, entry)).isDirectory())
  .sort()
  .map((entry) => path.join(migrationsRoot, entry, 'migration.sql'))
  .filter((file) => fs.existsSync(file));

assert.ok(migrationFiles.length > 0, 'No Prisma migration files found');

if (migrationFiles.length === 1) {
  const committed = fs.readFileSync(migrationFiles[0], 'utf8');
  assert.strictEqual(
    normalizeSql(committed),
    normalizeSql(generatedDiff),
    'Prisma schema and initial migration drifted. Regenerate backend/prisma/migrations/20260529090000_init/migration.sql.'
  );
} else {
  const committedStatements = new Set(sqlStatements(
    migrationFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n\n')
  ));
  const generatedStatements = new Set(sqlStatements(generatedDiff));

  for (const statement of generatedStatements) {
    assert.ok(
      committedStatements.has(statement),
      `Committed migrations do not include generated schema statement: ${statement}`
    );
  }

  for (const statement of committedStatements) {
    assert.ok(
      generatedStatements.has(statement),
      `Committed migrations include a statement no longer generated from schema: ${statement}`
    );
  }
}

console.log('Prisma migration check passed');
