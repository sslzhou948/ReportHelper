// Wireframe primitives — sketchy, mid-fi, with hint of olive green
// Used inside iOS frames on the design canvas

const WF = {
  bg: '#EDEAE4',
  cardBg: '#FFFFFF',
  ink: '#3C3630',
  ink2: '#7A7065',
  ink3: '#9A9085',
  border: '#D8D4CC',
  borderSoft: '#E5E1DA',
  primary: '#5A7A5A',
  primarySoft: '#E3EAE0',
  alertHigh: '#C07060',
  alertHighSoft: '#F5E2DC',
  alertLow: '#5A7AA8',
  alertLowSoft: '#DDE3EE',
  font: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, system-ui, sans-serif',
  hand: '"Kalam", "Caveat", "PingFang SC", system-ui, cursive',
};

// Hatched/striped placeholder block
function WFPlaceholder({ w, h, label, style = {}, borderRadius = 8 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius,
      background: 'repeating-linear-gradient(135deg, #ECE8E1 0 6px, #F5F2EC 6px 12px)',
      border: `1px dashed ${WF.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace, "SF Mono", monospace',
      fontSize: 10, color: WF.ink3, letterSpacing: 0.4,
      ...style,
    }}>{label}</div>
  );
}

// Tiny sparkline using SVG polyline
function WFSpark({ data = [4,5,6,5,7,8], w = 110, h = 36, color = WF.primary, abnormal }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 4) + 2;
    const y = h - 4 - ((v - min) / range) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastX = w - 2;
  const lastY = h - 4 - ((data[data.length-1] - min) / range) * (h - 8);
  const stroke = abnormal ? WF.alertHigh : color;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={stroke} />
    </svg>
  );
}

// Section title with index dot (sketchy header)
function WFSectionTitle({ children, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', marginTop: 18, marginBottom: 10,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink, fontFamily: WF.font }}>
        {children}
      </div>
      {right && (
        <div style={{ fontSize: 12, color: WF.primary, fontFamily: WF.font }}>{right}</div>
      )}
    </div>
  );
}

// Card wrapper
function WFCard({ children, style = {}, accent }) {
  return (
    <div style={{
      background: WF.cardBg,
      borderRadius: 22,
      border: `1px solid ${WF.borderSoft}`,
      boxShadow: '0 1px 8px rgba(0,0,0,0.03)',
      padding: 16,
      position: 'relative', overflow: 'hidden',
      ...style,
    }}>
      {accent && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: 4, background: accent,
        }} />
      )}
      {children}
    </div>
  );
}

// Top gradient banner (olive green)
function WFBanner({ height = 140, children, style = {} }) {
  return (
    <div style={{
      height, padding: '54px 18px 18px',
      background: 'linear-gradient(160deg, #6B8E6B 0%, #5A7A5A 100%)',
      color: '#fff', fontFamily: WF.font,
      borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      position: 'relative',
      ...style,
    }}>{children}</div>
  );
}

// Simple primary button
function WFButton({ children, variant = 'primary', full, icon, style = {} }) {
  const styles = {
    primary: { bg: WF.primary, color: '#fff', border: 'none' },
    secondary: { bg: '#fff', color: WF.primary, border: `1.2px solid ${WF.primary}` },
    danger: { bg: WF.alertHigh, color: '#fff', border: 'none' },
    ghost: { bg: 'transparent', color: WF.primary, border: 'none' },
  }[variant];
  return (
    <button style={{
      height: 48, borderRadius: 16,
      background: styles.bg, color: styles.color, border: styles.border,
      fontFamily: WF.font, fontSize: 15, fontWeight: 600,
      width: full ? '100%' : undefined,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      padding: '0 18px',
      ...style,
    }}>
      {icon}{children}
    </button>
  );
}

// Bottom tab bar (4 tabs) — Plan C: 首页 / 健康数据 / 复查 / 我的
function WFTabBar({ active = 0 }) {
  const tabs = [
    { label: '首页', icon: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1V11z' },
    { label: '健康数据', icon: 'M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z' },
    { label: '复查', icon: 'M5 4h14a1 1 0 011 1v15a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zM3 9h18M8 2v4M16 2v4' },
    { label: '我的', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 78, paddingBottom: 28,
      background: '#fff',
      borderTop: `1px solid ${WF.borderSoft}`,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
      paddingTop: 8, fontFamily: WF.font, zIndex: 5,
    }}>
      {tabs.map((t, i) => {
        const c = i === active ? WF.primary : WF.ink3;
        return (
          <div key={t.label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: c, flex: 1,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon} />
            </svg>
            <div style={{ fontSize: 10.5, fontWeight: i === active ? 600 : 400 }}>
              {t.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Internal nav bar (back + title + optional right action)
function WFNavBar({ title, right, dark }) {
  return (
    <div style={{
      paddingTop: 56, padding: '56px 16px 12px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: WF.font,
      background: dark ? 'transparent' : '#fff',
      color: dark ? '#fff' : WF.ink,
      borderBottom: dark ? 'none' : `1px solid ${WF.borderSoft}`,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
           stroke={dark ? '#fff' : WF.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 14, color: dark ? '#fff' : WF.primary, minWidth: 22, textAlign: 'right' }}>
        {right || ''}
      </div>
    </div>
  );
}

// Status pill
function WFPill({ children, tone = 'default' }) {
  const tones = {
    default: { bg: '#F2EEE7', color: WF.ink2 },
    primary: { bg: WF.primarySoft, color: WF.primary },
    high: { bg: WF.alertHighSoft, color: WF.alertHigh },
    low: { bg: WF.alertLowSoft, color: WF.alertLow },
    warn: { bg: '#F7E8D8', color: '#A8682E' },
  }[tone];
  return (
    <span style={{
      background: tones.bg, color: tones.color,
      fontSize: 11, fontWeight: 500, padding: '3px 8px',
      borderRadius: 10, fontFamily: WF.font, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Annotation arrow + note (sketchy)
function WFNote({ children, style = {} }) {
  return (
    <div style={{
      position: 'absolute', fontFamily: WF.hand,
      fontSize: 12, color: '#8a6f3a',
      background: '#FFF8DC', padding: '4px 8px',
      border: '1px dashed #C9B574', borderRadius: 6,
      maxWidth: 160, lineHeight: 1.3,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  WF, WFPlaceholder, WFSpark, WFSectionTitle, WFCard, WFBanner,
  WFButton, WFTabBar, WFNavBar, WFPill, WFNote,
});
