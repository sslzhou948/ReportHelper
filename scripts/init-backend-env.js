const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const examplePath = path.join(root, 'backend', '.env.example');
const envPath = path.join(root, 'backend', '.env');

if (!fs.existsSync(examplePath)) {
  console.error(`Missing template: ${examplePath}`);
  process.exit(1);
}

if (fs.existsSync(envPath)) {
  console.log('backend/.env already exists; leaving it unchanged.');
  process.exit(0);
}

fs.copyFileSync(examplePath, envPath);
console.log('Created backend/.env from backend/.env.example.');
console.log('Next: fill WECHAT_APP_SECRET and JWT_SECRET, then set OCR_PROVIDER="gpt_vision" with OPENAI_API_KEY for real-photo OCR.');
