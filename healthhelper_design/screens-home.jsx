// Home / 工作台 — 4 states
// A: not logged in
// B: logged in, no data (and no profile yet — leads to first-time profile choice)
// C: logged in, has data — main daily state with profile switcher
// D: home with "recognizing in background" floating toast

function HomeStateA() {
  return (
    <div style={{ background: WF.bg, height: '100%', position: 'relative', fontFamily: WF.font, overflow: 'hidden' }}>
      <WFBanner height={280} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <div style={{ position: 'absolute', top: '38%', left: 0, right: 0, textAlign: 'center' }}>
          <div style={{
            width: 76, height: 76, borderRadius: 22, margin: '0 auto 14px',
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                 stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2h6l2 4v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6l2-4z"/>
              <path d="M9 12h6M9 16h4"/>
            </svg>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>我的病例夹</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>电子病例夹 · 公益免费</div>
        </div>
      </WFBanner>
      <div style={{ padding: '32px 24px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 16, color: WF.ink, lineHeight: 1.6, fontWeight: 500 }}>
          轻松管理检查报告
        </div>
        <div style={{ fontSize: 14, color: WF.ink2, marginTop: 4 }}>
          追踪健康指标，规划复查日程
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 60, left: 24, right: 24 }}>
        <WFButton full icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
            <path d="M8.7 19.5a8 8 0 116.6 0c.9.7 1.5 1.7 1.5 2.5h-9.6c0-.8.6-1.8 1.5-2.5z"/>
          </svg>
        }>微信一键登录</WFButton>
        <div style={{ fontSize: 11, color: WF.ink3, marginTop: 12, textAlign: 'center' }}>
          登录即同意《用户协议》和《隐私政策》
        </div>
      </div>
    </div>
  );
}

// B: logged in but no profile yet → leads to first-time profile choice
// (keeping the existing "empty data" state for after profile is created)
function HomeStateB() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFBanner height={150}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px 5px 5px', borderRadius: 18,
            background: 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.35)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              background: 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 600,
            }}>芬</div>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>妈妈 · 王芬</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>早上好</div>
      </WFBanner>
      <div style={{ padding: '40px 24px 0', textAlign: 'center' }}>
        <WFPlaceholder w="100%" h={140} label="EMPTY-ILLUSTRATION" style={{ marginBottom: 24 }} />
        <div style={{ fontSize: 15, color: WF.ink, fontWeight: 500 }}>
          还没有妈妈的检查报告
        </div>
        <div style={{ fontSize: 13, color: WF.ink2, marginTop: 6, lineHeight: 1.6 }}>
          上传一份开始管理健康指标
        </div>
        <div style={{ marginTop: 24 }}>
          <WFButton full icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          }>上传第一份报告</WFButton>
        </div>
      </div>
      <WFTabBar active={0} />
    </div>
  );
}

