// Profile / 我的 Tab — single consolidated version
// Replaces ProfileV1 + ProfileV2 — the "我的" tab focuses on account + entries

function ProfileMain() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFNavBar title="我的" />
      {/* Account card (wechat user) */}
      <div style={{ padding: '8px 16px 0' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 28,
              background: WF.primarySoft, color: WF.primary,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 600,
            }}>李</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: WF.ink }}>李华</div>
              <div style={{ fontSize: 12, color: WF.ink2, marginTop: 4 }}>微信 138****0001</div>
            </div>
          </div>
        </WFCard>
      </div>
      {/* Profile management section */}
      <WFSectionTitle>档案</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {/* Current profile shortcut */}
          <div style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: `1px solid ${WF.borderSoft}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 16,
              background: WF.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 600,
            }}>芬</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: WF.ink, fontWeight: 500 }}>
                当前档案：妈妈（王芬）
              </div>
              <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>乳腺癌术后 · 第 24 个月</div>
            </div>
            <span style={{ fontSize: 12, color: WF.primary }}>资料 ›</span>
          </div>
          {/* Profile management */}
          <div style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center',
            fontSize: 14, color: WF.ink,
          }}>
            <div style={{ flex: 1 }}>档案管理</div>
            <span style={{ fontSize: 11, color: WF.ink3, marginRight: 8 }}>3 份档案</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </WFCard>
      </div>
      {/* Data management */}
      <WFSectionTitle>数据</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { t: '清空当前档案数据' },
          ].map((r, i, arr) => (
            <div key={r.t} style={{
              padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: WF.ink }}>{r.t}</div>
                {r.d && <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>{r.d}</div>}
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      {/* Tools */}
      <WFSectionTitle>工具</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {['使用指南', '指标说明'].map((t, i, arr) => (
            <div key={t} style={{
              padding: '13px 16px', display: 'flex', alignItems: 'center',
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
              fontSize: 14, color: WF.ink,
            }}>
              <div style={{ flex: 1 }}>{t}</div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      {/* About */}
      <WFSectionTitle>关于</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { t: '意见反馈' },
            { t: '关于我们', d: 'v1.0.0' },
          ].map((r, i, arr) => (
            <div key={r.t} style={{
              padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
              fontSize: 14, color: WF.ink,
            }}>
              <div style={{ flex: 1 }}>{r.t}</div>
              {r.d && <span style={{ fontSize: 11, color: WF.ink3 }}>{r.d}</span>}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
        <span style={{ fontSize: 13, color: WF.alertHigh }}>退出登录</span>
      </div>
      <WFTabBar active={3} />
    </div>
  );
}

// Archive editor — for editing the current profile's medical info
function ArchiveV1() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 70 }}>
      <WFNavBar title="档案资料 · 妈妈（王芬）" right="保存" />
      <div style={{ padding: '12px 16px 0', fontSize: 11, color: WF.ink3, lineHeight: 1.5 }}>
        本页数据仅用于 AI 解读参考，严格遵守隐私保护
      </div>
      {[
        {
          h: '基本信息',
          rows: [
            { k: '姓名', v: '王芬' },
            { k: '性别', v: '女' },
            { k: '出生日期', v: '1958-03-12' },
            { k: '手机号', v: '138****0002' },
          ],
        },
        {
          h: '病情信息',
          rows: [
            { k: '病种', v: '乳腺癌' },
            { k: '确诊日期', v: '2024-04-10' },
            { k: '分期', v: 'IIA 期' },
            { k: '治疗阶段', v: '康复随访' },
          ],
        },
        {
          h: '就医信息',
          rows: [
            { k: '主治医院', v: '协和医院' },
            { k: '主治医生', v: '王主任' },
            { k: '科室', v: '肿瘤内科' },
          ],
        },
      ].map((sec) => (
        <div key={sec.h}>
          <WFSectionTitle>{sec.h}</WFSectionTitle>
          <div style={{ padding: '0 16px' }}>
            <WFCard style={{ padding: 0 }}>
              {sec.rows.map((r, i, arr) => (
                <div key={r.k} style={{
                  padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
                }}>
                  <div style={{ fontSize: 13, color: WF.ink2, minWidth: 76 }}>{r.k}</div>
                  <div style={{ flex: 1, fontSize: 14, color: WF.ink, textAlign: 'right' }}>{r.v}</div>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </div>
              ))}
            </WFCard>
          </div>
        </div>
      ))}
      <WFSectionTitle right="+ 添加">用药记录</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '他莫昔芬', d: '10mg · 每日 2 次 · 2024.06 起' },
            { k: '钙尔奇 D', d: '600mg · 每日 1 次 · 2024.06 起' },
          ].map((m, i, arr) => (
            <div key={m.k} style={{
              padding: '12px 16px',
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ fontSize: 14, color: WF.ink, fontWeight: 500 }}>{m.k}</div>
              <div style={{ fontSize: 12, color: WF.ink3, marginTop: 2 }}>{m.d}</div>
            </div>
          ))}
        </WFCard>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

Object.assign(window, { ProfileMain, ArchiveV1 });
