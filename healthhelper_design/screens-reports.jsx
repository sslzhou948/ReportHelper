// Reports list + detail screens

// V1: Reports list — month-grouped
function ReportsListV1() {
  const months = [
    {
      m: '2026年4月',
      items: [
        { d: '28', dm: '4月', type: '血常规', hosp: '协和医院', n: 12, ab: 2 },
        { d: '15', dm: '4月', type: 'CT 胸部', hosp: '肿瘤医院', n: 6, ab: 0 },
        { d: '10', dm: '4月', type: '肝功能', hosp: '协和医院', n: 8, ab: 1 },
      ],
    },
    {
      m: '2026年3月',
      items: [
        { d: '22', dm: '3月', type: '肿瘤标志物', hosp: '协和医院', n: 5, ab: 1 },
        { d: '08', dm: '3月', type: '血常规', hosp: '社区医院', n: 12, ab: 0 },
      ],
    },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="检查报告" right="筛选" />
      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px', scrollbarWidth: 'none' }}>
        {['全部','血常规','肝功能','肾功能','CT','核磁','其他'].map((c, i) => (
          <div key={c} style={{
            padding: '6px 12px', borderRadius: 14, fontSize: 12,
            background: i === 0 ? WF.primary : '#fff',
            color: i === 0 ? '#fff' : WF.ink2,
            border: `1px solid ${i === 0 ? WF.primary : WF.borderSoft}`,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>{c}</div>
        ))}
      </div>
      {months.map((mo) => (
        <div key={mo.m}>
          <WFSectionTitle>{mo.m}</WFSectionTitle>
          <div style={{ padding: '0 16px' }}>
            <WFCard style={{ padding: 0 }}>
              {mo.items.map((r, i, arr) => (
                <div key={i} style={{
                  padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                  borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
                }}>
                  <div style={{
                    width: 44, height: 48, borderRadius: 10,
                    background: WF.primarySoft, color: WF.primary,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{r.d}</div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>{r.dm}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                      <WFPill tone="primary">{r.type}</WFPill>
                      <span style={{ fontSize: 11, color: WF.ink3 }}>{r.n} 项</span>
                    </div>
                    <div style={{ fontSize: 13, color: WF.ink, fontWeight: 500 }}>{r.hosp}</div>
                  </div>
                  {r.ab > 0 && <span style={{ fontSize: 11, color: WF.alertHigh, fontWeight: 600 }}>{r.ab} 项异常</span>}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </WFCard>
          </div>
        </div>
      ))}
      <div style={{ height: 16 }} />
      <WFTabBar active={1} />
    </div>
  );
}

// V2: Compact timeline list (date stamps in a vertical rail)
function ReportsListV2() {
  const items = [
    { d: '4·28', type: '血常规', hosp: '协和医院', ab: 2 },
    { d: '4·15', type: 'CT 胸部', hosp: '肿瘤医院', ab: 0 },
    { d: '4·10', type: '肝功能', hosp: '协和医院', ab: 1 },
    { d: '3·22', type: '肿瘤标志物', hosp: '协和医院', ab: 1 },
    { d: '3·08', type: '血常规', hosp: '社区医院', ab: 0 },
    { d: '2·14', type: '核磁', hosp: '肿瘤医院', ab: 0 },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="检查报告" />
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{
          background: '#fff', border: `1px solid ${WF.borderSoft}`,
          borderRadius: 14, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>
          </svg>
          <div style={{ fontSize: 13, color: WF.ink3, flex: 1 }}>搜索报告 / 医院</div>
        </div>
      </div>
      <div style={{ padding: '16px 16px 0', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 38, top: 24, bottom: 24, width: 1.5,
          background: WF.borderSoft,
        }} />
        {items.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12, position: 'relative' }}>
            <div style={{
              width: 44, fontSize: 11, color: WF.ink2, textAlign: 'right', paddingTop: 14,
              fontFamily: 'ui-monospace, "SF Mono", monospace',
            }}>{r.d}</div>
            <div style={{
              width: 9, height: 9, borderRadius: 5, background: r.ab > 0 ? WF.alertHigh : WF.primary,
              marginTop: 18, border: '2px solid #fff', boxShadow: '0 0 0 1.5px ' + (r.ab > 0 ? WF.alertHigh : WF.primary),
              flexShrink: 0,
            }} />
            <div style={{ flex: 1 }}>
              <WFCard style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>{r.type}</div>
                  {r.ab > 0 && <WFPill tone="high">{r.ab} 异常</WFPill>}
                </div>
                <div style={{ fontSize: 12, color: WF.ink2, marginTop: 4 }}>{r.hosp}</div>
              </WFCard>
            </div>
          </div>
        ))}
      </div>
      <WFTabBar active={1} />
    </div>
  );
}

// V3: Empty state
function ReportsListV3() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFNavBar title="检查报告" />
      <div style={{ padding: '60px 32px 0', textAlign: 'center' }}>
        <WFPlaceholder w="100%" h={150} label="EMPTY-REPORTS-ILLUSTRATION" style={{ marginBottom: 24 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: WF.ink }}>还没有报告</div>
        <div style={{ fontSize: 13, color: WF.ink2, marginTop: 8, lineHeight: 1.6 }}>
          上传一份开始管理健康记录
        </div>
        <div style={{ marginTop: 28 }}>
          <WFButton full>去上传一份</WFButton>
        </div>
        <div style={{ marginTop: 12 }}>
          <WFButton variant="secondary" full>手动录入</WFButton>
        </div>
      </div>
      <WFTabBar active={1} />
    </div>
  );
}

// V1: Report detail — grouped table
function ReportDetailV1() {
  const groups = [
    { name: '红细胞系列', rows: [
      { k: '红细胞', v: '4.2', u: '10¹²/L', ref: '4.0-5.5', tone: 'ok' },
      { k: '血红蛋白', v: '128', u: 'g/L', ref: '120-160', tone: 'ok' },
      { k: '红细胞压积', v: '38', u: '%', ref: '35-45', tone: 'ok' },
    ]},
    { name: '白细胞系列', rows: [
      { k: '白细胞', v: '3.2', u: '10⁹/L', ref: '4.0-10.0', tone: 'low' },
      { k: '中性粒细胞', v: '1.6', u: '10⁹/L', ref: '2.0-7.0', tone: 'low' },
      { k: '淋巴细胞%', v: '42', u: '%', ref: '20-40', tone: 'high' },
    ]},
    { name: '血小板', rows: [
      { k: '血小板', v: '189', u: '10⁹/L', ref: '125-350', tone: 'ok' },
    ]},
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 70 }}>
      <WFNavBar title="血常规报告" right="编辑" />
      <div style={{ padding: '12px 16px 0' }}>
        <WFCard>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, color: WF.ink2 }}>协和医院</div>
              <div style={{ fontSize: 12, color: WF.ink3, marginTop: 2 }}>2026年4月28日 · 上午</div>
            </div>
            <WFPill tone="high">2 项异常</WFPill>
          </div>
          <div style={{ marginTop: 12, padding: 10, background: '#FAF8F3', borderRadius: 10, fontSize: 12, color: WF.ink2 }}>
            备注：术后第 24 个月常规复查 · 主治建议下月复查
          </div>
        </WFCard>
      </div>
      {groups.map((g) => (
        <div key={g.name}>
          <WFSectionTitle>{g.name}</WFSectionTitle>
          <div style={{ padding: '0 16px' }}>
            <WFCard style={{ padding: 0 }}>
              {g.rows.map((r, i, arr) => {
                const tone = r.tone;
                const bg = tone === 'high' ? '#FBF1ED' : tone === 'low' ? '#F0F2F8' : '#fff';
                const c = tone === 'high' ? WF.alertHigh : tone === 'low' ? WF.alertLow : WF.ink;
                return (
                  <div key={i} style={{
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                    background: bg,
                    borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
                  }}>
                    <div style={{ flex: 1, fontSize: 13, color: WF.ink }}>{r.k}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: c, minWidth: 44, textAlign: 'right' }}>{r.v}</div>
                    <div style={{ fontSize: 10, color: WF.ink3, minWidth: 44 }}>{r.u}</div>
                    <div style={{ fontSize: 10, color: WF.ink3, minWidth: 56, textAlign: 'right' }}>{r.ref}</div>
                    {tone !== 'ok' && (
                      <span style={{ fontSize: 11, color: c, fontWeight: 600, minWidth: 16, textAlign: 'right' }}>
                        {tone === 'high' ? '↑' : '↓'}
                      </span>
                    )}
                    {/* Trend icon — jump to metric trend */}
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, background: WF.primarySoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2" strokeLinecap="round">
                        <path d="M3 17l4-6 4 4 5-9 5 11"/>
                      </svg>
                    </div>
                  </div>
                );
              })}
            </WFCard>
          </div>
        </div>
      ))}
      <div style={{ height: 16 }} />
      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '10px 16px 22px', display: 'flex', gap: 10,
      }}>
        <WFButton variant="secondary" style={{ flex: 1, height: 44 }}>编辑</WFButton>
        <WFButton variant="danger" style={{ flex: 1, height: 44 }}>删除报告</WFButton>
      </div>
    </div>
  );
}

Object.assign(window, { ReportsListV1, ReportsListV2, ReportsListV3, ReportDetailV1 });
