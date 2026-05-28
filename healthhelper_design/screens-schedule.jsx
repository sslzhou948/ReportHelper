// Schedule v3 — Simplified todolist system
// Just 2 screens: Hub (list + active todos inline) + New (single form)

function ScheduleHubV3() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="复查计划" right="+ 新增" />
      {/* Next visit — compact card */}
      <WFSectionTitle>下次复查</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: WF.ink, lineHeight: 1 }}>5月5日</div>
            <div style={{ fontSize: 12, color: WF.ink2, marginBottom: 3 }}>周一</div>
            <div style={{ flex: 1 }} />
            <div style={{
              padding: '5px 10px', borderRadius: 10,
              background: '#F7E8D8', color: '#A8682E',
              fontSize: 12, fontWeight: 600,
            }}>还有 5 天</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: WF.ink2 }}>协和医院 · 常规复查</div>
          {/* progress */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: WF.borderSoft, overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', background: WF.primary }} />
            </div>
            <div style={{ fontSize: 12, color: WF.ink2 }}>3/5 准备就绪</div>
          </div>
        </WFCard>
      </div>
      {/* Inline todos — main interaction */}
      <WFSectionTitle>待办事项</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { t: '预约挂号', done: true },
            { t: '准备身份证和病历本', done: true },
            { t: '复查前一日清淡饮食', done: true },
            { t: '复查当天空腹', done: false },
            { t: '提前 2 小时出发', done: false },
          ].map((it, i, arr) => (
            <div key={i} style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                border: `1.5px solid ${it.done ? WF.primary : WF.border}`,
                background: it.done ? WF.primary : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {it.done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <path d="M5 12l5 5 9-11"/>
                  </svg>
                )}
              </div>
              <div style={{
                flex: 1, fontSize: 14,
                color: it.done ? WF.ink3 : WF.ink,
                textDecoration: it.done ? 'line-through' : 'none',
                fontWeight: it.done ? 400 : 500,
              }}>{it.t}</div>
            </div>
          ))}
          <div style={{
            padding: '10px 14px', textAlign: 'center',
            borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.primary,
          }}>+ 添加待办</div>
        </WFCard>
      </div>
      {/* Other plans */}
      <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>2 项</span>}>之后还有</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { d: '6·12', wd: '周五', type: 'CT 检查', hosp: '肿瘤医院', cd: '43 天后' },
            { d: '7·03', wd: '周五', type: '门诊随访', hosp: '协和医院', cd: '64 天后' },
          ].map((it, i, arr) => (
            <div key={i} style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 44, height: 48, borderRadius: 9,
                background: WF.primarySoft, color: WF.primary,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{it.d}</div>
                <div style={{ fontSize: 9, marginTop: 2 }}>{it.wd}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: WF.ink, fontWeight: 600 }}>{it.type}</div>
                <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>{it.hosp}</div>
              </div>
              <div style={{ fontSize: 11, color: WF.ink2, fontWeight: 500 }}>{it.cd}</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      {/* Collapsed history */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{
          textAlign: 'center', fontSize: 13, color: WF.ink3,
          padding: '8px 0',
        }}>已完成 (12) ›</div>
      </div>
      <WFTabBar active={2} />
    </div>
  );
}

function ScheduleNewV3() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFNavBar title="新增复查" left="取消" right="保存" />
      <div style={{ padding: '14px 16px 0' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '检查类型', v: '常规复查', placeholder: false },
            { k: '日期', v: '2026 年 5 月 5 日' },
            { k: '医院', v: '协和医院' },
          ].map((r, i, arr) => (
            <div key={r.k} style={{
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ fontSize: 14, color: WF.ink2, minWidth: 76 }}>{r.k}</div>
              <div style={{ flex: 1, fontSize: 14, color: WF.ink, textAlign: 'right' }}>{r.v}</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      {/* Todos with template */}
      <WFSectionTitle right="全选">待办事项</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { t: '预约挂号', sel: true },
            { t: '准备身份证和病历本', sel: true },
            { t: '复查前一日清淡饮食', sel: true },
            { t: '复查当天空腹', sel: true },
            { t: '提前 2 小时出发', sel: true },
          ].map((it, i, arr) => (
            <div key={i} style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 5,
                border: `1.5px solid ${it.sel ? WF.primary : WF.border}`,
                background: it.sel ? WF.primary : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {it.sel && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <path d="M5 12l5 5 9-11"/>
                  </svg>
                )}
              </div>
              <div style={{ flex: 1, fontSize: 13.5, color: WF.ink }}>{it.t}</div>
            </div>
          ))}
          <div style={{
            padding: '11px 14px', textAlign: 'center',
            borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.primary,
          }}>+ 自定义待办</div>
        </WFCard>
      </div>
      <div style={{ padding: '20px 16px' }}>
        <WFButton full>保存</WFButton>
      </div>
    </div>
  );
}

