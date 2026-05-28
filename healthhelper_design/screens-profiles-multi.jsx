// Multi-profile management — cleaned up
// Flow:
//   First-time:    HomeStateA(unlogged) → choose profile type → AddProfileForm → home
//   Daily:         HomeStateC(with switcher chip) — chip click → ProfileSwitcherSheet
//   Switch:        ProfileSwitcherSheet → tap profile → home refreshed
//   Add new:       ProfileSwitcherSheet → "+" → AddProfileForm → home with new profile

function FirstTimeProfileChoice() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFBanner height={180}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>欢迎使用病例夹</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>创建第一份档案</div>
      </WFBanner>
      <div style={{ padding: '24px 16px 16px' }}>
        <div style={{ fontSize: 14, color: WF.ink2, marginBottom: 14, lineHeight: 1.6 }}>
          这份档案是谁的？后续可以创建更多档案，<br/>同时管理自己和亲属的健康数据。
        </div>
        <WFCard style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: WF.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 21a8 8 0 0116 0"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: WF.ink }}>为我自己</div>
              <div style={{ fontSize: 12, color: WF.ink3, marginTop: 4 }}>管理自己的健康数据</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </WFCard>
        <WFCard style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: '#FAF5EC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C99B5C" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="9" cy="7" r="3"/>
                <circle cx="17" cy="9" r="2.5"/>
                <path d="M3 19a6 6 0 0112 0M14 19a5 5 0 017-4.6"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: WF.ink }}>为我的亲属</div>
              <div style={{ fontSize: 12, color: WF.ink3, marginTop: 4 }}>帮父母 / 长辈管理报告与复查</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </WFCard>
        <div style={{ fontSize: 11, color: WF.ink3, textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          所有档案的数据归患者本人所有，<br/>本应用严格保护隐私
        </div>
      </div>
    </div>
  );
}

// Bottom sheet — tap to switch, "+" to add, "管理 ›" to enter management mode
function ProfileSwitcherSheet({ manageMode = false }) {
  const profiles = [
    { name: '王芬', relation: '妈妈', disease: '乳腺癌术后 · 第 24 个月', avatar: '芬', current: true },
    { name: '李建国', relation: '我自己', disease: '高血压随访', avatar: '建', current: false },
    { name: '李大山', relation: '爸爸', disease: '糖尿病', avatar: '山', current: false },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      {/* Dimmed home behind */}
      <div style={{ background: WF.bg, position: 'absolute', inset: 0 }}>
        <WFBanner height={140}>
          <div style={{ fontSize: 16, fontWeight: 500, opacity: 0.9 }}>早上好</div>
        </WFBanner>
        <div style={{ padding: '14px 16px 0', opacity: 0.4 }}>
          <WFCard><div style={{ height: 60 }}/></WFCard>
        </div>
      </div>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.35)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: '12px 16px 26px',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: WF.borderSoft, margin: '0 auto 14px',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: WF.ink, flex: 1 }}>
            {manageMode ? '管理档案' : '切换档案'}
          </div>
          <span style={{ fontSize: 12, color: WF.primary }}>
            {manageMode ? '完成' : '管理 ›'}
          </span>
        </div>
        {profiles.map((p) => (
          <div key={p.name} style={{
            padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 12,
            borderRadius: 14,
            background: p.current && !manageMode ? WF.primarySoft : 'transparent',
            marginBottom: 6,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 20,
              background: p.current && !manageMode ? WF.primary : '#E5E1DA',
              color: p.current && !manageMode ? '#fff' : WF.ink2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 600,
            }}>{p.avatar}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: WF.ink }}>{p.name}</span>
                <span style={{
                  fontSize: 10, color: WF.ink3, padding: '1px 6px',
                  borderRadius: 6, background: '#F2EEE7',
                }}>{p.relation}</span>
              </div>
              <div style={{ fontSize: 11, color: WF.ink3, marginTop: 3 }}>{p.disease}</div>
            </div>
            {!manageMode && p.current && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 12l5 5 9-11"/>
              </svg>
            )}
            {manageMode && (
              <>
                <div style={{ fontSize: 11, color: WF.primary, padding: '4px 10px' }}>编辑</div>
                <div style={{ fontSize: 11, color: WF.alertHigh, padding: '4px 10px' }}>删除</div>
              </>
            )}
          </div>
        ))}
        <div style={{
          padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 12,
          borderTop: `1px solid ${WF.borderSoft}`, marginTop: 6, paddingTop: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 20,
            border: `1.5px dashed ${WF.primary}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
          <div style={{ flex: 1, fontSize: 14, color: WF.primary, fontWeight: 500 }}>添加新档案</div>
        </div>
      </div>
    </div>
  );
}

function ProfileSwitcherSheetManage() { return <ProfileSwitcherSheet manageMode={true} />; }

function AddProfileForm() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFNavBar title="添加档案" left="取消" right="保存" />
      <div style={{ padding: '14px 16px 0', fontSize: 12, color: WF.ink3, lineHeight: 1.6 }}>
        请填写基本信息，后续可在档案中补全用药等详细记录
      </div>
      <WFSectionTitle>关系</WFSectionTitle>
      <div style={{ padding: '0 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { k: '我自己' },
          { k: '妈妈', sel: true },
          { k: '爸爸' },
          { k: '配偶' },
          { k: '其他亲属' },
        ].map((c) => (
          <div key={c.k} style={{
            padding: '7px 14px', borderRadius: 12, fontSize: 13,
            background: c.sel ? WF.primary : '#fff',
            color: c.sel ? '#fff' : WF.ink2,
            border: `1px solid ${c.sel ? WF.primary : WF.borderSoft}`,
            fontWeight: c.sel ? 600 : 400,
          }}>{c.k}</div>
        ))}
      </div>
      <WFSectionTitle>基本信息</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '姓名', v: '王芬' },
            { k: '性别', v: '女' },
            { k: '出生日期', v: '1958 年 3 月 12 日' },
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
      <WFSectionTitle>病情</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '病种', v: '乳腺癌' },
            { k: '确诊日期', v: '2024 年 4 月 10 日' },
            { k: '治疗阶段', v: '康复随访' },
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
      <div style={{ padding: '20px 16px' }}>
        <WFButton full>保存档案</WFButton>
      </div>
    </div>
  );
}

Object.assign(window, {
  FirstTimeProfileChoice, ProfileSwitcherSheet, ProfileSwitcherSheetManage, AddProfileForm,
});
