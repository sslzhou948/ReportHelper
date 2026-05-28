const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const devtoolsDir = process.env.WECHAT_DEVTOOLS_DIR || 'D:\\WeChat-DevTools';
const cliPath = path.join(devtoolsDir, 'cli.bat');
const localAppData = process.env.WECHAT_DEVTOOLS_LOCALAPPDATA || path.join(root, '.wechat-localappdata');
const command = process.argv[2] || 'check';

function fail(message, details) {
  console.error(message);
  if (details) console.error(details);
  process.exitCode = 1;
}

function hasCliError(output) {
  if (/√ preview/.test(output) || /√ open/.test(output)) return false;
  return /\[error\]|Error:|错误|× Uploading|× open|× preview/.test(output);
}

function runCli(args) {
  fs.mkdirSync(localAppData, { recursive: true });
  const result = spawnSync('cmd.exe', ['/d', '/c', 'call', cliPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LOCALAPPDATA: localAppData
    },
    windowsHide: true
  });
  const output = [result.stdout, result.stderr, result.error && result.error.message].filter(Boolean).join('\n').trim();
  return { ...result, output };
}

if (!fs.existsSync(cliPath)) {
  fail(`WeChat DevTools CLI not found: ${cliPath}`);
  return;
}

if (!fs.existsSync(path.join(root, 'project.config.json'))) {
  fail(`project.config.json not found under ${root}`);
  return;
}

if (command === 'check') {
  const result = runCli(['--version']);
  if (result.status === 0) {
    console.log(result.output || 'WeChat DevTools CLI is reachable.');
    return;
  }
  fail('WeChat DevTools CLI failed to start.', result.output);
  if (result.output.includes('EEXIST') && result.output.includes('微信开发者工具')) {
    console.error('Known local environment blocker: DevTools is trying to create an AppData directory that already exists.');
    console.error('Next manual step: open WeChat DevTools once from Windows, then re-run npm run devtools:cli-check.');
  }
  return;
}

if (command === 'open') {
  const result = runCli(['open', '--project', root]);
  if (result.status === 0) {
    console.log(result.output || `Opened project in WeChat DevTools: ${root}`);
    return;
  }
  fail('Failed to open project in WeChat DevTools.', result.output);
  return;
}

if (command === 'preview') {
  const outputDir = path.join(root, 'tmp');
  fs.mkdirSync(outputDir, { recursive: true });
  const result = runCli([
    'preview',
    '--project',
    root,
    '--qr-format',
    'image',
    '--qr-output',
    path.join(outputDir, 'preview-qrcode.png'),
    '--info-output',
    path.join(outputDir, 'preview-info.json')
  ]);
  if (result.status === 0 && !hasCliError(result.output)) {
    console.log(result.output || 'Preview generated.');
    return;
  }
  fail('Failed to generate WeChat preview.', result.output);
  return;
}

fail(`Unknown command: ${command}`);
