// Upload flow v3 — paperclip-based grouping in single pick page
// Steps:
//   1. Pick & group (paperclip on each thumbnail; native preview via wx.previewImage)
//   2. Recognizing
//   3. Confirm overview (multiple report cards with "view details" button)
//   4. Confirm — report detail draft (edit OCR result, highlight uncertain)
//   5. Conflict resolution

// ─── shared bits ─────────────────────────────────────────────────
function PhotoTileV2({ idx, group, groupColor, inSelection, selectionOrder, size = 92 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: 'repeating-linear-gradient(135deg, #ECE8E1 0 6px, #F5F2EC 6px 12px)',
      border: inSelection
        ? `2.5px solid ${groupColor || WF.primary}`
        : group != null
        ? `2px solid ${groupColor}`
        : `1px solid ${WF.border}`,
      position: 'relative', boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'ui-monospace', fontSize: 10, color: WF.ink3,
    }}>
      第 {idx} 张
      {/* Group badge */}
      {group != null && (
        <div style={{
          position: 'absolute', top: 6, left: 6,
          padding: '2px 7px', borderRadius: 9,
          background: groupColor, color: '#fff',
          fontSize: 10, fontWeight: 700, lineHeight: 1.2,
        }}>组 {group}</div>
      )}
      {/* Selection order badge */}
      {selectionOrder != null && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: 11,
          background: groupColor || WF.primary, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
        }}>{selectionOrder}</div>
      )}
      {/* Paperclip icon (bottom right) */}
      {selectionOrder == null && (
        <div style={{
          position: 'absolute', bottom: 4, right: 4,
          width: 22, height: 22, borderRadius: 11,
          background: group != null ? groupColor : 'rgba(255,255,255,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke={group != null ? '#fff' : WF.ink2} strokeWidth="2" strokeLinecap="round">
            <path d="M21.4 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48"/>
          </svg>
        </div>
      )}
      {/* Delete (top right, only when not in selection) */}
      {selectionOrder == null && group == null && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 20, height: 20, borderRadius: 10,
          background: WF.ink, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, lineHeight: 1,
        }}>×</div>
      )}
    </div>
  );
}

// ─── Step 1: pick with paperclip grouping ────────────────────────
function UploadStep1PickV2() {
  const photos = [
    { idx: 1, group: 1, groupColor: WF.primary },
    { idx: 2, group: 1, groupColor: WF.primary },
    { idx: 3 },
    { idx: 4 },
  ];
  // 2 grouped (group 1) + 2 ungrouped = 3 reports total
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 88 }}>
      <WFNavBar title="上传检查报告" left="取消" />
      <div style={{ padding: '8px 16px 0', fontSize: 12, color: WF.ink2, lineHeight: 1.6 }}>
        默认每张图为独立报告。同一份报告的多页，点📎曲别针建立关联
      </div>
      {/* Two big actions */}
      <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10 }}>
        {[
          { t: '拍照', s: '使用相机', icon: 'camera' },
          { t: '从相册', s: '可选多张', icon: 'album' },
        ].map((b) => (
          <div key={b.t} style={{
            flex: 1, padding: '14px 10px',
            background: '#fff', borderRadius: 14,
            border: `1.5px dashed ${WF.primary}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: WF.primarySoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {b.icon === 'camera' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
                  <path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
                  <rect x="3" y="5" width="18" height="14" rx="2"/>
                  <circle cx="8" cy="10" r="2"/>
                  <path d="M21 16l-5-5-9 8"/>
                </svg>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>{b.t}</div>
            <div style={{ fontSize: 10.5, color: WF.ink3 }}>{b.s}</div>
          </div>
        ))}
      </div>
      {/* Selected images */}
      <WFSectionTitle>已选 {photos.length} 张 → 将识别为 3 份报告</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {photos.map((p) => (
            <PhotoTileV2 key={p.idx} idx={p.idx} group={p.group} groupColor={p.groupColor} />
          ))}
          {/* Add more */}
          <div style={{
            width: 92, height: 92, borderRadius: 12,
            background: '#fff', border: `1.5px dashed ${WF.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: WF.ink3, fontSize: 24, fontWeight: 300,
          }}>+</div>
        </div>
      </div>
      <div style={{ padding: '14px 16px 0', fontSize: 11, color: WF.ink3, lineHeight: 1.7 }}>
        💡 点击图片放大预览<br/>
        📎 点曲别针，再点其他图，建立"同一份报告"关联
      </div>
      {/* Bottom action */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '12px 16px 24px',
      }}>
        <WFButton full>开始识别（4 张 → 3 份报告）</WFButton>
      </div>
    </div>
  );
}

// ─── Step 1 variant: user is in the middle of grouping ───────────
function UploadStep1Grouping() {
  const photos = [
    { idx: 1, selectionOrder: 1 },  // active grouping started here
    { idx: 2, selectionOrder: 2 },
    { idx: 3 },  // candidate
    { idx: 4 },  // candidate
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 100 }}>
      <WFNavBar title="上传检查报告" left="取消" />
      {/* Top hint banner */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{
          background: WF.primarySoft, color: WF.primary,
          padding: '10px 14px', borderRadius: 12,
          fontSize: 13, lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2" strokeLinecap="round">
            <path d="M21.4 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48"/>
          </svg>
          <span style={{ flex: 1 }}>正在建立关联：按拍摄顺序点击属于同一份报告的图片</span>
        </div>
      </div>
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {photos.map((p) => (
            <PhotoTileV2 key={p.idx} idx={p.idx} inSelection={p.selectionOrder != null}
                         selectionOrder={p.selectionOrder} groupColor={WF.primary} />
          ))}
        </div>
      </div>
      <div style={{ padding: '20px 16px 0', textAlign: 'center', fontSize: 13, color: WF.ink2 }}>
        已选 <b style={{ color: WF.primary, fontSize: 16 }}>2</b> 张，按选中顺序合并
      </div>
      {/* Bottom actions */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '12px 16px 24px', display: 'flex', gap: 10,
      }}>
        <WFButton variant="secondary" style={{ flex: 1, height: 46 }}>取消</WFButton>
        <WFButton style={{ flex: 2, height: 46 }}>完成合并（2 张）</WFButton>
      </div>
    </div>
  );
}

