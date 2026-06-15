const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.resolve(__dirname, '..', 'miniprogram', 'assets', 'ui-refresh');
const SCALE = 4;

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255
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

function writePng(file, width, height, pixels) {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.slice(y * width * 4, (y + 1) * width * 4)));
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));
  fs.writeFileSync(file, Buffer.concat([
    header,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

function createCanvas(width, height) {
  const highWidth = width * SCALE;
  const highHeight = height * SCALE;
  const high = new Uint8ClampedArray(highWidth * highHeight * 4);

  function blend(x, y, color) {
    const px = Math.round(x * SCALE);
    const py = Math.round(y * SCALE);
    if (px < 0 || py < 0 || px >= highWidth || py >= highHeight) return;
    const [r, g, b, a = 255] = color;
    const i = (py * highWidth + px) * 4;
    const alpha = a / 255;
    const inv = 1 - alpha;
    high[i] = Math.round(r * alpha + high[i] * inv);
    high[i + 1] = Math.round(g * alpha + high[i + 1] * inv);
    high[i + 2] = Math.round(b * alpha + high[i + 2] * inv);
    high[i + 3] = Math.round(a + high[i + 3] * inv);
  }

  function fillCircle(cx, cy, radius, color) {
    const step = 1 / SCALE;
    for (let y = cy - radius; y <= cy + radius; y += step) {
      for (let x = cx - radius; x <= cx + radius; x += step) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) blend(x, y, color);
      }
    }
  }

  function fillEllipse(cx, cy, rx, ry, color) {
    const step = 1 / SCALE;
    for (let y = cy - ry; y <= cy + ry; y += step) {
      for (let x = cx - rx; x <= cx + rx; x += step) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) blend(x, y, color);
      }
    }
  }

  function fillRect(x, y, widthValue, heightValue, color) {
    const step = 1 / SCALE;
    for (let yy = y; yy <= y + heightValue; yy += step) {
      for (let xx = x; xx <= x + widthValue; xx += step) {
        blend(xx, yy, color);
      }
    }
  }

  function fillRoundedRect(x, y, widthValue, heightValue, radius, color) {
    fillRect(x + radius, y, widthValue - radius * 2, heightValue, color);
    fillRect(x, y + radius, widthValue, heightValue - radius * 2, color);
    fillCircle(x + radius, y + radius, radius, color);
    fillCircle(x + widthValue - radius, y + radius, radius, color);
    fillCircle(x + radius, y + heightValue - radius, radius, color);
    fillCircle(x + widthValue - radius, y + heightValue - radius, radius, color);
  }

  function fillPolygon(points, color) {
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    const minX = Math.floor(Math.min(...xs));
    const maxX = Math.ceil(Math.max(...xs));
    const minY = Math.floor(Math.min(...ys));
    const maxY = Math.ceil(Math.max(...ys));
    const step = 1 / SCALE;
    for (let y = minY; y <= maxY; y += step) {
      for (let x = minX; x <= maxX; x += step) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
          const xi = points[i][0];
          const yi = points[i][1];
          const xj = points[j][0];
          const yj = points[j][1];
          const intersect = ((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi || 1) + xi;
          if (intersect) inside = !inside;
        }
        if (inside) blend(x, y, color);
      }
    }
  }

  function line(x1, y1, x2, y2, widthValue, color) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * SCALE * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = steps ? i / steps : 0;
      fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, widthValue / 2, color);
    }
  }

  function downsample() {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const totals = [0, 0, 0, 0];
        for (let sy = 0; sy < SCALE; sy += 1) {
          for (let sx = 0; sx < SCALE; sx += 1) {
            const hi = ((y * SCALE + sy) * highWidth + (x * SCALE + sx)) * 4;
            totals[0] += high[hi];
            totals[1] += high[hi + 1];
            totals[2] += high[hi + 2];
            totals[3] += high[hi + 3];
          }
        }
        const oi = (y * width + x) * 4;
        const div = SCALE * SCALE;
        pixels[oi] = Math.round(totals[0] / div);
        pixels[oi + 1] = Math.round(totals[1] / div);
        pixels[oi + 2] = Math.round(totals[2] / div);
        pixels[oi + 3] = Math.round(totals[3] / div);
      }
    }
    return pixels;
  }

  return { fillCircle, fillEllipse, fillPolygon, fillRect, fillRoundedRect, line, downsample };
}

const green = hexToRgb('#5A7A5A');
const white = hexToRgb('#FFFFFF');
const muted = hexToRgb('#8A827A');
const red = hexToRgb('#D84D43');
const softGreen = hexToRgb('#EEF5EC');
const softWarmGreen = hexToRgb('#EEF3EC');
const paleSurface = hexToRgb('#F9FBF8');

function drawIcon(name, painter, size = 72) {
  const draw = createCanvas(size, size);
  painter(draw, size);
  writePng(path.join(outDir, name), size, size, draw.downsample());
}

function drawSearch() {
  drawIcon('search-soft.png', (draw) => {
    draw.line(42, 42, 55, 55, 5, muted);
    draw.line(41, 41, 53, 53, 2, white);
    draw.line(19, 31, 19, 31, 0, muted);
    for (let radius = 14; radius <= 17; radius += 1) {
      draw.fillCircle(30, 30, radius, muted);
    }
    draw.fillCircle(30, 30, 12, white);
  }, 64);
}

function categoryBase(draw) {
  draw.fillCircle(36, 36, 31, green);
}

drawSearch();

