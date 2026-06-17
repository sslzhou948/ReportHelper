const DRAWING = {
  width: 186,
  height: 44,
  top: 9,
  bottom: 9
};

const COLORS = {
  ok: '#5A8B63',
  high: '#D84D43',
  positive: '#D84D43',
  abnormal: '#D84D43',
  low: '#2F6DB3'
};

let cachedPixelRatio = null;

function numericPoint(point) {
  const x = Number(point && point.x);
  const y = Number(point && point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y, tone: point.tone || 'ok' };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toneColor(tone) {
  return COLORS[tone] || COLORS.ok;
}

function getPixelRatio() {
  if (cachedPixelRatio) return cachedPixelRatio;
  try {
    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};
    cachedPixelRatio = Number(info.pixelRatio) || 1;
  } catch (error) {
    cachedPixelRatio = 1;
  }
  return cachedPixelRatio;
}

function drawKey(width, height, sparkline, points) {
  return JSON.stringify({
    width,
    height,
    tone: sparkline && sparkline.tone,
    neutralCurve: !!(sparkline && sparkline.neutralCurve),
    points: points.map((point) => [point.x, point.y, point.tone])
  });
}

function drawCatmullRom(ctx, points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y
    );
  }
}

Component({
  properties: {
    sparkline: {
      type: Object,
      value: null,
      observer() {
        this.queueDraw();
      }
    }
  },

  lifetimes: {
    ready() {
      this.queueDraw();
    },
    detached() {
      if (this.drawTimer) clearTimeout(this.drawTimer);
    }
  },

  methods: {
    queueDraw() {
      if (this.drawTimer) clearTimeout(this.drawTimer);
      this.drawTimer = setTimeout(() => this.draw(), 0);
    },

    draw() {
      this.drawTimer = null;
      const query = this.createSelectorQuery();
      query.select('.home-sparkline-canvas').fields({ node: true, size: true }).exec((result) => {
        const canvasInfo = result && result[0];
        const canvas = canvasInfo && canvasInfo.node;
        if (!canvas || !canvas.getContext || !canvasInfo.width || !canvasInfo.height) return;

        const points = ((this.data.sparkline && this.data.sparkline.curvePoints) || [])
          .map(numericPoint)
          .filter(Boolean);

        const ratio = getPixelRatio();
        const width = canvasInfo.width;
        const height = canvasInfo.height;
        const key = drawKey(width, height, this.data.sparkline, points);
        if (key === this.lastDrawKey) return;
        this.lastDrawKey = key;

        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);

        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, width, height);
        if (points.length < 2) return;

        const scaleX = width / DRAWING.width;
        const scaleY = height / DRAWING.height;
        const minY = DRAWING.top * scaleY;
        const maxY = (DRAWING.height - DRAWING.bottom) * scaleY;
        const scaled = points.map((point) => ({
          x: point.x * scaleX,
          y: clamp(point.y * scaleY, minY, maxY),
          tone: point.tone
        }));
        const start = scaled[0];
        const end = scaled[scaled.length - 1];
        const color = toneColor((this.data.sparkline && this.data.sparkline.tone) || end.tone);

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        if (this.data.sparkline && this.data.sparkline.neutralCurve) {
          ctx.quadraticCurveTo((start.x + end.x) / 2, clamp(start.y - 5 * scaleY, minY, maxY), end.x, end.y);
        } else if (scaled.length === 2) {
          const dx = end.x - start.x;
          ctx.bezierCurveTo(start.x + dx * 0.42, start.y, end.x - dx * 0.42, end.y, end.x, end.y);
        } else {
          drawCatmullRom(ctx, scaled);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(end.x, end.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
});