// ─── Step 2: recognizing ─────────────────────────────────────────
function UploadStep2RecognizingV2() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative' }}>
      <WFNavBar title="识别中" left="" />
      <div style={{
        padding: '60px 32px 0', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}>
        <div style={{
          width: 100, height: 100, borderRadius: 50,
          background: WF.primarySoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24, position: 'relative',
        }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="1.6" strokeLinecap="round">
            <path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/>
            <path d="M14 3v4h4M8 13h8M8 17h6"/>
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: WF.ink }}>AI 正在识别报告</div>
        <div style={{ fontSize: 13, color: WF.ink2, marginTop: 8 }}>已识别 2 / 3 份报告</div>
        <div style={{
          width: '100%', height: 6, borderRadius: 3, background: WF.borderSoft,
          marginTop: 28, overflow: 'hidden',
        }}>
          <div style={{ width: '66%', height: '100%', background: WF.primary }} />
        </div>
        <div style={{ fontSize: 11, color: WF.ink3, marginTop: 12, lineHeight: 1.6 }}>
          通常需要 5-15 秒<br/>请保持网络畅通
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: confirm overview (with view-detail button) ──────────
function UploadStep3ConfirmV2() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 90 }}>
      <WFNavBar title="确认识别结果" left="取消" />
      <div style={{ padding: '10px 16px 0', fontSize: 12, color: WF.ink2, lineHeight: 1.6 }}>
        共识别出 3 份报告。请逐份查看详情核对，有冲突的请优先处理
      </div>
      {/* Card 1 */}
      <WFSectionTitle>报告 ① · 已合并 2 页</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2].map(i => (
                <div key={i} style={{
                  width: 30, height: 34, borderRadius: 5,
                  background: 'repeating-linear-gradient(135deg, #ECE8E1 0 4px, #F5F2EC 4px 8px)',
                  border: `1px solid ${WF.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: WF.ink3,
                }}>第{i}</div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>血常规</div>
              <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>协和医院 · 4月28日</div>
            </div>
          </div>
          <div style={{
            paddingTop: 10, borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.ink2, marginBottom: 10,
          }}>
            <span style={{ color: WF.ink }}>12 项指标</span> · <span style={{ color: WF.alertHigh }}>2 项异常</span>
          </div>
          {/* CTA — view details */}
          <div style={{
            padding: '11px 14px', borderRadius: 12,
            background: WF.primarySoft, color: WF.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13.5, fontWeight: 600,
          }}>
            查看 / 编辑详情
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2.2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: WF.ink3 }}>
            拆分页面
          </div>
        </WFCard>
      </div>
      {/* Card 2 — conflict + multi-category */}
      <WFSectionTitle>报告 ② · 已合并 2 页 ⚠</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard accent="#D89A5C" style={{ paddingLeft: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[3, 4].map(i => (
                <div key={i} style={{
                  width: 30, height: 34, borderRadius: 5,
                  background: 'repeating-linear-gradient(135deg, #ECE8E1 0 4px, #F5F2EC 4px 8px)',
                  border: `1px solid ${WF.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: WF.ink3,
                }}>第{i}</div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>综合生化</div>
              <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>协和医院 · 4月28日</div>
            </div>
          </div>
          <div style={{
            paddingTop: 10, borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.ink2, marginBottom: 10,
          }}>
            <span style={{ color: WF.ink }}>18 项指标</span> · <span style={{ color: WF.alertHigh }}>3 项异常</span>
            <div style={{ fontSize: 10.5, color: WF.ink3, marginTop: 3 }}>
              包含 肝功能 · 肾功能 · 血脂 多类指标
            </div>
          </div>
          {/* Conflict notice */}
          <div style={{
            padding: '9px 12px', borderRadius: 10,
            background: '#FAF0E0',
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              background: '#D89A5C', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>!</div>
            <div style={{ flex: 1, fontSize: 11.5, color: '#A8682E' }}>
              1 项重复识别，值不一致
            </div>
            <span style={{ fontSize: 11.5, color: '#A8682E', fontWeight: 600 }}>处理 ›</span>
          </div>
          <div style={{
            padding: '11px 14px', borderRadius: 12,
            background: WF.primarySoft, color: WF.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13.5, fontWeight: 600,
          }}>
            查看 / 编辑详情
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2.2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: WF.ink3 }}>
            拆分页面
          </div>
        </WFCard>
      </div>
      {/* Card 3 — standalone */}
      <WFSectionTitle>报告 ③</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 30, height: 34, borderRadius: 5,
              background: 'repeating-linear-gradient(135deg, #ECE8E1 0 4px, #F5F2EC 4px 8px)',
              border: `1px solid ${WF.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: WF.ink3,
            }}>第5</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink }}>CT 胸部</div>
              <div style={{ fontSize: 11, color: WF.ink3, marginTop: 2 }}>肿瘤医院 · 4月15日</div>
            </div>
          </div>
          <div style={{
            paddingTop: 10, borderTop: `1px solid ${WF.borderSoft}`,
            fontSize: 12, color: WF.ink2, marginBottom: 10,
          }}>
            <span style={{ color: WF.ink }}>影像学描述</span>
          </div>
          <div style={{
            padding: '11px 14px', borderRadius: 12,
            background: WF.primarySoft, color: WF.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13.5, fontWeight: 600,
          }}>
            查看 / 编辑详情
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WF.primary} strokeWidth="2.2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </WFCard>
      </div>
      {/* Bottom action */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '12px 16px 24px',
      }}>
        <WFButton full>全部保存到病例夹（3 份）</WFButton>
      </div>
    </div>
  );
}

// ─── Step 4: confirm — report detail draft (edit OCR) ────────────
// Multi-category report ('综合生化') showing OCR'd metrics grouped by category
function UploadStep4Detail() {
  const groups = [
    {
      name: '肝功能', items: [
        { k: 'ALT', v: '32', u: 'U/L', ref: '0-40', tone: 'ok' },
        { k: 'AST', v: '28', u: 'U/L', ref: '0-40', tone: 'ok' },
        { k: '总胆红素', v: '24', u: 'μmol/L', ref: '3-22', tone: 'high', uncertain: true },
      ],
    },
    {
      name: '肾功能', items: [
        { k: '肌酐', v: '68', u: 'μmol/L', ref: '44-133', tone: 'ok' },
        { k: '尿素氮', v: '5.2', u: 'mmol/L', ref: '2.5-7.5', tone: 'ok' },
      ],
    },
    {
      name: '血脂', items: [
        { k: '总胆固醇', v: '5.8', u: 'mmol/L', ref: '<5.2', tone: 'high' },
        { k: '甘油三酯', v: '1.6', u: 'mmol/L', ref: '<1.7', tone: 'ok' },
      ],
    },
  ];
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 90 }}>
      <WFNavBar title="编辑报告详情" left="返回" right="完成" />
      {/* Hint banner */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{
          background: '#FAF5EC',
          padding: '8px 12px', borderRadius: 10,
          fontSize: 11.5, color: '#A8682E', lineHeight: 1.5,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 16, height: 16, borderRadius: 8, background: '#D89A5C',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>!</span>
          黄色标记的项 OCR 不确定，请重点检查
        </div>
      </div>
      {/* Basic info */}
      <WFSectionTitle>基本信息</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard style={{ padding: 0 }}>
          {[
            { k: '报告类型', v: '综合生化', hint: '含多类指标' },
            { k: '医院', v: '协和医院' },
            { k: '检查日期', v: '2026 年 4 月 28 日' },
          ].map((r, i, arr) => (
            <div key={r.k} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
            }}>
              <div style={{ fontSize: 13, color: WF.ink2, minWidth: 76 }}>{r.k}</div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 14, color: WF.ink }}>{r.v}</div>
                {r.hint && <div style={{ fontSize: 10, color: WF.ink3, marginTop: 1 }}>{r.hint}</div>}
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          ))}
        </WFCard>
      </div>
      {/* Metrics by category */}
      {groups.map((g) => (
        <div key={g.name}>
          <WFSectionTitle right={<span style={{ fontSize: 11, color: WF.ink3 }}>{g.items.length} 项</span>}>
            {g.name}
          </WFSectionTitle>
          <div style={{ padding: '0 16px' }}>
            <WFCard style={{ padding: 0 }}>
              {g.items.map((it, i, arr) => {
                const c = it.tone === 'high' ? WF.alertHigh : it.tone === 'low' ? WF.alertLow : WF.ink;
                return (
                  <div key={it.k} style={{
                    padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                    background: it.uncertain ? '#FAF5EC' : 'transparent',
                    borderBottom: i < arr.length - 1 ? `1px solid ${WF.borderSoft}` : 'none',
                  }}>
                    {it.uncertain && (
                      <div style={{
                        width: 16, height: 16, borderRadius: 8,
                        background: '#D89A5C', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>!</div>
                    )}
                    <div style={{ flex: 1, fontSize: 13, color: WF.ink }}>{it.k}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: c, minWidth: 36, textAlign: 'right' }}>{it.v}</div>
                    <div style={{ fontSize: 10, color: WF.ink3, minWidth: 50 }}>{it.u}</div>
                    <div style={{ fontSize: 10, color: WF.ink3, minWidth: 50, textAlign: 'right' }}>{it.ref}</div>
                    {it.tone !== 'ok' && (
                      <span style={{ fontSize: 11, color: c, fontWeight: 700 }}>{it.tone === 'high' ? '↑' : '↓'}</span>
                    )}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={WF.ink3} strokeWidth="1.5">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>
                    </svg>
                  </div>
                );
              })}
              <div style={{
                padding: '11px 14px', textAlign: 'center',
                borderTop: `1px solid ${WF.borderSoft}`,
                fontSize: 12, color: WF.primary,
              }}>+ 添加指标</div>
            </WFCard>
          </div>
        </div>
      ))}
      {/* Bottom action */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '12px 16px 24px',
      }}>
        <WFButton full>完成编辑</WFButton>
      </div>
    </div>
  );
}

// ─── Step 5: conflict resolution ─────────────────────────────────
function UploadStep5Conflict() {
  return (
    <div style={{ background: WF.bg, height: '100%', fontFamily: WF.font, overflow: 'hidden', position: 'relative', paddingBottom: 90 }}>
      <WFNavBar title="处理重复识别" left="返回" />
      <div style={{ padding: '10px 16px 0', fontSize: 12, color: WF.ink2, lineHeight: 1.6 }}>
        以下指标在多页中被识别了多次，请确认保留哪个值
      </div>
      <WFSectionTitle>报告 ② · 综合生化</WFSectionTitle>
      <div style={{ padding: '0 16px' }}>
        <WFCard>
          <div style={{ fontSize: 14, fontWeight: 600, color: WF.ink, marginBottom: 12 }}>白细胞</div>
          {[
            { v: '3.2', src: '第 3 页', sel: true },
            { v: '3.5', src: '第 4 页', sel: false },
          ].map((opt, i) => (
            <div key={i} style={{
              padding: '12px 14px', marginBottom: 8,
              border: `1.5px solid ${opt.sel ? WF.primary : WF.borderSoft}`,
              background: opt.sel ? WF.primarySoft : '#fff',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                border: `1.5px solid ${opt.sel ? WF.primary : WF.border}`,
                background: opt.sel ? WF.primary : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {opt.sel && <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: WF.alertLow }}>{opt.v}</span>
                <span style={{ fontSize: 11, color: WF.alertLow, fontWeight: 700 }}>↓</span>
              </div>
              <span style={{ fontSize: 11, color: WF.ink3 }}>×10⁹/L</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: WF.ink3 }}>来自 {opt.src}</span>
            </div>
          ))}
          <div style={{
            padding: '10px 14px', textAlign: 'center',
            border: `1px dashed ${WF.border}`, borderRadius: 12,
            fontSize: 12, color: WF.ink3, marginTop: 4,
          }}>都不要 · 删除此项</div>
        </WFCard>
      </div>
      <div style={{ padding: '14px 16px 0', fontSize: 12, color: WF.ink3, lineHeight: 1.6 }}>
        提示：通常是 OCR 在分页边界识别错位。<br/>
        保留更可信的那个即可。
      </div>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: `1px solid ${WF.borderSoft}`,
        padding: '12px 16px 24px',
      }}>
        <WFButton full>应用选择</WFButton>
      </div>
    </div>
  );
}

Object.assign(window, {
  UploadStep1PickV2, UploadStep1Grouping,
  UploadStep2RecognizingV2, UploadStep3ConfirmV2,
  UploadStep4Detail, UploadStep5Conflict,
});
