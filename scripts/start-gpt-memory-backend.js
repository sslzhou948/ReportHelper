const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'backend');
const envPath = path.join(root, 'backend', '.env');

function parseDotEnv(content) {
  return content.split(/\r?\n/).reduce((acc, rawLine) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return acc;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) return acc;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    acc[key] = value;
    return acc;
  }, {});
}

const fileEnv = fs.existsSync(envPath) ? parseDotEnv(fs.readFileSync(envPath, 'utf8')) : {};
const port = process.env.PORT || process.env.HEALTHHELPER_MEMORY_PORT || '18788';
const env = normalizeEnv({
  ...process.env,
  ...fileEnv,
  PORT: port,
  BACKEND_PUBLIC_BASE_URL: process.env.BACKEND_PUBLIC_BASE_URL || `http://127.0.0.1:${port}`,
  OCR_PROVIDER: process.env.OCR_PROVIDER || fileEnv.OCR_PROVIDER || 'gpt_vision',
  UPLOAD_STORAGE_PROVIDER: 'local',
  LOCAL_OBJECT_STORAGE_DIR: process.env.LOCAL_OBJECT_STORAGE_DIR || '../local-object-storage'
});

function normalizeEnv(source) {
  if (process.platform !== 'win32') return source;
  const result = {};
  const seen = new Map();
  for (const [key, value] of Object.entries(source)) {
    const lowerKey = key.toLowerCase();
    if (seen.has(lowerKey)) {
      delete result[seen.get(lowerKey)];
    }
    seen.set(lowerKey, key);
    result[key] = value;
  }
  return result;
}

if (!env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is missing. Fill backend/.env before starting GPT OCR memory backend.');
  process.exit(1);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

console.log(`Starting HealthHelper GPT OCR memory backend on ${env.BACKEND_PUBLIC_BASE_URL}`);
const tsxCli = path.join(root, 'backend', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const distMemoryServer = path.join(root, 'backend', 'dist', 'testing', 'memory-server.js');
const sourceMemoryServer = path.join(root, 'backend', 'src', 'testing', 'memory-server.ts');
const command = process.execPath;
const args = fs.existsSync(distMemoryServer)
  ? [distMemoryServer]
  : [tsxCli, sourceMemoryServer];
const requestedDetach = process.argv.includes('--detached') || process.env.HEALTHHELPER_DETACH === '1';
const launchedByWindowsHelper = process.env.HEALTHHELPER_DETACHED_CHILD === '1';
const logPath = path.join(root, 'tmp', 'gpt-memory-backend.log');

if (requestedDetach && process.platform === 'win32' && !launchedByWindowsHelper) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const childEnv = normalizeEnv({
    ...env,
    HEALTHHELPER_DETACH: '1',
    HEALTHHELPER_DETACHED_CHILD: '1'
  });
  const psCommand = [
    '$p = Start-Process',
    `-FilePath ${psQuote(command)}`,
    `-ArgumentList @(${psQuote(__filename)})`,
    `-WorkingDirectory ${psQuote(root)}`,
    '-WindowStyle Hidden',
    '-PassThru;',
    '$p.Id'
  ].join(' ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    console.error((result.stderr || result.stdout || 'Failed to start detached backend.').trim());
    process.exit(result.status || 1);
  }
  const pid = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || 'unknown';
  console.log(`Detached backend pid=${pid}; log=${logPath}`);
  process.exit(0);
}

const detach = requestedDetach && !launchedByWindowsHelper;
if (requestedDetach) fs.mkdirSync(path.dirname(logPath), { recursive: true });
const stdio = requestedDetach
  ? ['ignore', fs.openSync(logPath, 'a'), fs.openSync(logPath, 'a')]
  : 'inherit';
const child = spawn(command, args, {
  cwd: backendRoot,
  env,
  stdio,
  detached: detach,
  windowsHide: true
});

if (detach) {
  child.unref();
  console.log(`Detached backend pid=${child.pid}; log=${logPath}`);
  process.exit(0);
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code || 0);
});