drawIcon('recheck-icon.png', (draw) => {
  draw.fillCircle(44, 44, 39, softGreen);
  draw.fillRoundedRect(23, 25, 42, 41, 9, green);
  draw.fillRoundedRect(27, 31, 34, 31, 6, white);
  draw.fillRect(27, 31, 34, 8, green);
  draw.line(32, 22, 32, 32, 4, green);
  draw.line(56, 22, 56, 32, 4, green);
  draw.line(33, 47, 41, 55, 5, green);
  draw.line(41, 55, 55, 42, 5, green);
  draw.fillCircle(33, 47, 2, green);
  draw.fillCircle(55, 42, 2, green);
}, 88);

drawIcon('recheck-calendar-large.png', (draw) => {
  draw.fillRoundedRect(4, 4, 112, 112, 17, softWarmGreen);
  draw.fillRoundedRect(29, 30, 62, 62, 10, green);
  draw.fillRoundedRect(33, 37, 54, 49, 6, paleSurface);
  draw.fillRect(33, 37, 54, 11, green);
  draw.line(42, 24, 42, 40, 5, green);
  draw.line(78, 24, 78, 40, 5, green);
  draw.line(48, 64, 58, 74, 6, green);
  draw.line(58, 74, 76, 56, 6, green);
  draw.line(46, 84, 75, 84, 4, green);
}, 120);

drawIcon('recheck-todo-check.png', (draw) => {
  draw.line(9, 21, 17, 29, 7, white);
  draw.line(17, 29, 31, 11, 7, white);
  draw.fillCircle(9, 21, 3, white);
  draw.fillCircle(31, 11, 3, white);
}, 40);

drawIcon('recheck-add-circle.png', (draw) => {
  draw.fillCircle(28, 28, 25, green);
  draw.fillCircle(28, 28, 21, white);
  draw.line(28, 16, 28, 40, 4, green);
  draw.line(16, 28, 40, 28, 4, green);
}, 56);

drawIcon('recheck-plan-lab.png', (draw) => {
  draw.fillCircle(40, 40, 35, softWarmGreen);
  draw.fillRoundedRect(32, 18, 17, 42, 5, green);
  draw.fillRoundedRect(36, 22, 9, 31, 3, paleSurface);
  draw.fillRect(36, 44, 9, 9, green);
  draw.line(28, 18, 53, 18, 4, green);
  draw.line(28, 62, 54, 62, 5, green);
  draw.line(28, 18, 28, 30, 4, green);
  draw.line(53, 18, 53, 30, 4, green);
}, 80);

drawIcon('recheck-plan-stethoscope.png', (draw) => {
  draw.fillCircle(40, 40, 35, softWarmGreen);
  draw.line(25, 19, 25, 36, 4, green);
  draw.line(48, 19, 48, 36, 4, green);
  draw.line(25, 36, 36, 48, 5, green);
  draw.line(48, 36, 36, 48, 5, green);
  draw.line(36, 48, 36, 58, 4, green);
  draw.fillCircle(48, 60, 8, green);
  draw.fillCircle(48, 60, 4, paleSurface);
  draw.line(36, 58, 48, 60, 4, green);
  draw.fillCircle(25, 19, 4, green);
  draw.fillCircle(48, 19, 4, green);
}, 80);

drawIcon('recheck-plan-scan.png', (draw) => {
  draw.fillCircle(40, 40, 35, softWarmGreen);
  draw.fillRoundedRect(20, 24, 40, 34, 8, green);
  draw.fillRoundedRect(24, 28, 32, 26, 5, paleSurface);
  draw.line(28, 36, 52, 36, 3, green);
  draw.line(28, 45, 45, 45, 3, green);
  draw.fillCircle(57, 58, 6, green);
  draw.line(52, 53, 57, 58, 4, green);
}, 80);

drawIcon('health-icon-blood.png', (draw) => {
  categoryBase(draw);
  draw.fillPolygon([[36, 15], [23, 38], [49, 38]], white);
  draw.fillCircle(36, 41, 13, white);
  draw.fillCircle(31, 35, 4, hexToRgb('#E8F0E6'));
});

drawIcon('health-icon-liver.png', (draw) => {
  categoryBase(draw);
  draw.fillEllipse(35, 38, 23, 13, white);
  draw.fillEllipse(49, 35, 10, 9, white);
  draw.fillEllipse(23, 41, 8, 8, white);
  draw.line(28, 37, 47, 34, 3, green);
});

drawIcon('health-icon-kidney.png', (draw) => {
  categoryBase(draw);
  draw.fillEllipse(28, 38, 10, 16, white);
  draw.fillEllipse(44, 38, 10, 16, white);
  draw.fillCircle(35, 37, 6, green);
  draw.line(36, 34, 36, 51, 3, white);
});

drawIcon('health-icon-tumor.png', (draw) => {
  categoryBase(draw);
  draw.fillCircle(28, 31, 8, white);
  draw.fillCircle(42, 28, 7, white);
  draw.fillCircle(45, 43, 9, white);
  draw.fillCircle(29, 45, 6, white);
  draw.line(28, 31, 42, 28, 4, white);
  draw.line(42, 28, 45, 43, 4, white);
  draw.line(29, 45, 45, 43, 4, white);
});

drawIcon('health-icon-default.png', (draw) => {
  categoryBase(draw);
  draw.line(24, 26, 48, 26, 6, white);
  draw.line(24, 37, 48, 37, 6, white);
  draw.line(24, 48, 40, 48, 6, white);
});

drawIcon('health-warning.png', (draw) => {
  draw.fillPolygon([[32, 9], [58, 55], [6, 55]], red);
  draw.line(32, 24, 32, 40, 5, white);
  draw.fillCircle(32, 47, 3, white);
}, 64);

console.log(`Generated UI refresh icons in ${outDir}`);
