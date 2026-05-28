const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.resolve(__dirname, '..', 'miniprogram', 'assets', 'tab');
const size = 64;
const colors = {
  idle: '#9A9085',
  active: '#5A7A5A'
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(file, pixels) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.slice(y * size * 4, (y + 1) * size * 4)));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  fs.writeFileSync(file, Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

function createCanvas(color) {
  const pixels = new Uint8Array(size * size * 4);
  const [r, g, b] = hexToRgb(color);
  function dot(x, y, alpha = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (Math.round(y) * size + Math.round(x)) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = alpha;
  }
  function line(x1, y1, x2, y2, width = 4) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = steps ? i / steps : 0;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      for (let dx = -width; dx <= width; dx += 1) {
        for (let dy = -width; dy <= width; dy += 1) {
          if (dx * dx + dy * dy <= width * width) dot(x + dx, y + dy);
        }
      }
    }
  }
  function rect(x, y, w, h, width = 4) {
    line(x, y, x + w, y, width);
    line(x + w, y, x + w, y + h, width);
    line(x + w, y + h, x, y + h, width);
    line(x, y + h, x, y, width);
  }
  function circle(cx, cy, radius, width = 4) {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      for (let dx = -width; dx <= width; dx += 1) {
        for (let dy = -width; dy <= width; dy += 1) {
          if (dx * dx + dy * dy <= width * width) dot(x + dx, y + dy);
        }
      }
    }
  }
  return { pixels, line, rect, circle };
}

const icons = {
  home(draw) {
    draw.line(12, 30, 32, 14);
    draw.line(32, 14, 52, 30);
    draw.line(18, 29, 18, 52);
    draw.line(46, 29, 46, 52);
    draw.line(18, 52, 46, 52);
    draw.line(28, 52, 28, 39);
    draw.line(36, 39, 36, 52);
    draw.line(28, 39, 36, 39);
  },
  health(draw) {
    draw.rect(14, 16, 36, 10);
    draw.rect(14, 30, 36, 10);
    draw.rect(14, 44, 36, 10);
  },
  recheck(draw) {
    draw.rect(14, 16, 36, 38);
    draw.line(14, 28, 50, 28);
    draw.line(23, 10, 23, 21);
    draw.line(41, 10, 41, 21);
    draw.line(24, 40, 30, 46);
    draw.line(30, 46, 42, 35);
  },
  profile(draw) {
    draw.circle(32, 24, 10);
    draw.line(16, 54, 18, 48);
    draw.line(18, 48, 24, 42);
    draw.line(24, 42, 32, 40);
    draw.line(32, 40, 40, 42);
    draw.line(40, 42, 46, 48);
    draw.line(46, 48, 48, 54);
  }
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, painter] of Object.entries(icons)) {
  for (const [tone, color] of Object.entries(colors)) {
    const draw = createCanvas(color);
    painter(draw);
    writePng(path.join(outDir, `${name}-${tone}.png`), draw.pixels);
  }
}

console.log(`Generated tab icons in ${outDir}`);