// Plan detail page — full editor for any single plan
function ScheduleDetailV3() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 90 }}>
      <WFNavBar title="复查详情" />
      {/* Basic info card — all fields editable */}
      <WFSectionTitle>基本信息</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '检查类型', v: 'CT 检查' },
            { k: '日期', v: '2026 年 6 月 12 日 周五' },
            { k: '时段', v: '上午' },
            { k: '医院', v: '肿瘤医院' },
            { k: '科室', v: '影像科' },
            { k: '医生', v: '未指定' },
          ].map((r, i, arr) => (
            <div key={r.k} style={{
              padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ fontSize: 13, color: WF.ink2, minWidth: 76 }}>{r.k}</div>
              <div style={{
                flex: 1, fontSize: 14,
                color: r.v === '未指定' ? WF.ink3 : WF.ink,
                textAlign: 'right',
              }}>{r.v}</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          padding: '6px 14px', borderRadius: 12,
          background: WF.primarySoft, color: WF.primary,
          fontSize: 13, fontWeight: 600,
        }}>43 天后</div>
      </div>
      {/* Todos — fully editable */}
      <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>0/4</span>}>待办事项</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { t: '预约挂号', done: false },
            { t: '准备身份证和病历本', done: false },
            { t: '检查前 6 小时禁食', done: false },
            { t: '提前 2 小时出发', done: false },
          ].map((it, i, arr) => (
            <div key={i} style={{
              padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6,
                border: `1.5px solid ${it.done ? WF.primary : WF.border}`,
                background: it.done ? WF.primary : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {it.done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
                    <path d="M5 12l5 5 9-11"/>
                  </svg>
                )}
              </div>
              <div style={{
                flex: 1, fontSize: 14,
                color: it.done ? WF.ink3 : WF.ink,
                textDecoration: it.done ? 'line-through' : 'none',
                fontWeight: it.done ? 400 : 500,
              }}>{it.t}</div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="1.5">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </div>
          ))}
          <div style={{
            padding: '11px 14px', textAlign: 'center',
            borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.primary,
          }}>+ 添加待办</div>
        </WFCard>
      </div>
      {/* Reminder config */}
      <WFSectionTitle>提醒</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '提前 3 天', on: true },
            { k: '提前 1 天', on: true },
            { k: '当天上午', on: false },
          ].map((r, i, arr) => (
            <div key={r.k} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ flex: 1, fontSize: 14, color: WF.ink }}>{r.k}</div>
              <div style={{
                width: 36, height: 22, borderRadius: 11,
                background: r.on ? WF.primary : WF.border,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: r.on ? 16 : 2,
                  width: 18, height: 18, borderRadius: 9, background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }} />
              </div>
            </div>
          ))}
        </WFCard>
      </div>
      {/* Danger zone */}
      <div style={{ padding: '24px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          padding: '12px 16px', textAlign: 'center',
          background: '#fff', borderRadius: 14,
          fontSize: 14, color: WF.ink2,
          border: `1px solid ${WF.borderSoft}`,
        }}>取消此次复查</div>
        <div style={{
          padding: '12px 16px', textAlign: 'center',
          background: '#fff', borderRadius: 14,
          fontSize: 14, color: WF.alertHigh,
          border: `1px solid ${WF.borderSoft}`,
        }}>删除此计划</div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}

Object.assign(window, { ScheduleHubV3, ScheduleNewV3, ScheduleDetailV3 });
