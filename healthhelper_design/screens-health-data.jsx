// Combined 健康数据 Tab — Plan C v3
// 异常优先 + chip 筛选 + 折叠主题 + 行内趋势文字 + 首次气泡引导

function HDSearchBar() {
  return (
    <div style={{ padding: '8px 16px 0' }}>
      <div style={{
        background: '#fff', border: `1px solid ${WF.borderSoft}`,
        borderRadius: 14, padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
        </svg>
        <div style={{ fontSize: 13, color: WF.ink3, flex: 1 }}>搜索指标 / 报告 / 医院</div>
      </div>
    </div>
  );
}

function HDChips({ active = '全部' }) {
  const chips = [
    { k: '全部' }, { k: '异常', badge: 3 }, { k: '血常规' }, { k: '肝功能' }, { k: '肾功能' }, { k: '肿瘤标志物' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px 4px', scrollbarWidth: 'none' }}>
      {chips.map((c) => {
        const isActive = c.k === active;
        return (
          <div key={c.k} style={{
            padding: '6px 12px', borderRadius: 14, fontSize: 12,
            background: isActive ? WF.primary : '#fff',
            color: isActive ? '#fff' : WF.ink2,
            border: `1px solid ${isActive ? WF.primary : WF.borderSoft}`,
            whiteSpace: 'nowrap', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {c.k}
            {c.badge && (
              <span style={{
                background: isActive ? 'rgba(255,255,255,0.3)' : WF.alertHigh,
                color: '#fff', fontSize: 10, fontWeight: 600,
                padding: '0 5px', borderRadius: 7, minWidth: 14, textAlign: 'center',
              }}>{c.badge}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// One metric row — value + trend text + arrow (no sparkline, low density)
function HDMetricRow({ k, v, u, tone, days, trend }) {
  const c = tone === 'high' ? WF.alertHigh : tone === 'low' ? WF.alertLow : WF.ink;
  const trendC = trend && trend.dir === 'down' ? WF.alertLow : trend && trend.dir === 'up' ? WF.alertHigh : WF.ink3;
  const arrow = trend ? (trend.dir === 'down' ? '↘' : trend.dir === 'up' ? '↗' : '→') : '→';
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
      borderBottom: `1px solid ${WF.borderSoft}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: WF.ink, fontWeight: 500 }}>{k}</div>
        <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>
          {days} · <span style={{ color: trendC, fontWeight: 500 }}>{arrow} {trend ? trend.label : ''}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'flex-end' }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
          {tone !== 'ok' && (
            <span style={{ fontSize: 12, color: c, fontWeight: 700 }}>
              {tone === 'high' ? '↑' : '↓'}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: WF.ink3, marginTop: 1 }}>{u}</div>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>
  );
}

function HDTopicHead({ name, n, abnormal, lastDate, stale, expanded }) {
  return (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8,
      background: '#FAF8F3', borderBottom: expanded ? `1px solid ${WF.borderSoft}` : 'none',
      borderTopLeftRadius: 22, borderTopRightRadius: 22,
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.ink2} strokeWidth="2.5"
           style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}>
        <path d="M6 9l6 6 6-6"/>
      </svg>
      <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>{name}</div>
      <span style={{ fontSize: 11, color: WF.ink3 }}>{n} 项</span>
      {abnormal > 0
        ? <WFPill tone="high">{abnormal} 异常</WFPill>
        : <WFPill tone="primary">全部正常</WFPill>}
      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 11, color: stale ? '#A8682E' : WF.ink3 }}>
        最近 {lastDate} {stale && '⚠'}
      </div>
    </div>
  );
}

function HDByMetric() {
  const groups = [
    { name: '血常规', lastDate: '4·28', stale: false, expanded: true, items: [
      { k: '白细胞', v: '3.2', u: '×10⁹/L', tone: 'low', days: '2 天前', trend: { dir: 'down', label: '持续下降' } },
      { k: '血红蛋白', v: '128', u: 'g/L', tone: 'ok', days: '2 天前', trend: { dir: 'flat', label: '平稳' } },
      { k: '血小板', v: '189', u: '×10⁹/L', tone: 'ok', days: '2 天前', trend: { dir: 'up', label: '略上升' } },
    ], more: 9 },
    { name: '肝功能', lastDate: '3·15', stale: false, expanded: true, items: [
      { k: 'ALT', v: '32', u: 'U/L', tone: 'ok', days: '45 天前', trend: { dir: 'flat', label: '平稳' } },
      { k: 'AST', v: '28', u: 'U/L', tone: 'ok', days: '45 天前', trend: { dir: 'down', label: '改善中' } },
      { k: '总胆红素', v: '24', u: 'μmol/L', tone: 'high', days: '45 天前', trend: { dir: 'up', label: '略上升' } },
    ]},
    { name: '肿瘤标志物', lastDate: '2·10', stale: true, expanded: true, items: [
      { k: 'CEA', v: '6.8', u: 'ng/mL', tone: 'high', days: '79 天前', trend: { dir: 'up', label: '持续上升' } },
      { k: 'CA15-3', v: '18', u: 'U/mL', tone: 'ok', days: '79 天前', trend: { dir: 'flat', label: '平稳' } },
    ], more: 3 },
    { name: '肾功能', lastDate: '3·15', stale: false, expanded: false, items: [] },
  ];
  return (
    <div>
      {groups.map((g, gi) => (
        <div key={g.name} style={{ padding: '12px 16px 0' }}>
          <WFCard style={{ padding: 0 }}>
            <HDTopicHead {...g} n={g.items.length || (g.name === '肾功能' ? 6 : 0)} abnormal={g.items.filter(i=>i.tone!=='ok').length} expanded={g.expanded} />
            {g.expanded && g.items.map((it) => <HDMetricRow key={it.k} {...it} />)}
            {g.expanded && g.more && (
              <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: WF.primary }}>
                ▼ 展开剩余 {g.more} 项
              </div>
            )}
          </WFCard>
        </div>
      ))}
      <div style={{ height: 16 }} />
    </div>
  );
}

function HDByTime() {
  const months = [
    { m: '2026年4月', n: 3, items: [
      { d: '28', dm: '4月', type: '血常规', hosp: '协和医院', ab: 2 },
      { d: '15', dm: '4月', type: 'CT 胸部', hosp: '肿瘤医院', ab: 0 },
      { d: '10', dm: '4月', type: '肝功能', hosp: '协和医院', ab: 1 },
    ]},
    { m: '2026年3月', n: 2, items: [
      { d: '22', dm: '3月', type: '肿瘤标志物', hosp: '协和医院', ab: 1 },
      { d: '08', dm: '3月', type: '血常规', hosp: '社区医院', ab: 0 },
    ]},
  ];
  return (
    <div>
      {months.map((mo) => (
        <div key={mo.m}>
          <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>{mo.n} 份</span>}>{mo.m}</WFSectionTitle>
          <div style={{ padding: '0 16px' }}>
            <WFCard style={{ padding: 0 }}>
              {mo.items.map((r, i, arr) => (
                <div key={i} style={{
                  padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
                }}>
                  <div style={{
                    width: 40, height: 44, borderRadius: 9,
                    background: WF.primarySoft, color: WF.primary,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{r.d}</div>
                    <div style={{ fontSize: 9, marginTop: 2 }}>{r.dm}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: WF.ink, fontWeight: 600 }}>{r.type}</div>
                    <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>{r.hosp}</div>
                  </div>
                  {r.ab > 0 && <WFPill tone="high">{r.ab} 异常</WFPill>}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </WFCard>
          </div>
        </div>
      ))}
    </div>
  );
}

// First-time tooltip pointing at a metric row
function HDFirstTip() {
  return (
    <div style={{
      position: 'absolute', top: 360, left: 16, right: 16, zIndex: 30,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: WF.ink, color: '#fff', padding: '10px 14px',
        borderRadius: 12, fontSize: 12, lineHeight: 1.5,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ flex: 1 }}>👆 点击任意指标，查看完整曲线和历次详情</span>
        <span style={{ fontSize: 16, opacity: 0.7 }}>×</span>
      </div>
      <div style={{
        width: 0, height: 0, marginLeft: 40, marginTop: -1,
        borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
        borderTop: `6px solid ${WF.ink}`,
      }} />
    </div>
  );
}

function HealthDataView({ defaultTab = 'metric', showTip }) {
  const [tab, setTab] = React.useState(defaultTab);
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="健康数据" right="上传" />
      <HDSearchBar />
      {/* Segmented control — 按指标 default (left) */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', background: '#E5E1DA', borderRadius: 12, padding: 3 }}>
          {[
            { k: 'metric', label: '按指标', sub: '48 项' },
            { k: 'time', label: '按时间', sub: '12 份报告' },
          ].map((t) => {
            const active = tab === t.k;
            return (
              <div key={t.k} onClick={() => setTab(t.k)} style={{
                flex: 1, padding: '7px 0', textAlign: 'center', borderRadius: 10,
                background: active ? '#fff' : 'transparent',
                color: active ? WF.ink : WF.ink2,
                fontSize: 13, fontWeight: active ? 600 : 500,
                boxShadow: active ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
              }}>
                {t.label}
                <div style={{ fontSize: 10, color: WF.ink3, marginTop: 1, fontWeight: 400 }}>{t.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
      {tab === 'metric' && <HDChips active="全部" />}
      {tab === 'metric' ? <HDByMetric/> : <HDByTime/>}
      {showTip && <HDFirstTip />}
      <WFTabBar active={1} />
    </div>
  );
}

function HealthDataReportsView() { return <HealthDataView defaultTab="time" />; }
function HealthDataMetricsView() { return <HealthDataView defaultTab="metric" />; }
function HealthDataFirstView() { return <HealthDataView defaultTab="metric" showTip />; }

Object.assign(window, { HealthDataView, HealthDataReportsView, HealthDataMetricsView, HealthDataFirstView });
