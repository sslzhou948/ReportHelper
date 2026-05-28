// Metrics list + detail screens

// V1: Topic-grouped cards
function MetricsListV1() {
  const topics = [
    { name: '血常规', n: 12, abnormal: 2, items: [
      { k: '白细胞', v: '3.2', tone: 'low' },
      { k: '血红蛋白', v: '128', tone: 'ok' },
      { k: '血小板', v: '189', tone: 'ok' },
    ]},
    { name: '肝功能', n: 8, abnormal: 1, items: [
      { k: 'ALT', v: '32', tone: 'ok' },
      { k: 'AST', v: '28', tone: 'ok' },
      { k: '总胆红素', v: '24', tone: 'high' },
    ]},
    { name: '肿瘤标志物', n: 5, abnormal: 1, items: [
      { k: 'CEA', v: '6.8', tone: 'high' },
      { k: 'CA15-3', v: '18', tone: 'ok' },
      { k: 'AFP', v: '3.2', tone: 'ok' },
    ]},
    { name: '肾功能', n: 6, abnormal: 0, items: [
      { k: '肌酐', v: '68', tone: 'ok' },
      { k: '尿素氮', v: '5.2', tone: 'ok' },
    ]},
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="我的指标" right="搜索" />
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {topics.map((t) => (
          <WFCard key={t.name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: WF.ink }}>{t.name}</div>
              <WFPill>{t.n} 项</WFPill>
              {t.abnormal > 0 && <WFPill tone="high">{t.abnormal} 异常</WFPill>}
              <div style={{ flex: 1 }} />
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {t.items.map((it) => {
                const c = it.tone === 'high' ? WF.alertHigh : it.tone === 'low' ? WF.alertLow : WF.ink;
                return (
                  <div key={it.k} style={{
                    flex: 1, padding: '10px 8px', borderRadius: 12,
                    background: '#FAF8F3', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{it.v}</div>
                    <div style={{ fontSize: 11, color: WF.ink2, marginTop: 2 }}>{it.k}</div>
                  </div>
                );
              })}
            </div>
          </WFCard>
        ))}
      </div>
      {/* FAB */}
      <div style={{
        position: 'absolute', right: 18, bottom: 96, zIndex: 10,
        width: 52, height: 52, borderRadius: 26, background: WF.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 18px rgba(90,122,90,0.35)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </div>
      <WFTabBar active={1} />
    </div>
  );
}

// V2: Compact dashboard with abnormal pinned (also used as default 健康数据 view)
function MetricsListV2() {
  const pinned = [
    { k: '白细胞', v: '3.2', u: '×10⁹/L', d: [5,4.5,4,3.8,3.5,3.2], tone: 'low', ref: '4.0-10.0' },
    { k: 'CEA', v: '6.8', u: 'ng/mL', d: [3,4,5,5.5,6,6.8], tone: 'high', ref: '<5.0' },
  ];
  const groups = [
    { name: '血常规', n: 12 },
    { name: '肝功能', n: 8 },
    { name: '肾功能', n: 6 },
    { name: '肿瘤标志物', n: 5 },
    { name: '影像学', n: 3 },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="我的指标" />
      <WFSectionTitle right={<WFPill tone="high">2</WFPill>}>需要关注</WFSectionTitle>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pinned.map((m) => {
          const c = m.tone === 'high' ? WF.alertHigh : WF.alertLow;
          return (
            <WFCard key={m.k} accent={c} style={{ paddingLeft: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: WF.ink2 }}>{m.k}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: c }}>{m.v}</div>
                    <div style={{ fontSize: 11, color: WF.ink3 }}>{m.u}</div>
                    <div style={{ fontSize: 11, color: c, marginLeft: 4 }}>
                      {m.tone === 'high' ? '↑ 偏高' : '↓ 偏低'}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>参考 {m.ref}</div>
                </div>
                <WFSpark data={m.d} w={90} h={42} abnormal />
              </div>
            </WFCard>
          );
        })}
      </div>
      <WFSectionTitle>所有主题</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {groups.map((g, i, arr) => (
            <div key={g.name} style={{
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, background: WF.primarySoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 17l4-6 4 4 5-9 5 11"/>
                </svg>
              </div>
              <div style={{ flex: 1, fontSize: 14, color: WF.ink, fontWeight: 500 }}>{g.name}</div>
              <span style={{ fontSize: 11, color: WF.ink3 }}>{g.n} 项</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      <WFTabBar active={1} />
    </div>
  );
}

// V1: Metric detail — quantitative (single ref line, source per row)
function MetricDetailV1() {
  const [pinned, setPinned] = React.useState(true);
  const history = [
    { d: '04·28', y: '2026', v: 3.2, tone: 'low', refLow: 3.5, refHigh: 10.0, hosp: '协和医院' },
    { d: '04·15', y: '2026', v: 3.5, tone: 'low', refLow: 4.0, refHigh: 10.0, hosp: '协和医院' },
    { d: '03·15', y: '2026', v: 3.8, tone: 'low', refLow: 4.0, refHigh: 10.0, hosp: '社区医院' },
    { d: '02·10', y: '2026', v: 4.0, tone: 'ok',  refLow: 4.0, refHigh: 10.0, hosp: '协和医院' },
    { d: '01·05', y: '2026', v: 4.5, tone: 'ok',  refLow: 4.0, refHigh: 10.0, hosp: '协和医院' },
    { d: '12·08', y: '2025', v: 4.8, tone: 'ok',  refLow: 4.0, refHigh: 10.0, hosp: '协和医院' },
    { d: '11·02', y: '2025', v: 5.2, tone: 'ok',  refLow: 4.0, refHigh: 10.0, hosp: '社区医院' },
  ];
  const chronological = [...history].reverse();
  const latestRefLow = history[0].refLow;
  const VISIBLE = 6, PT_GAP = 50, PAD_L = 28, PAD_R = 16, PAD_T = 12, PAD_B = 22;
  const innerW = (chronological.length - 1) * PT_GAP;
  const w = innerW + PAD_L + PAD_R, h = 160;
  const yMin = 2.5, yMax = 6.0;
  const yToPx = (v) => h - PAD_B - ((v - yMin) / (yMax - yMin)) * (h - PAD_T - PAD_B);
  const yTicks = [3, 4, 5, 6];
  const pts = chronological.map((p, i) => `${PAD_L + i * PT_GAP},${yToPx(p.v).toFixed(1)}`).join(' ');
  const refY = yToPx(latestRefLow);
  const scrollable = chronological.length > VISIBLE;

  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      {/* NavBar with star button */}
      <div style={{
        paddingTop: 56, padding: '56px 16px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderBottom: `1px solid ${WF.borderSoft}`,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={WF.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
        <div style={{ fontSize: 17, fontWeight: 600, color: WF.ink }}>白细胞</div>
        <div onClick={() => setPinned(!pinned)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          {pinned ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill={WF.primary} stroke={WF.primary} strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={WF.ink2} strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
            </svg>
          )}
        </div>
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: WF.alertLow, lineHeight: 1 }}>3.2</div>
            <div style={{ fontSize: 12, color: WF.ink3, marginBottom: 8 }}>×10⁹/L</div>
            <div style={{ flex: 1 }} />
            <WFPill tone="low">↓ 偏低</WFPill>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <WFPill tone="primary">本次参考 3.5–10.0</WFPill>
            <span style={{ fontSize: 11, color: WF.ink3 }}>4月28日 · 协和医院</span>
          </div>
        </WFCard>
      </div>
      {/* Chart */}
      <div style={{ padding: '12px 16px 0' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: WF.ink, fontWeight: 600, flex: 1 }}>趋势</div>
            {scrollable && <span style={{ fontSize: 10, color: WF.ink3 }}>← 滑动 →</span>}
          </div>
          <div style={{ overflowX: scrollable ? 'auto' : 'visible' }}>
            <svg width={w} height={h} style={{ display: 'block' }}>
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={PAD_L} y1={yToPx(t)} x2={w - PAD_R} y2={yToPx(t)} stroke={WF.borderSoft} strokeWidth="1" />
                  <text x={PAD_L - 6} y={yToPx(t) + 3} fontSize="9.5" fill={WF.ink3} textAnchor="end">{t}</text>
                </g>
              ))}
              {/* Single reference line (latest) */}
              <line x1={PAD_L} y1={refY} x2={w - PAD_R} y2={refY}
                    stroke={WF.primary} strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />
              <text x={w - PAD_R - 2} y={refY - 4} fontSize="9" fill={WF.primary} textAnchor="end">最新参考下限 {latestRefLow}</text>
              <polyline points={pts} fill="none" stroke={WF.alertLow} strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />
              {chronological.map((p, i) => {
                const x = PAD_L + i * PT_GAP;
                const y = yToPx(p.v);
                const c = p.tone === 'low' ? WF.alertLow : WF.primary;
                const isLast = i === chronological.length - 1;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={isLast ? 5 : 3.5} fill={c} stroke="#fff" strokeWidth="1.5" />
                    <text x={x} y={h - 6} fontSize="9.5" fill={WF.ink3} textAnchor="middle">{p.d}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div style={{ fontSize: 10.5, color: WF.ink3, marginTop: 8, lineHeight: 1.5 }}>
            参考范围可能因医院不同有差异，每次报告的参考值见下方历史记录
          </div>
        </WFCard>
      </div>
      {/* History list with ref range */}
      <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>{history.length} 次</span>}>历史记录</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {history.map((p, i, arr) => {
            const c = p.tone === 'low' ? WF.alertLow : WF.ink;
            return (
              <div key={i} style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
                borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
              }}>
                <div style={{ fontSize: 13, color: WF.ink2, fontFamily: 'ui-monospace', minWidth: 50 }}>{p.d}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 50 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{p.v.toFixed(1)}</div>
                  {p.tone === 'low' && <span style={{ fontSize: 11, color: c, fontWeight: 700 }}>↓</span>}
                </div>
                <div style={{ flex: 1, fontSize: 10.5, color: WF.ink3, textAlign: 'right' }}>
                  参考 {p.refLow}-{p.refHigh}
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            );
          })}
        </WFCard>
        <div style={{ fontSize: 11, color: WF.ink3, padding: '10px 4px 0' }}>点击任意行，跳转到该次报告详情</div>
      </div>
    </div>
  );
}

// V2: Metric detail — qualitative (HBsAg etc.)
function MetricDetailQualitative() {
  const history = [
    { d: '04·28', y: '2026', result: '阴性', tone: 'ok' },
    { d: '01·05', y: '2026', result: '阴性', tone: 'ok' },
    { d: '07·12', y: '2025', result: '阴性', tone: 'ok' },
    { d: '01·08', y: '2025', result: '阳性', tone: 'high' },
    { d: '07·20', y: '2024', result: '阳性', tone: 'high' },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFNavBar title="HBsAg 乙肝表面抗原" />
      {/* Hero card */}
      <div style={{ padding: '12px 16px 0' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: WF.ink, lineHeight: 1 }}>阴性</div>
            <div style={{ flex: 1 }} />
            <WFPill tone="primary">正常</WFPill>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <WFPill tone="primary">参考：阴性</WFPill>
            <span style={{ fontSize: 11, color: WF.ink3 }}>4月28日 · 协和医院</span>
          </div>
        </WFCard>
      </div>
      {/* Note about why no chart */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          padding: '10px 12px', background: '#FAF5EC', borderRadius: 10,
          fontSize: 12, color: WF.ink3, lineHeight: 1.5,
          border: `1px solid ${WF.borderSoft}`,
        }}>
          此项为定性指标，结果为阴性 / 阳性，不显示趋势曲线
        </div>
      </div>
      {/* History list */}
      <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>{history.length} 次</span>}>历史记录</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {history.map((p, i, arr) => {
            const isPos = p.tone === 'high';
            return (
              <div key={i} style={{
                padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
              }}>
                <div style={{ fontSize: 13, color: WF.ink2, fontFamily: 'ui-monospace, "SF Mono", monospace', minWidth: 50 }}>{p.d}</div>
                <div style={{ flex: 1, fontSize: 11, color: WF.ink3 }}>{p.y}</div>
                <div style={{
                  padding: '4px 10px', borderRadius: 9,
                  background: isPos ? '#F4DDDA' : WF.primarySoft,
                  color: isPos ? WF.alertHigh : WF.primary,
                  fontSize: 12, fontWeight: 600,
                }}>{p.result}</div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            );
          })}
        </WFCard>
        <div style={{ fontSize: 11, color: WF.ink3, padding: '10px 4px 0' }}>点击任意行，跳转到该次报告详情</div>
      </div>
    </div>
  );
}

Object.assign(window, { MetricsListV1, MetricsListV2, MetricDetailV1, MetricDetailQualitative });