// C: main daily state — profile switcher in banner + full data
function HomeStateC() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFBanner height={140}>
        {/* Profile switcher chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px 5px 5px', borderRadius: 18,
            background: 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.35)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              background: 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 600,
            }}>芬</div>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>妈妈 · 王芬</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            width: 30, height: 30, borderRadius: 15,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6">
              <path d="M6 9a6 6 0 1112 0v4l2 3H4l2-3V9z"/>
              <path d="M10 19a2 2 0 004 0"/>
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, opacity: 0.9 }}>早上好，愿您今天舒心</div>
      </WFBanner>
      <div style={{ padding: '14px 16px 0' }}>
        <WFCard style={{ padding: 0 }}>
          <div style={{
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            background: WF.primary, borderRadius: 22, color: '#fff',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>上传妈妈的检查报告</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>拍照 / 相册 · AI 自动识别</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </WFCard>
      </div>
      <div style={{ padding: '10px 16px 0' }}>
        <WFCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, background: WF.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
                <rect x="3" y="5" width="18" height="16" rx="2"/>
                <path d="M3 10h18M8 3v4M16 3v4"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>妈妈距下次复查还有 5 天</div>
              <div style={{ fontSize: 12, color: WF.ink2, marginTop: 2 }}>5月5日 · 协和医院 · 常规复查</div>
            </div>
          </div>
        </WFCard>
      </div>
      <WFSectionTitle right="管理">关注指标</WFSectionTitle>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        padding: '0 16px 4px', scrollbarWidth: 'none',
      }}>
        {[
          { name: '白细胞', v: '3.2', u: '×10⁹/L', d: [5,4,5,4,3.5,3.2], abnormal: 'low' },
          { name: '血红蛋白', v: '128', u: 'g/L', d: [120,123,125,127,128,128] },
          { name: 'CEA', v: '6.8', u: 'ng/mL', d: [3,4,5,5.5,6,6.8], abnormal: 'high' },
        ].map((m) => (
          <div key={m.name} style={{
            minWidth: 148, background: '#fff', borderRadius: 18,
            border: `1px solid ${WF.borderSoft}`, padding: 12, flex: '0 0 auto',
          }}>
            <div style={{ fontSize: 12, color: WF.ink2 }}>{m.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <div style={{
                fontSize: 22, fontWeight: 700,
                color: m.abnormal === 'high' ? WF.alertHigh : m.abnormal === 'low' ? WF.alertLow : WF.ink,
              }}>{m.v}</div>
              <div style={{ fontSize: 10, color: WF.ink3 }}>{m.u}</div>
            </div>
            <div style={{ marginTop: 6 }}>
              <WFSpark data={m.d} w={120} h={28} abnormal={!!m.abnormal} />
            </div>
          </div>
        ))}
      </div>
      <WFSectionTitle right="查看全部 ›">最近报告</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { type: '血常规', hospital: '协和医院', date: '4月28日', abnormal: 2 },
            { type: 'CT 胸部', hospital: '肿瘤医院', date: '4月15日', abnormal: 0 },
            { type: '肝功能', hospital: '协和医院', date: '4月10日', abnormal: 1 },
          ].map((r, i, arr) => (
            <div key={i} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <WFPill>{r.type}</WFPill>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: WF.ink, fontWeight: 500 }}>{r.hospital}</div>
                <div style={{ fontSize: 11, color: WF.ink3, marginTop: 1 }}>{r.date}</div>
              </div>
              {r.abnormal > 0 && (
                <div style={{ fontSize: 11, color: WF.alertHigh, fontWeight: 600 }}>
                  {r.abnormal} 项异常
                </div>
              )}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          ))}
        </WFCard>
      </div>
      <div style={{ height: 16 }} />
      <WFTabBar active={0} />
    </div>
  );
}

// D: home with background recognition floating toast
function HomeStateD() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 80 }}>
      <WFBanner height={140}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px 5px 5px', borderRadius: 18,
            background: 'rgba(255,255,255,0.22)',
            border: '1px solid rgba(255,255,255,0.35)',
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 12,
              background: 'rgba(255,255,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 600,
            }}>芬</div>
            <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>妈妈 · 王芬</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, opacity: 0.9 }}>早上好，愿您今天舒心</div>
      </WFBanner>
      {/* Floating recognition status (sticky, top of content) */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          background: '#fff',
          border: `1.5px solid ${WF.primary}`,
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 2px 8px rgba(90,122,90,0.15)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 16, background: WF.primarySoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2">
              <path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/>
              <path d="M14 3v4h4M8 13h8"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: WF.ink }}>正在识别 3 张报告</div>
            <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>识别完成后会通知您，请放心使用其他功能</div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 10,
            background: WF.primarySoft, color: WF.primary,
            fontSize: 11, fontWeight: 600,
          }}>查看 ›</div>
        </div>
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <WFCard style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 12, background: WF.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
                <rect x="3" y="5" width="18" height="16" rx="2"/>
                <path d="M3 10h18M8 3v4M16 3v4"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>妈妈距下次复查还有 5 天</div>
              <div style={{ fontSize: 12, color: WF.ink2, marginTop: 2 }}>5月5日 · 协和医院 · 常规复查</div>
            </div>
          </div>
        </WFCard>
      </div>
      <WFSectionTitle right="管理">关注指标</WFSectionTitle>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto',
        padding: '0 16px 4px', scrollbarWidth: 'none',
      }}>
        {[
          { name: '白细胞', v: '3.2', u: '×10⁹/L', d: [5,4,5,4,3.5,3.2], abnormal: 'low' },
          { name: '血红蛋白', v: '128', u: 'g/L', d: [120,123,125,127,128,128] },
        ].map((m) => (
          <div key={m.name} style={{
            minWidth: 148, background: '#fff', borderRadius: 18,
            border: `1px solid ${WF.borderSoft}`, padding: 12, flex: '0 0 auto',
          }}>
            <div style={{ fontSize: 12, color: WF.ink2 }}>{m.name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
              <div style={{
                fontSize: 22, fontWeight: 700,
                color: m.abnormal === 'low' ? WF.alertLow : WF.ink,
              }}>{m.v}</div>
              <div style={{ fontSize: 10, color: WF.ink3 }}>{m.u}</div>
            </div>
            <div style={{ marginTop: 6 }}>
              <WFSpark data={m.d} w={120} h={28} abnormal={!!m.abnormal} />
            </div>
          </div>
        ))}
      </div>
      <WFTabBar active={0} />
    </div>
  );
}

Object.assign(window, { HomeStateA, HomeStateB, HomeStateC, HomeStateD });
