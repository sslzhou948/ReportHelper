const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function usage() {
  return [
    'Usage: node scripts/create-ocr-table-crop-experiment.js <imagePath> [outputPath] [--top=0.08] [--height=0.31]',
    '',
    'Creates a temporary table-band crop for OCR provider comparison.',
    'This is an evaluation helper only; it is not part of the production upload flow.'
  ].join('\n');
}

function parseNumberArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg || inputArg === '--help' || inputArg === '-h') {
    console.log(usage());
    process.exit(inputArg ? 0 : 1);
  }

  let Jimp;
  try {
    Jimp = require('jimp');
  } catch (error) {
    console.error('The optional local package "jimp" is required for this experiment script.');
    console.error('Install or restore node_modules before running this helper.');
    process.exit(1);
  }

  const inputPath = path.resolve(root, inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input image not found: ${inputPath}`);
    process.exit(1);
  }

  const topRatio = parseNumberArg('top', 0.08);
  const heightRatio = parseNumberArg('height', 0.31);
  const outputArg = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : '';
  const outputPath = outputArg
    ? path.resolve(root, outputArg)
    : path.resolve(root, 'tmp', 'ocr-preprocess', `${path.parse(inputPath).name}-table-band.jpg`);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const image = await Jimp.read(inputPath);
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const y = Math.max(0, Math.min(height - 1, Math.round(height * topRatio)));
  const cropHeight = Math.max(1, Math.min(height - y, Math.round(height * heightRatio)));

  await image.clone()
    .crop(0, y, width, cropHeight)
    .quality(92)
    .writeAsync(outputPath);

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    width,
    height,
    crop: {
      x: 0,
      y,
      width,
      height: cropHeight,
      topRatio,
      heightRatio
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
