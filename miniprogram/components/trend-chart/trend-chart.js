const CHART = {
  width: 860,
  height: 356,
  left: 72,
  right: 36,
  top: 44,
  bottom: 72,
  pointGap: 132
};

function roundTick(value) {
  if (value >= 100) return Math.round(value / 10) * 10;
  if (value >= 10) return Math.round(value);
  return Math.round(value * 10) / 10;
}

function formatTick(value) {
  const rounded = roundTick(value);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

function formatDateLabel(date) {
  const [, month, day] = `${date}`.split('-');
  if (!month || !day) return `${date}`;
  return `${Number(month)}.${Number(day)}`;
}

Component({
  properties: {
    history: {
      type: Array,
      value: []
    }
  },
  observers: {
    history() {
      this.prepare();
    }
  },
  lifetimes: {
    attached() {
      this.prepare();
    }
  },
  methods: {
    prepare() {
      const rows = (this.data.history || [])
        .filter((row) => row.valueType !== 'qualitative')
        .slice()
        .reverse();

      if (!rows.length) {
        this.setData({ points: [], segments: [], xLabels: [], yTicks: [], refLine: null, chartWidth: CHART.width });
        return;
      }

      const values = rows.map((row) => Number(row.valueNumeric || 0));
      const latest = rows[rows.length - 1];
      const latestRefLow = Number(latest.refRangeLow);
      const latestRefHigh = Number(latest.refRangeHigh);
      const scaleValues = values.slice();
      if (!Number.isNaN(latestRefLow)) scaleValues.push(latestRefLow);
      if (!Number.isNaN(latestRefHigh)) scaleValues.push(latestRefHigh);

      let min = Math.min(...scaleValues);
      let max = Math.max(...scaleValues);
      const padding = Math.max((max - min) * 0.18, max === min ? Math.max(Math.abs(max) * 0.12, 1) : 0.4);
      min -= padding;
      max += padding;
      const span = max - min || 1;
      const plotHeight = CHART.height - CHART.top - CHART.bottom;
      const chartWidth = Math.max(CHART.width, CHART.left + CHART.right + (rows.length - 1) * CHART.pointGap + 60);

      const yToPx = (value) => CHART.top + (max - value) / span * plotHeight;
      const tickValues = [max, min + span * 0.66, min + span * 0.33, min];
      const yTicks = tickValues.map((value) => ({
        value: formatTick(value),
        y: yToPx(value)
      }));

      const refLine = Number.isNaN(latestRefLow) ? null : {
        y: yToPx(latestRefLow),
        label: `最新参考下限 ${formatTick(latestRefLow)}`
      };

      const points = rows.map((row, index) => {
        const x = CHART.left + index * CHART.pointGap;
        const y = yToPx(Number(row.valueNumeric || 0));
        return {
          x,
          y,
          tone: row.tone,
          date: row.reportDate,
          isLatest: index === rows.length - 1
        };
      });

      const segments = [];
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        segments.push({
          id: `${i}`,
          left: a.x,
          top: a.y,
          width: Math.sqrt(dx * dx + dy * dy),
          angle: Math.atan2(dy, dx) * 180 / Math.PI,
          tone: b.tone
        });
      }

      const xLabels = points.map((point) => ({
        x: point.x,
        text: formatDateLabel(point.date)
      }));

      this.setData({ points, segments, xLabels, yTicks, refLine, chartWidth });
    }
  }
});
