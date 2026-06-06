const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'backend');
const backendEnvPath = path.join(backendRoot, '.env');
const backendEnvExamplePath = path.join(backendRoot, '.env.example');
const projectConfigPath = path.join(root, 'project.config.json');
const acthPath = path.join(root, 'realtestcase', 'ACTH.jpg');
const devtoolsDir = process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools';
const devtoolsCliPath = path.join(devtoolsDir, 'cli.bat');
const devtoolsLocalAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');

function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((acc, rawLine) => {
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

function status(ok, label, detail = '', required = true) {
  return {
    ok,
    label,
    detail,
    required
  };
}

function isPlaceholder(value) {
  return !value || value === 'replace-with-local-dev-secret' || value === 'put-secret-in-local-env-only';
}

function realOcrProviderDetail(provider) {
  if (provider === 'gpt_vision') return 'gpt_vision';
  return provider
    ? `${provider}; set OCR_PROVIDER to "gpt_vision" for real OCR upload`
    : 'missing; set OCR_PROVIDER to "gpt_vision"';
}

function runCliVersion() {
  if (!fs.existsSync(devtoolsCliPath)) return status(false, 'WeChat DevTools CLI', `not found at ${devtoolsCliPath}`);
  const result = spawnSync('cmd.exe', ['/d', '/c', 'call', devtoolsCliPath, '--version'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LOCALAPPDATA: devtoolsLocalAppData
    },
    windowsHide: true,
    timeout: 15000
  });
  if (result.error) return status(false, 'WeChat DevTools CLI', result.error.message);
  if (result.status !== 0) return status(false, 'WeChat DevTools CLI', (result.stderr || result.stdout || '').trim());
  return status(true, 'WeChat DevTools CLI', (result.stdout || result.stderr || 'reachable').trim().split(/\r?\n/)[0]);
}

const env = {
  ...readDotEnv(backendEnvPath),
  ...process.env
};
const projectConfig = fs.existsSync(projectConfigPath) ? JSON.parse(fs.readFileSync(projectConfigPath, 'utf8')) : {};
const isRealOcrProvider = env.OCR_PROVIDER === 'gpt_vision';
const directVisionReady = env.OCR_PROVIDER === 'gpt_vision' && !!env.OPENAI_API_KEY;
const productVisionReady = directVisionReady;
const checks = [
  status(fs.existsSync(backendEnvExamplePath), 'backend/.env.example', fs.existsSync(backendEnvExamplePath) ? 'present' : 'missing'),
  status(fs.existsSync(backendEnvPath), 'backend/.env', fs.existsSync(backendEnvPath) ? 'present' : 'missing; copy backend/.env.example to backend/.env'),
  status(projectConfig.appid === 'wx382d538fd178a873', 'Mini Program AppID', projectConfig.appid || 'missing'),
  status(fs.existsSync(acthPath) && fs.statSync(acthPath).size > 1024, 'realtestcase/ACTH.jpg', fs.existsSync(acthPath) ? `${fs.statSync(acthPath).size} bytes` : 'missing'),
  status(isRealOcrProvider, 'OCR_PROVIDER', realOcrProviderDetail(env.OCR_PROVIDER)),
  status(env.UPLOAD_STORAGE_PROVIDER === 'local', 'UPLOAD_STORAGE_PROVIDER', env.UPLOAD_STORAGE_PROVIDER || 'missing; set UPLOAD_STORAGE_PROVIDER="local"', false),
  status(!isPlaceholder(env.JWT_SECRET), 'JWT_SECRET', isPlaceholder(env.JWT_SECRET) ? 'placeholder; replace before manually running backend dev' : 'configured', false),
  status(!isPlaceholder(env.WECHAT_APP_ID), 'WECHAT_APP_ID', env.WECHAT_APP_ID || 'missing'),
  status(!isPlaceholder(env.WECHAT_APP_SECRET), 'WECHAT_APP_SECRET', isPlaceholder(env.WECHAT_APP_SECRET) ? 'placeholder; replace before production-like auth tests' : 'configured', false),
  status(!!env.OPENAI_API_KEY, 'OPENAI_API_KEY', env.OPENAI_API_KEY ? 'configured' : 'missing; required for real OCR upload smoke'),
  status(!!(env.OPENAI_OCR_MODEL || 'gpt-4.1-mini'), 'OPENAI_OCR_MODEL', env.OPENAI_OCR_MODEL || 'gpt-4.1-mini'),
  status(!!(env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1'), 'OPENAI_API_BASE_URL', env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1'),
  runCliVersion()
];

const productChecks = [
  status(productVisionReady, 'Real-photo vision route', productVisionReady
    ? 'direct gpt_vision configured'
    : 'not product-ready; use OCR_PROVIDER="gpt_vision" with OPENAI_API_KEY'),
  status(false, 'Real-photo golden acceptance', "run: $env:REALCASE_IDS='all'; npm.cmd --prefix backend run smoke:gpt-ocr and review failures", false),
  status(false, 'Realcase save-through smoke', 'run: $env:REALCASE_IDS="all"; npm.cmd --prefix backend run smoke:gpt-ocr and require risk_not_reviewed before reviewed save for risky drafts', false)
];

console.log('Integration readiness');
for (const item of checks) {
  const marker = item.ok ? '[ok]' : (item.required ? '[missing]' : '[warn]');
  console.log(`${marker} ${item.label}: ${item.detail}`);
}

console.log('\nReal-photo product readiness');
for (const item of productChecks) {
  const marker = item.ok ? '[ok]' : '[warn]';
  console.log(`${marker} ${item.label}: ${item.detail}`);
}

const requiredFailures = checks.filter((item) => item.required && !item.ok);
if (requiredFailures.length) {
  console.log('\nNext step: fix the missing items above, then run npm.cmd run devtools:gpt-real-upload-flow.');
  process.exitCode = 1;
} else if (!productVisionReady) {
  console.log('\nIntegration readiness passed, but real-photo product readiness is incomplete because no vision-model final route is configured.');
  process.exitCode = 2;
} else {
  console.log('\nIntegration readiness passed and a vision-model route is configured. Finish the real-photo product gates before treating OCR as product-ready.');
  console.log("Run $env:REALCASE_IDS='all'; npm.cmd --prefix backend run smoke:gpt-ocr.");
}
