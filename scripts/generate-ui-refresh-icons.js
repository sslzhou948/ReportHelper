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

  function arc(cx, cy, rx, ry, start, end, widthValue, color) {
    const span = Math.abs(end - start);
    const steps = Math.max(8, Math.ceil(span * Math.max(rx, ry) * SCALE));
    for (let i = 0; i <= steps; i += 1) {
      const t = start + (end - start) * (i / steps);
      fillCircle(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, widthValue / 2, color);
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

  return { arc, fillCircle, fillEllipse, fillPolygon, fillRect, fillRoundedRect, line, downsample };
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

function strokeRoundRect(draw, x, y, widthValue, heightValue, radius, widthStroke, color) {
  draw.line(x + radius, y, x + widthValue - radius, y, widthStroke, color);
  draw.line(x + radius, y + heightValue, x + widthValue - radius, y + heightValue, widthStroke, color);
  draw.line(x, y + radius, x, y + heightValue - radius, widthStroke, color);
  draw.line(x + widthValue, y + radius, x + widthValue, y + heightValue - radius, widthStroke, color);
  draw.arc(x + radius, y + radius, radius, radius, Math.PI, Math.PI * 1.5, widthStroke, color);
  draw.arc(x + widthValue - radius, y + radius, radius, radius, Math.PI * 1.5, Math.PI * 2, widthStroke, color);
  draw.arc(x + widthValue - radius, y + heightValue - radius, radius, radius, 0, Math.PI * 0.5, widthStroke, color);
  draw.arc(x + radius, y + heightValue - radius, radius, radius, Math.PI * 0.5, Math.PI, widthStroke, color);
}

function strokeCircle(draw, cx, cy, radius, widthStroke, color) {
  draw.arc(cx, cy, radius, radius, 0, Math.PI * 2, widthStroke, color);
}

function drawFoldedPaper(draw, x, y, widthValue, heightValue, color) {
  strokeRoundRect(draw, x, y, widthValue, heightValue, 5, 4, color);
  draw.line(x + widthValue - 13, y, x + widthValue, y + 13, 4, color);
  draw.line(x + widthValue - 13, y, x + widthValue - 13, y + 13, 4, color);
  draw.line(x + widthValue - 13, y + 13, x + widthValue, y + 13, 4, color);
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

drawIcon('profile-avatar-line.png', (draw) => {
  const avatarBg = hexToRgb('#DCE7DB');
  draw.fillCircle(60, 60, 56, avatarBg);
  strokeCircle(draw, 60, 44, 20, 5, green);
  draw.arc(60, 88, 40, 34, Math.PI * 1.03, Math.PI * 1.97, 5, green);
  draw.fillCircle(84, 80, 10, green);
  draw.fillCircle(97, 80, 10, green);
  draw.fillPolygon([[74, 83], [107, 83], [91, 102]], green);
  draw.fillCircle(84, 80, 5, avatarBg);
  draw.fillCircle(97, 80, 5, avatarBg);
  draw.fillPolygon([[81, 84], [100, 84], [91, 95]], avatarBg);
}, 120);

drawIcon('profile-folder.png', (draw) => {
  draw.line(10, 22, 25, 22, 4, green);
  draw.line(25, 22, 30, 28, 4, green);
  draw.line(30, 28, 54, 28, 4, green);
  strokeRoundRect(draw, 9, 23, 48, 34, 4, 4, green);
  draw.line(9, 33, 57, 33, 4, green);
}, 64);

drawIcon('profile-stack.png', (draw) => {
  draw.line(32, 10, 55, 22, 4, green);
  draw.line(55, 22, 32, 34, 4, green);
  draw.line(32, 34, 9, 22, 4, green);
  draw.line(9, 22, 32, 10, 4, green);
  draw.line(13, 33, 32, 43, 4, green);
  draw.line(32, 43, 51, 33, 4, green);
  draw.line(13, 44, 32, 54, 4, green);
  draw.line(32, 54, 51, 44, 4, green);
}, 64);

drawIcon('profile-export.png', (draw) => {
  strokeRoundRect(draw, 11, 19, 42, 36, 4, 4, green);
  draw.line(32, 7, 32, 35, 5, green);
  draw.line(21, 23, 32, 35, 5, green);
  draw.line(43, 23, 32, 35, 5, green);
  draw.line(20, 50, 44, 50, 4, green);
}, 64);

drawIcon('profile-archive.png', (draw) => {
  drawFoldedPaper(draw, 14, 10, 36, 44, green);
  draw.line(22, 26, 40, 26, 4, green);
  draw.line(22, 36, 36, 36, 4, green);
  draw.line(39, 45, 52, 54, 4, green);
  draw.line(51, 42, 52, 54, 4, green);
}, 64);

drawIcon('profile-template.png', (draw) => {
  strokeRoundRect(draw, 11, 14, 38, 38, 5, 4, green);
  draw.line(21, 43, 42, 22, 5, green);
  draw.line(38, 18, 46, 26, 5, green);
  draw.line(17, 48, 28, 45, 4, green);
}, 64);

drawIcon('profile-trash.png', (draw) => {
  const danger = hexToRgb('#D84D43');
  draw.line(20, 17, 44, 17, 5, danger);
  draw.line(25, 11, 39, 11, 4, danger);
  strokeRoundRect(draw, 18, 22, 28, 34, 3, 4, danger);
  draw.line(27, 29, 27, 49, 3, danger);
  draw.line(37, 29, 37, 49, 3, danger);
}, 64);

drawIcon('profile-guide.png', (draw) => {
  strokeRoundRect(draw, 9, 14, 23, 38, 4, 4, green);
  strokeRoundRect(draw, 32, 14, 23, 38, 4, 4, green);
  draw.line(32, 19, 32, 55, 4, green);
  draw.line(16, 24, 25, 24, 3, green);
  draw.line(39, 24, 48, 24, 3, green);
}, 64);

drawIcon('profile-help.png', (draw) => {
  strokeCircle(draw, 32, 32, 24, 4, green);
  draw.arc(32, 27, 10, 9, Math.PI * 1.03, Math.PI * 2.15, 4, green);
  draw.line(39, 32, 32, 39, 4, green);
  draw.fillCircle(32, 47, 3, green);
}, 64);

drawIcon('profile-feedback.png', (draw) => {
  strokeRoundRect(draw, 13, 13, 38, 33, 8, 4, green);
  draw.line(24, 46, 17, 55, 4, green);
  draw.line(24, 46, 33, 46, 4, green);
  draw.fillCircle(24, 29, 2.5, green);
  draw.fillCircle(32, 29, 2.5, green);
  draw.fillCircle(40, 29, 2.5, green);
}, 64);

drawIcon('profile-info.png', (draw) => {
  strokeCircle(draw, 32, 32, 24, 4, green);
  draw.fillCircle(32, 21, 3, green);
  draw.line(32, 30, 32, 45, 5, green);
}, 64);

drawIcon('guide-camera.png', (draw) => {
  const color = hexToRgb('#668B68');
  strokeRoundRect(draw, 19, 35, 58, 41, 9, 5, color);
  draw.line(33, 29, 50, 29, 5, color);
  draw.line(33, 29, 28, 35, 5, color);
  draw.line(50, 29, 56, 35, 5, color);
  strokeCircle(draw, 48, 56, 13, 5, color);
  draw.fillCircle(68, 43, 3, color);
}, 96);

drawIcon('guide-checklist.png', (draw) => {
  const color = hexToRgb('#668B68');
  strokeRoundRect(draw, 26, 20, 44, 58, 8, 5, color);
  strokeRoundRect(draw, 38, 14, 20, 12, 5, 5, color);
  [[34, 38, 40, 44, 49, 34], [34, 54, 40, 60, 49, 50], [34, 70, 40, 76, 49, 66]].forEach((points) => {
    draw.line(points[0], points[1], points[2], points[3], 4, color);
    draw.line(points[2], points[3], points[4], points[5], 4, color);
  });
}, 96);

drawIcon('guide-chart.png', (draw) => {
  const color = hexToRgb('#668B68');
  draw.line(20, 76, 78, 76, 5, color);
  strokeRoundRect(draw, 23, 56, 13, 20, 3, 5, color);
  strokeRoundRect(draw, 43, 42, 13, 34, 3, 5, color);
  strokeRoundRect(draw, 63, 25, 13, 51, 3, 5, color);
}, 96);

drawIcon('export-hero.png', (draw) => {
  const color = hexToRgb('#527858');
  drawFoldedPaper(draw, 20, 13, 50, 68, color);
  draw.line(31, 49, 62, 49, 6, color);
  draw.line(50, 36, 63, 49, 6, color);
  draw.line(50, 62, 63, 49, 6, color);
}, 96);

drawIcon('export-report.png', (draw) => {
  const color = hexToRgb('#527858');
  drawFoldedPaper(draw, 21, 16, 52, 64, color);
  draw.line(32, 40, 58, 40, 4, color);
  draw.line(32, 52, 60, 52, 4, color);
  draw.line(32, 64, 50, 64, 4, color);
}, 96);

drawIcon('export-metrics.png', (draw) => {
  const color = hexToRgb('#527858');
  strokeRoundRect(draw, 18, 19, 60, 58, 6, 5, color);
  draw.line(18, 38, 78, 38, 4, color);
  draw.line(18, 58, 78, 58, 4, color);
  draw.line(38, 19, 38, 77, 4, color);
  draw.line(58, 19, 58, 77, 4, color);
}, 96);

drawIcon('export-recheck.png', (draw) => {
  const color = hexToRgb('#527858');
  strokeRoundRect(draw, 19, 24, 58, 54, 8, 5, color);
  draw.line(19, 39, 77, 39, 5, color);
  draw.line(32, 15, 32, 31, 6, color);
  draw.line(64, 15, 64, 31, 6, color);
  draw.line(36, 58, 45, 67, 5, color);
  draw.line(45, 67, 62, 50, 5, color);
}, 96);

drawIcon('export-ready.png', (draw) => {
  const color = hexToRgb('#527858');
  strokeCircle(draw, 48, 48, 34, 5, color);
  draw.line(32, 49, 44, 61, 6, color);
  draw.line(44, 61, 66, 37, 6, color);
}, 96);

drawIcon('export-link.png', (draw) => {
  const color = hexToRgb('#527858');
  draw.arc(35, 39, 17, 12, Math.PI * 0.65, Math.PI * 1.85, 5, color);
  draw.arc(61, 57, 17, 12, Math.PI * 1.65, Math.PI * 2.85, 5, color);
  draw.line(40, 54, 56, 42, 5, color);
}, 96);

drawIcon('export-action-white.png', (draw) => {
  drawFoldedPaper(draw, 23, 18, 44, 58, white);
  draw.line(34, 49, 62, 49, 6, white);
  draw.line(51, 38, 62, 49, 6, white);
  draw.line(51, 60, 62, 49, 6, white);
}, 96);

drawIcon('metric-flag.png', (draw) => {
  const color = hexToRgb('#527858');
  draw.line(27, 18, 27, 78, 5, color);
  draw.line(30, 22, 69, 22, 5, color);
  draw.line(69, 22, 62, 47, 5, color);
  draw.line(62, 47, 30, 47, 5, color);
}, 96);

drawIcon('metric-range.png', (draw) => {
  const color = hexToRgb('#527858');
  draw.line(21, 68, 70, 19, 5, color);
  draw.line(24, 65, 31, 72, 5, color);
  draw.line(67, 16, 74, 23, 5, color);
  for (let i = 0; i < 5; i += 1) {
    const pos = 30 + i * 8;
    draw.line(pos, 59 - i * 8, pos + 5, 64 - i * 8, 3, color);
  }
}, 96);

drawIcon('metric-trend.png', (draw) => {
  const color = hexToRgb('#527858');
  draw.line(20, 75, 76, 75, 5, color);
  draw.line(20, 75, 20, 21, 5, color);
  draw.line(29, 60, 43, 46, 5, color);
  draw.line(43, 46, 55, 54, 5, color);
  draw.line(55, 54, 74, 31, 5, color);
  draw.line(66, 31, 74, 31, 5, color);
  draw.line(74, 31, 74, 40, 5, color);
}, 96);

drawIcon('metric-star-shield.png', (draw) => {
  const color = hexToRgb('#527858');
  draw.line(48, 16, 72, 25, 5, color);
  draw.line(72, 25, 69, 55, 5, color);
  draw.line(69, 55, 48, 78, 5, color);
  draw.line(48, 78, 27, 55, 5, color);
  draw.line(27, 55, 24, 25, 5, color);
  draw.line(24, 25, 48, 16, 5, color);
  draw.line(48, 36, 52, 45, 4, color);
  draw.line(52, 45, 62, 46, 4, color);
  draw.line(62, 46, 55, 53, 4, color);
  draw.line(55, 53, 57, 63, 4, color);
  draw.line(57, 63, 48, 58, 4, color);
  draw.line(48, 58, 39, 63, 4, color);
  draw.line(39, 63, 41, 53, 4, color);
  draw.line(41, 53, 34, 46, 4, color);
  draw.line(34, 46, 44, 45, 4, color);
  draw.line(44, 45, 48, 36, 4, color);
}, 96);

drawIcon('metric-pending.png', (draw) => {
  const color = hexToRgb('#527858');
  drawFoldedPaper(draw, 25, 16, 48, 64, color);
  draw.line(35, 39, 58, 39, 4, color);
  draw.line(35, 52, 54, 52, 4, color);
  draw.line(64, 57, 76, 69, 5, color);
  draw.line(76, 57, 64, 69, 5, color);
}, 96);

drawIcon('record-hero.png', (draw) => {
  const color = hexToRgb('#7EA184');
  const soft = hexToRgb('#DCE8DA99');
  draw.fillEllipse(90, 94, 34, 26, soft);
  drawFoldedPaper(draw, 38, 18, 50, 70, color);
  draw.line(50, 38, 68, 38, 5, color);
  draw.line(50, 52, 78, 52, 5, color);
  draw.line(50, 66, 70, 66, 5, color);
  draw.line(51, 90, 65, 76, 5, color);
  draw.line(65, 76, 78, 84, 5, color);
  draw.line(78, 84, 98, 60, 5, color);
  draw.fillCircle(51, 90, 5, color);
  draw.fillCircle(65, 76, 5, color);
  draw.fillCircle(78, 84, 5, color);
  draw.fillCircle(98, 60, 5, color);
  draw.fillCircle(104, 92, 20, hexToRgb('#7EA184'));
  draw.line(104, 78, 104, 106, 6, white);
  draw.line(90, 92, 118, 92, 6, white);
}, 128);

drawIcon('record-camera.png', (draw) => {
  const color = hexToRgb('#5A7A5A');
  strokeRoundRect(draw, 24, 34, 48, 36, 8, 5, color);
  draw.line(34, 34, 39, 25, 5, color);
  draw.line(39, 25, 57, 25, 5, color);
  draw.line(57, 25, 62, 34, 5, color);
  strokeCircle(draw, 48, 52, 11, 5, color);
  draw.line(16, 23, 16, 36, 5, color);
  draw.line(16, 23, 29, 23, 5, color);
  draw.line(80, 23, 67, 23, 5, color);
  draw.line(80, 23, 80, 36, 5, color);
  draw.line(16, 73, 16, 60, 5, color);
  draw.line(16, 73, 29, 73, 5, color);
  draw.line(80, 73, 67, 73, 5, color);
  draw.line(80, 73, 80, 60, 5, color);
}, 96);

drawIcon('record-pen.png', (draw) => {
  const color = hexToRgb('#5A7A5A');
  strokeRoundRect(draw, 23, 18, 40, 56, 6, 5, color);
  draw.line(35, 36, 52, 36, 5, color);
  draw.line(35, 49, 48, 49, 5, color);
  draw.line(55, 66, 74, 47, 6, color);
  draw.line(74, 47, 82, 55, 6, color);
  draw.line(82, 55, 63, 74, 6, color);
  draw.line(55, 66, 52, 78, 5, color);
  draw.line(52, 78, 63, 74, 5, color);
}, 96);

drawIcon('record-tip.png', (draw) => {
  const color = hexToRgb('#7EA184');
  strokeCircle(draw, 32, 25, 14, 4, color);
  draw.line(23, 36, 28, 45, 4, color);
  draw.line(41, 36, 36, 45, 4, color);
  draw.line(28, 45, 36, 45, 4, color);
  draw.line(28, 51, 36, 51, 4, color);
  draw.line(30, 57, 34, 57, 4, color);
}, 64);

drawIcon('profile-logout.png', (draw) => {
  const danger = hexToRgb('#D84D43');
  draw.line(13, 11, 36, 11, 4, danger);
  draw.line(13, 11, 13, 53, 4, danger);
  draw.line(13, 53, 36, 53, 4, danger);
  draw.line(30, 32, 53, 32, 5, danger);
  draw.line(43, 21, 54, 32, 5, danger);
  draw.line(43, 43, 54, 32, 5, danger);
}, 64);

drawIcon('upload-info.png', (draw) => {
  strokeCircle(draw, 32, 32, 24, 4, green);
  draw.fillCircle(32, 21, 3.5, green);
  draw.line(32, 31, 32, 45, 5, green);
}, 64);

drawIcon('upload-bulb.png', (draw) => {
  const amber = hexToRgb('#B86B1F');
  draw.arc(32, 28, 16, 16, Math.PI * 0.82, Math.PI * 2.18, 4, amber);
  draw.line(23, 41, 41, 41, 4, amber);
  draw.line(26, 48, 38, 48, 4, amber);
  draw.line(28, 55, 36, 55, 4, amber);
  draw.line(27, 43, 23, 36, 4, amber);
  draw.line(37, 43, 41, 36, 4, amber);
  draw.line(32, 11, 32, 5, 4, amber);
  draw.line(18, 16, 14, 12, 4, amber);
  draw.line(46, 16, 50, 12, 4, amber);
}, 64);

drawIcon('upload-camera.png', (draw) => {
  strokeRoundRect(draw, 12, 22, 40, 29, 7, 4, green);
  draw.line(23, 17, 41, 17, 5, green);
  draw.line(23, 17, 19, 23, 4, green);
  draw.line(41, 17, 45, 23, 4, green);
  strokeCircle(draw, 32, 36, 9, 4, green);
  draw.fillCircle(47, 29, 2.8, green);
}, 64);

drawIcon('upload-album.png', (draw) => {
  strokeRoundRect(draw, 13, 13, 38, 38, 5, 4, green);
  draw.fillCircle(25, 24, 4, green);
  draw.line(17, 45, 28, 34, 5, green);
  draw.line(28, 34, 35, 41, 5, green);
  draw.line(35, 41, 45, 29, 5, green);
}, 64);

drawIcon('upload-add.png', (draw) => {
  const soft = hexToRgb('#F7F5F2');
  draw.fillCircle(32, 32, 28, soft);
  draw.line(32, 18, 32, 46, 5, muted);
  draw.line(18, 32, 46, 32, 5, muted);
}, 64);

drawIcon('manual-flask-circle.png', (draw) => {
  draw.fillCircle(48, 48, 42, green);
  draw.line(40, 21, 56, 21, 6, white);
  draw.line(44, 22, 44, 48, 6, white);
  draw.line(52, 22, 52, 48, 6, white);
  draw.line(44, 48, 28, 70, 6, white);
  draw.line(52, 48, 68, 70, 6, white);
  draw.line(28, 70, 68, 70, 6, white);
  draw.fillCircle(39, 60, 4, green);
  draw.fillCircle(52, 62, 3, green);
}, 96);

drawIcon('manual-calendar.png', (draw) => {
  strokeRoundRect(draw, 12, 16, 40, 38, 5, 4, green);
  draw.line(12, 27, 52, 27, 4, green);
  draw.line(23, 10, 23, 21, 5, green);
  draw.line(41, 10, 41, 21, 5, green);
  draw.line(22, 37, 30, 45, 4, green);
  draw.line(30, 45, 43, 34, 4, green);
}, 64);

drawIcon('manual-hospital.png', (draw) => {
  strokeRoundRect(draw, 12, 20, 40, 36, 5, 4, green);
  strokeRoundRect(draw, 20, 10, 24, 20, 4, 4, green);
  draw.line(32, 16, 32, 26, 4, green);
  draw.line(27, 21, 37, 21, 4, green);
  draw.line(24, 56, 24, 43, 4, green);
  draw.line(40, 56, 40, 43, 4, green);
  draw.line(20, 37, 44, 37, 3, green);
}, 64);

drawIcon('manual-result.png', (draw) => {
  strokeRoundRect(draw, 15, 15, 34, 40, 5, 4, green);
  draw.line(25, 11, 39, 11, 4, green);
  draw.line(25, 20, 39, 20, 4, green);
  draw.line(23, 32, 41, 32, 3, green);
  draw.line(23, 43, 35, 43, 3, green);
}, 64);

drawIcon('manual-unit.png', (draw) => {
  draw.line(17, 48, 47, 18, 5, green);
  draw.line(14, 45, 20, 51, 5, green);
  draw.line(44, 15, 50, 21, 5, green);
  for (let i = 0; i < 4; i += 1) {
    const start = 24 + i * 6;
    draw.line(start, 41 - i * 6, start + 4, 45 - i * 6, 3, green);
  }
}, 64);

drawIcon('manual-reference.png', (draw) => {
  draw.line(18, 19, 18, 19, 7, green);
  draw.line(28, 19, 50, 19, 4, green);
  draw.line(18, 32, 18, 32, 7, green);
  draw.line(28, 32, 50, 32, 4, green);
  draw.line(18, 45, 18, 45, 7, green);
  draw.line(28, 45, 44, 45, 4, green);
}, 64);

drawIcon('manual-range.png', (draw) => {
  draw.arc(22, 39, 10, 12, Math.PI, Math.PI * 2, 4, green);
  draw.arc(42, 39, 10, 12, Math.PI, Math.PI * 2, 4, green);
  draw.line(12, 39, 12, 47, 4, green);
  draw.line(52, 39, 52, 47, 4, green);
  draw.line(20, 47, 44, 47, 4, green);
}, 64);

drawIcon('manual-status.png', (draw) => {
  draw.line(32, 9, 51, 18, 4, green);
  draw.line(51, 18, 49, 38, 4, green);
  draw.line(49, 38, 32, 55, 4, green);
  draw.line(32, 55, 15, 38, 4, green);
  draw.line(15, 38, 13, 18, 4, green);
  draw.line(13, 18, 32, 9, 4, green);
  draw.line(24, 32, 30, 39, 5, green);
  draw.line(30, 39, 42, 27, 5, green);
}, 64);

drawIcon('manual-note.png', (draw) => {
  drawFoldedPaper(draw, 15, 9, 34, 46, green);
  draw.line(23, 27, 40, 27, 3, green);
  draw.line(23, 37, 40, 37, 3, green);
  draw.line(23, 47, 34, 47, 3, green);
}, 64);

drawIcon('manual-save-white.png', (draw) => {
  strokeRoundRect(draw, 12, 10, 40, 44, 5, 4, white);
  draw.line(21, 10, 21, 28, 4, white);
  draw.line(43, 10, 43, 28, 4, white);
  draw.line(21, 28, 43, 28, 4, white);
  strokeRoundRect(draw, 22, 36, 20, 18, 3, 4, white);
}, 64);

drawIcon('manual-filter.png', (draw) => {
  draw.line(14, 18, 50, 18, 5, green);
  draw.line(18, 18, 30, 34, 5, green);
  draw.line(46, 18, 34, 34, 5, green);
  draw.line(30, 34, 30, 50, 5, green);
  draw.line(34, 34, 34, 45, 5, green);
  draw.line(30, 50, 39, 45, 5, green);
}, 64);

drawIcon('upload-close.png', (draw) => {
  const dark = hexToRgb('#1F1F1F');
  draw.fillCircle(32, 32, 29, white);
  strokeCircle(draw, 32, 32, 28, 2, hexToRgb('#E3DED6'));
  draw.line(23, 23, 41, 41, 5, dark);
  draw.line(41, 23, 23, 41, 5, dark);
}, 64);

drawIcon('upload-clip.png', (draw) => {
  const point = (x, y) => [x * 4.75 + 7, y * 4.75 + 8];

  function strokeCubic(p0, p1, p2, p3, widthValue, color) {
    let previous = p0;
    for (let i = 1; i <= 36; i += 1) {
      const t = i / 36;
      const mt = 1 - t;
      const point = [
        mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
        mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1]
      ];
      draw.line(previous[0], previous[1], point[0], point[1], widthValue, color);
      previous = point;
    }
  }

  const stroke = 10;
  const p0 = point(21.44, 11.05);
  const p1 = point(12.25, 20.24);
  const p2 = point(3.76, 11.75);
  const p3 = point(12.33, 3.18);
  const p4 = point(17.99, 8.84);
  const p5 = point(9.5, 17.32);
  const p6 = point(6.67, 14.49);
  const p7 = point(15.16, 6);

  draw.line(p0[0], p0[1], p1[0], p1[1], stroke, green);
  strokeCubic(p1, point(10.1, 22.4), point(5.6, 20.1), p2, stroke, green);
  draw.line(p2[0], p2[1], p3[0], p3[1], stroke, green);
  strokeCubic(p3, point(15.35, 0.2), point(20.85, 3.95), p4, stroke, green);
  draw.line(p4[0], p4[1], p5[0], p5[1], stroke, green);
  strokeCubic(p5, point(8.6, 18.2), point(5.8, 17.3), p6, stroke, green);
  draw.line(p6[0], p6[1], p7[0], p7[1], stroke, green);
}, 128);

drawIcon('upload-trash.png', (draw) => {
  draw.line(20, 18, 44, 18, 4, muted);
  draw.line(25, 12, 39, 12, 4, muted);
  strokeRoundRect(draw, 19, 23, 26, 30, 3, 4, muted);
  draw.line(28, 30, 28, 47, 3, muted);
  draw.line(36, 30, 36, 47, 3, muted);
}, 64);

drawIcon('upload-split.png', (draw) => {
  strokeRoundRect(draw, 12, 15, 22, 30, 4, 4, green);
  strokeRoundRect(draw, 31, 21, 21, 28, 4, 4, green);
  draw.line(26, 50, 38, 59, 4, green);
  draw.line(38, 59, 50, 50, 4, green);
  draw.line(38, 59, 38, 48, 4, green);
}, 64);

drawIcon('upload-report-sample.png', (draw) => {
  const paper = hexToRgb('#F6F4F1');
  const lineColor = hexToRgb('#9A948D');
  const grid = hexToRgb('#D8D2CA');
  draw.fillRoundedRect(5, 5, 150, 190, 7, paper);
  draw.line(19, 21, 94, 21, 3, lineColor);
  draw.line(19, 33, 132, 33, 2, lineColor);
  draw.line(19, 45, 112, 45, 2, lineColor);
  for (let y = 63; y <= 142; y += 13) {
    draw.line(18, y, 138, y, 1.5, grid);
  }
  for (let x = 18; x <= 138; x += 30) {
    draw.line(x, 57, x, 147, 1.5, grid);
  }
  for (let y = 68; y <= 136; y += 13) {
    draw.line(23, y, 43, y, 2, lineColor);
    draw.line(54, y, 73, y, 2, lineColor);
    draw.line(84, y, 105, y, 2, lineColor);
    draw.line(115, y, 132, y, 2, lineColor);
  }
  draw.line(23, 166, 50, 154, 2.5, green);
  draw.line(50, 154, 74, 161, 2.5, green);
  draw.line(84, 165, 108, 153, 2.5, hexToRgb('#D84D43'));
  draw.line(108, 153, 134, 160, 2.5, hexToRgb('#D84D43'));
}, 160);

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
