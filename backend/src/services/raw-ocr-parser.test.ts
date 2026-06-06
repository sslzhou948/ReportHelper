import assert from 'node:assert/strict';
import { draftFromRawOcr } from './raw-ocr-parser.js';

const twoColumnBloodRoutineText = `
天津市东丽区新立街社区卫生服务中心血液细胞检验报告单
姓名：张艳华 样本类型：
性别：女 科室：内科 样本编号：2
年龄：57 岁 检验时间：2025/08/25 08:32
检验项目 结 果 参考范围 单 位 检验项目 结 果 参考范围 单 位
1 ★白细胞数目(WBC) 4.30 3.50-9.50 10^9/L 18 ★红细胞数目(RBC) 3.75 ↓ 3.80-5.10 10^12/L
2 中性粒细胞百分比(Neu%) 80.4 ↑ 40.0-75.0 % 19 ★血红蛋白浓度(HGB) 121 115-150 g/L
3 淋巴细胞百分比(Lym%) 12.9 ↓ 20.0-50.0 % 20 ★红细胞压积(HCT) 37.5 35.0-45.0 %
4 单核细胞百分比(Mon%) 4.5 3.0-10.0 % 21 平均红细胞体积(MCV) 99.8 82.0-100.0 fL
5 嗜酸性粒细胞百分比(Eos%) 2.1 0.4-8.0 % 22 平均红细胞血红蛋白含量(MCH) 32.1 27.0-34.0 pg
6 嗜碱性粒细胞百分比(Bas%) 0.1 0.0-1.0 % 23 平均红细胞血红蛋白浓度(MCHC) 322 316-354 g/L
7 中性粒细胞数目(Neu#) 3.46 1.80-6.30 10^9/L 24 红细胞分布宽度变异系数(RD) 13.2 11.0-16.0 %
8 淋巴细胞数目(Lym#) 0.56 ↓ 1.10-3.20 10^9/L 25 红细胞分布宽度标准差(RDW-SD) 48.2 35.0-56.0 fL
9 单核细胞数目(Mon#) 0.19 0.10-0.60 10^9/L 26 ★血小板数目(PLT) 123 ↓ 125-350 10^9/L
10 嗜酸性粒细胞数目(Eos#) 0.09 0.02-0.52 10^9/L 27 平均血小板体积(MPV) 9.2 6.5-12.0 fL
11 嗜碱性粒细胞数目(Bas#) 0.00 0.00-0.06 10^9/L 28 血小板分布宽度(PDW) 10.7 9.0-17.0 fL
12 *异常淋巴细胞数目(ALY#) 0.00 0.00-0.20 10^9/L 29 血小板压积(PCT) 0.113 0.108-0.282 %
13 *异常淋巴细胞百分比(ALY%) 0.0 0.0-2.0 %
14 *巨大未成熟细胞数目(LIC#) 0.00 0.00-0.20 10^9/L 30 大血小板比率(P-LCR) 21.3 11.0-45.0 %
15 *巨大未成熟细胞百分比(LIC%) 0.0 0.0-2.5 %
16 *有核红细胞数目(NRBC#) 0.000 0.000-9999.999 10^9/L
17 *有核红细胞百分比(NRBC%) 0.00 0.00-9999.99 %
31 大血小板数目(P-LCC) 26 ↓ 30-90 10^9/L
送检者：毕波 检验者：王宁 审核者：韩丽丽
报告时间：2025/08/25 08:36
`;

const draft = draftFromRawOcr(twoColumnBloodRoutineText, {
  groupId: 'blood_routine_photo',
  photos: [{ photoId: 'photo_1' }]
});

assert.equal(draft.basicInfo.hospital, '天津市东丽区新立街社区卫生服务中心');
assert.equal(draft.basicInfo.type, '血常规');
assert.equal(draft.basicInfo.typeKey, 'blood_routine');
assert.equal(draft.basicInfo.reportDate, '2025-08-25');
assert.equal(draft.basicInfo.patientName, '张艳华');
assert.equal(draft.basicInfo.department, '内科');
assert.equal(draft.basicInfo.orderNo, '2');
assert.equal(draft.metrics.length, 31);

const byKey = new Map(draft.metrics.map((metric: any) => [metric.metricKey, metric]));
const parsedKeys = Array.from(byKey.keys()).join(', ');
assert.equal(new Set(draft.metrics.map((metric: any) => metric.metricKey)).size, 31, parsedKeys);
assert.equal(draft.metrics.every((metric: any) => metric.category === 'blood_routine'), true, parsedKeys);
assert.equal(draft.metrics.every((metric: any) => metric.mappingStatus === 'suggested'), true, parsedKeys);
assert.equal(byKey.get('wbc')?.valueNumeric, 4.3);
assert.equal(byKey.get('wbc')?.tone, 'ok');
assert.equal(byKey.get('rbc')?.valueNumeric, 3.75);
assert.equal(byKey.get('rbc')?.tone, 'low');
assert.equal(byKey.get('neu_percent')?.tone, 'high');
assert.equal(byKey.get('lym_percent')?.tone, 'low');
assert.equal(byKey.get('hgb')?.tone, 'ok');
assert.equal(byKey.get('plt')?.tone, 'low', parsedKeys);
assert.equal(byKey.get('pdw')?.tone, 'ok', parsedKeys);
assert.equal(byKey.get('pct')?.tone, 'ok', parsedKeys);
assert.equal(byKey.get('p_lcr')?.tone, 'ok', parsedKeys);
assert.equal(byKey.get('p_lcc')?.tone, 'low', parsedKeys);
assert.equal(byKey.get('nrbc_abs')?.tone, 'ok', parsedKeys);
assert.equal(byKey.get('nrbc_percent')?.tone, 'ok', parsedKeys);

const upperBoundText = `
天津市某医院检验报告单
检验时间：2025/08/25
检验项目 结果 参考范围 单位
1 总胆固醇（氧化酶法） 4.49 ≤5.60 mmol/L
2 甘油三酯（氧化酶法） 2.11 ≤2.30 mmol/L
3 高密度脂蛋白胆固醇 2.9 ≥1.15 mmol/L
4 低密度脂蛋白胆固醇 5.55 0.00-4.11 mmol/L
`;

const lipidDraft = draftFromRawOcr(upperBoundText, {
  groupId: 'lipid_photo',
  photos: [{ photoId: 'photo_2' }]
});
assert.equal(lipidDraft.basicInfo.typeKey, 'blood_lipid');
assert.equal(lipidDraft.metrics[0].tone, 'ok');
assert.equal(lipidDraft.metrics[1].tone, 'ok');
assert.equal(lipidDraft.metrics[2].tone, 'ok');
assert.equal(lipidDraft.metrics[3].tone, 'high');
assert.equal(lipidDraft.metrics.every((metric: any) => metric.category === 'blood_lipid'), true);
assert.deepEqual(lipidDraft.metrics.map((metric: any) => metric.metricKey), [
  'total_cholesterol',
  'triglyceride',
  'hdl_cholesterol',
  'ldl_cholesterol'
]);

const metadataVariantText = `
就诊医院：天津市第一中心医院 检验日期：2025-08-25 08:32
报告类型：血脂四项
送检科室：内分泌科 样本号：ABC123
检验项目 结果 参考范围 单位
1 总胆固醇（氧化酶法） 4.49 ≤5.60 mmol/L
2 甘油三酯（氧化酶法） 2.11 ≤2.30 mmol/L
3 高密度脂蛋白胆固醇 2.9 ≥1.15 mmol/L
4 低密度脂蛋白胆固醇 5.55 0.00-4.11 mmol/L
`;

const metadataVariantDraft = draftFromRawOcr(metadataVariantText, {
  groupId: 'metadata_variant_photo',
  photos: [{ photoId: 'photo_4' }]
});
assert.equal(metadataVariantDraft.basicInfo.hospital, '天津市第一中心医院');
assert.equal(metadataVariantDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(metadataVariantDraft.basicInfo.type, '血脂四项');
assert.equal(metadataVariantDraft.basicInfo.typeKey, 'blood_lipid');
assert.equal(metadataVariantDraft.basicInfo.department, '内分泌科');
assert.equal(metadataVariantDraft.basicInfo.orderNo, 'ABC123');
assert.deepEqual(metadataVariantDraft.metrics.map((metric: any) => metric.tone), ['ok', 'ok', 'ok', 'high']);

const looseBasicInfoLabelText = `
检查医院 天津市东丽区新立街社区卫生服务中心 检查名称 血常规 检查日期 2025/08/25
白细胞数目(WBC) 4.30 3.50-9.50 10^9/L
`;
const looseBasicInfoLabelDraft = draftFromRawOcr(looseBasicInfoLabelText, {
  groupId: 'loose_basic_info_label_photo',
  photos: [{ photoId: 'photo_14' }]
});
assert.equal(looseBasicInfoLabelDraft.status, 'needs_review');
assert.equal(looseBasicInfoLabelDraft.basicInfo.hospital, '天津市东丽区新立街社区卫生服务中心');
assert.equal(looseBasicInfoLabelDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(looseBasicInfoLabelDraft.basicInfo.type, '血常规');
assert.equal(looseBasicInfoLabelDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(looseBasicInfoLabelDraft.metrics.length, 1);
assert.equal(looseBasicInfoLabelDraft.metrics[0].metricKey, 'wbc');

const datePriorityText = `
姓名：李明 出生日期：1968-01-02
报告名称：血常规
检测时间：2025/08/25 08:32
1 白细胞数目(WBC) 4.30 3.50-9.50 10^9/L
2 红细胞数目(RBC) 3.75 3.80-5.10 10^12/L
3 血小板数目(PLT) 123 125-350 10^9/L
`;

const datePriorityDraft = draftFromRawOcr(datePriorityText, {
  groupId: 'date_priority_photo',
  photos: [{ photoId: 'photo_5' }]
});
assert.equal(datePriorityDraft.basicInfo.patientName, '李明');
assert.equal(datePriorityDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(datePriorityDraft.basicInfo.typeKey, 'blood_routine');

const sameLineDatePriorityText = [
  '\u59d3\u540d\uff1a\u674e\u660e \u51fa\u751f\u65e5\u671f\uff1a1968-01-02 \u68c0\u9a8c\u65f6\u95f4\uff1a2025/08/25 08:32',
  '\u62a5\u544a\u540d\u79f0\uff1a\u8840\u5e38\u89c4',
  '\u767d\u7ec6\u80de\u6570\u76ee(WBC) 4.30 3.50-9.50 10^9/L'
].join('\n');
const sameLineDatePriorityDraft = draftFromRawOcr(sameLineDatePriorityText, {
  groupId: 'same_line_date_priority_photo',
  photos: [{ photoId: 'photo_13' }]
});
assert.equal(sameLineDatePriorityDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(sameLineDatePriorityDraft.basicInfo.patientName, '李明');
assert.equal(sameLineDatePriorityDraft.basicInfo.typeKey, 'blood_routine');

const metricRowsOnlyText = `
1 白细胞数目(WBC) 4.30 3.50-9.50 10^9/L
2 红细胞数目(RBC) 3.75 3.80-5.10 10^12/L
3 血小板数目(PLT) 123 125-350 10^9/L
`;
const metricRowsOnlyDraft = draftFromRawOcr(metricRowsOnlyText, {
  groupId: 'rows_only_photo',
  photos: [{ photoId: 'photo_3' }]
});
assert.equal(metricRowsOnlyDraft.status, 'needs_review');
assert.equal(metricRowsOnlyDraft.basicInfo.reportLike, true);
assert.equal(metricRowsOnlyDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(metricRowsOnlyDraft.metrics.length, 3);

const headlessBloodRoutineScreenshotText = `
项目 结果 参考范围 单位
白细胞数目(WBC) 2.47 ↓ 3.50-9.50 ×10^9/L
淋巴细胞百分比(Lym%) 30.0 20.0-40.0 %
单核细胞百分比(Mon%) 11.3 ↑ 3.0-8.0 %
中性粒细胞绝对值(Neu#) 1.37 ↓ 2.00-7.50 ×10^9/L
血小板数目(PLT) 169 100-350 ×10^9/L
`;
const headlessBloodRoutineScreenshotDraft = draftFromRawOcr(headlessBloodRoutineScreenshotText, {
  groupId: 'headless_blood_routine_screenshot',
  photos: [{ photoId: 'photo_headless' }]
});
assert.equal(headlessBloodRoutineScreenshotDraft.status, 'needs_review');
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.reportLike, true);
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.hospital, '');
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.hospitalSource, 'unknown');
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.reportDate, '');
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.reportDateSource, 'unknown');
assert.equal(headlessBloodRoutineScreenshotDraft.basicInfo.typeKey, 'blood_routine');
assert.deepEqual(headlessBloodRoutineScreenshotDraft.metrics.map((metric: any) => metric.metricKey), ['wbc', 'lym_percent', 'mon_percent', 'neu_abs', 'plt']);
assert.deepEqual(headlessBloodRoutineScreenshotDraft.metrics.map((metric: any) => metric.tone), ['low', 'ok', 'high', 'low', 'ok']);

const unindexedMetricRowsOnlyText = `
天津市某医院检验报告单
报告名称：血常规
检测时间：2025/08/25 08:32
白细胞数目(WBC) 4.30 3.50-9.50 10^9/L
红细胞数目(RBC) 3.75 ↓ 3.80-5.10 10^12/L
血小板数目(PLT) 123 ↓ 125-350 10^9/L
`;
const unindexedMetricRowsOnlyDraft = draftFromRawOcr(unindexedMetricRowsOnlyText, {
  groupId: 'unindexed_rows_only_photo',
  photos: [{ photoId: 'photo_10' }]
});
assert.equal(unindexedMetricRowsOnlyDraft.status, 'needs_review');
assert.equal(unindexedMetricRowsOnlyDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(unindexedMetricRowsOnlyDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(unindexedMetricRowsOnlyDraft.metrics.length, 3);
assert.deepEqual(unindexedMetricRowsOnlyDraft.metrics.map((metric: any) => metric.metricKey), ['wbc', 'rbc', 'plt']);
assert.deepEqual(unindexedMetricRowsOnlyDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'low']);

const unindexedTwoColumnSameLineText = `
天津市某医院检验报告单
报告名称：血常规
检测时间：2025/08/25 08:32
白细胞数目(WBC) 4.30 3.50-9.50 10^9/L 红细胞数目(RBC) 3.75 ↓ 3.80-5.10 10^12/L
中性粒细胞百分比(Neu%) 80.4 ↑ 40.0-75.0 % 血红蛋白浓度(HGB) 121 115-150 g/L
`;
const unindexedTwoColumnSameLineDraft = draftFromRawOcr(unindexedTwoColumnSameLineText, {
  groupId: 'unindexed_two_column_same_line_photo',
  photos: [{ photoId: 'photo_15' }]
});
assert.equal(unindexedTwoColumnSameLineDraft.status, 'needs_review');
assert.equal(unindexedTwoColumnSameLineDraft.basicInfo.typeKey, 'blood_routine');
assert.deepEqual(unindexedTwoColumnSameLineDraft.metrics.map((metric: any) => metric.metricKey), ['wbc', 'rbc', 'neu_percent', 'hgb']);
assert.deepEqual(unindexedTwoColumnSameLineDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'high', 'ok']);

const abbreviationOnlyBloodRoutineText = `
测试医院血常规报告单
报告名称：血常规
检验时间：2025/08/25 08:32
24 RD 13.2 11.0-16.0 %
25 RDW-SD 48.2 35.0-56.0 fL
30 P-LCR 21.3 11.0-45.0 %
31 P-LCC 26 ↓ 30-90 10^9/L
`;
const abbreviationOnlyBloodRoutineDraft = draftFromRawOcr(abbreviationOnlyBloodRoutineText, {
  groupId: 'abbreviation_only_blood_routine_photo',
  photos: [{ photoId: 'photo_20' }]
});
assert.equal(abbreviationOnlyBloodRoutineDraft.status, 'needs_manual_input');
assert.deepEqual(abbreviationOnlyBloodRoutineDraft.metrics.map((metric: any) => metric.metricKey), ['rdw_cv', 'rdw_sd', 'p_lcr', 'p_lcc']);
assert.deepEqual(abbreviationOnlyBloodRoutineDraft.metrics.map((metric: any) => metric.tone), ['ok', 'ok', 'ok', 'low']);
assert.deepEqual(abbreviationOnlyBloodRoutineDraft.metrics.map((metric: any) => metric.category), ['blood_routine', 'blood_routine', 'blood_routine', 'blood_routine']);
assert.equal(abbreviationOnlyBloodRoutineDraft.warnings.some((warning: any) => warning.code === 'OCR_PARTIAL_INDEXED_TABLE'), true);

const stickyMarkerAndChineseRangeText = `
天津市某医院检验报告单
报告名称：血常规
检测时间：2025/08/25 08:32
白细胞数目(WBC) 4.30 3.50～9.50 10^9/L
中性粒细胞百分比(Neu%) 80.4H 40.0至75.0 %
淋巴细胞百分比(Lym%) 12.9L 20.0到50.0 %
`;
const stickyMarkerAndChineseRangeDraft = draftFromRawOcr(stickyMarkerAndChineseRangeText, {
  groupId: 'sticky_marker_chinese_range_photo',
  photos: [{ photoId: 'photo_11' }]
});
assert.equal(stickyMarkerAndChineseRangeDraft.status, 'needs_review');
assert.deepEqual(stickyMarkerAndChineseRangeDraft.metrics.map((metric: any) => metric.metricKey), ['wbc', 'neu_percent', 'lym_percent']);
assert.deepEqual(stickyMarkerAndChineseRangeDraft.metrics.map((metric: any) => metric.refRangeLow), [3.5, 40, 20]);
assert.deepEqual(stickyMarkerAndChineseRangeDraft.metrics.map((metric: any) => metric.refRangeHigh), [9.5, 75, 50]);
assert.deepEqual(stickyMarkerAndChineseRangeDraft.metrics.map((metric: any) => metric.tone), ['ok', 'high', 'low']);

const splitLineMetricRowsText = `
天津市某医院检验报告单
报告名称：血常规
检测时间：2025/08/25 08:32
白细胞数目(WBC)
4.30 3.50-9.50 10^9/L
红细胞数目(RBC)
3.75↓ 3.80-5.10 10^12/L
血小板数目(PLT)
123L 125-350 10^9/L
`;
const splitLineMetricRowsDraft = draftFromRawOcr(splitLineMetricRowsText, {
  groupId: 'split_line_rows_photo',
  photos: [{ photoId: 'photo_12' }]
});
assert.equal(splitLineMetricRowsDraft.status, 'needs_review');
assert.equal(splitLineMetricRowsDraft.basicInfo.typeKey, 'blood_routine');
assert.deepEqual(splitLineMetricRowsDraft.metrics.map((metric: any) => metric.metricKey), ['wbc', 'rbc', 'plt']);
assert.deepEqual(splitLineMetricRowsDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'low']);

const markdownLipidTableText = `
天津市某医院检验报告单
报告名称：血脂四项
检验日期：2025-08-25
| 检验项目 | 结果 | 参考范围 | 单位 |
| --- | --- | --- | --- |
| 总胆固醇(TC) | 4.49 | ≤5.60 | mmol/L |
| 甘油三酯(TG) | 2.11 | ≤2.30 | mmol/L |
| 高密度脂蛋白胆固醇(HDL-C) | 2.90 | ≥1.15 | mmol/L |
| 低密度脂蛋白胆固醇(LDL-C) | 5.55 | 0.00-4.11 | mmol/L |
`;
const markdownLipidDraft = draftFromRawOcr(markdownLipidTableText, {
  groupId: 'markdown_lipid_photo',
  photos: [{ photoId: 'photo_6' }]
});
assert.equal(markdownLipidDraft.status, 'needs_review');
assert.equal(markdownLipidDraft.basicInfo.typeKey, 'blood_lipid');
assert.equal(markdownLipidDraft.metrics.length, 4);
assert.deepEqual(markdownLipidDraft.metrics.map((metric: any) => metric.metricKey), [
  'total_cholesterol',
  'triglyceride',
  'hdl_cholesterol',
  'ldl_cholesterol'
]);
assert.deepEqual(markdownLipidDraft.metrics.map((metric: any) => metric.category), [
  'blood_lipid',
  'blood_lipid',
  'blood_lipid',
  'blood_lipid'
]);
assert.deepEqual(markdownLipidDraft.metrics.map((metric: any) => metric.tone), ['ok', 'ok', 'ok', 'high']);

const shiftedRefLipidTableText = `
东丽区新立街社区卫生服务中心检验报告单
报告名称：血脂四项
| 项目名称 | 检验项目 | 结果 | 单位 | 结果提示 | 参考范围 |
| --- | --- | --- | --- | --- | --- |
| ★TC | 总胆固醇（氧化酶法） | 9.49 | mmol/L | ↑ | ≤5.60 |
| ★TG | 甘油三酯（氧化酶法） | 2.11 | mmol/L | ≤2.30 |
| ★HDL-C | 高密度脂蛋白胆固醇 | 2.90 | mmol/L | ≥1.15 |
| ★LDL-C | 低密度脂蛋白胆固醇 | 5.55 | mmol/L | ↑ | 0.00-4.11 |
`;
const shiftedRefLipidDraft = draftFromRawOcr(shiftedRefLipidTableText, {
  groupId: 'shifted_ref_lipid_photo',
  photos: [{ photoId: 'photo_shifted_lipid' }]
});
const shiftedRefLipidByKey = new Map(shiftedRefLipidDraft.metrics.map((metric: any) => [metric.metricKey, metric]));
assert.equal(shiftedRefLipidByKey.get('triglyceride')?.refRangeHigh, 2.3);
assert.equal(shiftedRefLipidByKey.get('triglyceride')?.tone, 'ok');
assert.equal(shiftedRefLipidByKey.get('hdl_cholesterol')?.refRangeLow, 1.15);
assert.equal(shiftedRefLipidByKey.get('hdl_cholesterol')?.tone, 'ok');

const acthDelimitedTableText = `
天津市某医院检验报告单
报告名称：促肾上腺皮质激素检测
检验时间：2025/08/25 08:32
项目	结果	参考范围	单位
促肾上腺皮质激素(ACTH)	23.4	7.2-63.3	pg/mL
`;
const acthDelimitedDraft = draftFromRawOcr(acthDelimitedTableText, {
  groupId: 'acth_delimited_photo',
  photos: [{ photoId: 'photo_7' }]
});
assert.equal(acthDelimitedDraft.status, 'needs_review');
assert.equal(acthDelimitedDraft.basicInfo.typeKey, 'acth');
assert.equal(acthDelimitedDraft.metrics.length, 1);
assert.equal(acthDelimitedDraft.metrics[0].metricKey, 'acth');
assert.equal(acthDelimitedDraft.metrics[0].category, 'endocrine');
assert.equal(acthDelimitedDraft.metrics[0].mappingStatus, 'suggested');
assert.equal(acthDelimitedDraft.metrics[0].tone, 'ok');

const markdownBoldLabelActhText = `
# 北京协和医院检验报告单
**检验项目**: 血浆ACTH (8AM)
**审核日期**: 2025-12-22 09:10:11
| 项目 | 结果 | 参考范围 | 单位 |
|---|---|---|---|
| 促肾上腺皮质激素(ACTH) | 301.0 | 7.2-63.3 | pg/ml |
`;
const markdownBoldLabelActhDraft = draftFromRawOcr(markdownBoldLabelActhText, {
  groupId: 'markdown_bold_label_acth_photo',
  photos: [{ photoId: 'photo_16' }]
});
assert.equal(markdownBoldLabelActhDraft.basicInfo.type, '血浆ACTH (8AM)');
assert.equal(markdownBoldLabelActhDraft.basicInfo.typeKey, 'acth');
assert.equal(markdownBoldLabelActhDraft.basicInfo.hospital, '北京协和医院');
assert.equal(markdownBoldLabelActhDraft.basicInfo.reportDate, '2025-12-22');
assert.equal(markdownBoldLabelActhDraft.metrics[0].metricKey, 'acth');

const compactHeaderActhText = `
北京协和医院检验报告单单号：TST20251222001
检验项目：血浆ACTH (8AM)
审核日期：2025-12-22
项目
结果
参考范围
单位
促肾上腺皮质激素
301.0
7.2-63.3
pg/ml
`;
const compactHeaderActhDraft = draftFromRawOcr(compactHeaderActhText, {
  groupId: 'compact_header_acth_photo',
  photos: [{ photoId: 'photo_19' }]
});
assert.equal(compactHeaderActhDraft.basicInfo.hospital, '北京协和医院');
assert.equal(compactHeaderActhDraft.basicInfo.typeKey, 'acth');
assert.equal(compactHeaderActhDraft.metrics[0].metricKey, 'acth');

const wcodeThyroidTypoText = `
北京协和医院检验报告单
检验项目：甲功1
审核日期：2025-12-22 10:30:00
| 项目 | 结果 | 参考范围 | 单位 |
|---|---|---|---|
| 游离三碘甲状旁腺素 | 3.65 | 1.8-4.1 | pg/ml |
| 游离甲状腺素 | 1.04 | 0.81-1.89 | ng/dl |
| 促甲状腺激素 | 3.596 | 0.38-4.34 | μIU/mL |
`;
const wcodeThyroidTypoDraft = draftFromRawOcr(wcodeThyroidTypoText, {
  groupId: 'wcode_thyroid_typo_photo',
  photos: [{ photoId: 'photo_17' }]
});
assert.equal(wcodeThyroidTypoDraft.status, 'needs_review');
assert.equal(wcodeThyroidTypoDraft.basicInfo.typeKey, 'thyroid_function');
assert.deepEqual(wcodeThyroidTypoDraft.metrics.map((metric: any) => metric.metricKey), ['ft3', 'ft4', 'tsh']);
assert.deepEqual(wcodeThyroidTypoDraft.metrics.map((metric: any) => metric.category), [
  'thyroid_function',
  'thyroid_function',
  'thyroid_function'
]);
assert.deepEqual(wcodeThyroidTypoDraft.metrics.map((metric: any) => metric.tone), ['ok', 'ok', 'ok']);

const thyroidCodeColumnLabName = '\u534e\u5317\u533b\u5b66\u68c0\u9a8c\u5b9e\u9a8c\u5ba4';
const thyroidCodeColumnText = `
${thyroidCodeColumnLabName}\u68c0\u6d4b\u62a5\u544a\u5355
报告名称：甲状腺功能
| 序号 | 项目名称 | 项目简称 | 结果 | 单位 | 参考区间 | 方法学 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 血清三碘甲状原氨酸 | T3 | 1.091 | nmol/L | 0.85-2.68 | 化学发光法 |
| 2 | 甲状腺球蛋白抗体 | T4 | 58.477↓ | nmol/L | 60.72-170.00 | 化学发光法 |
| 3 | 甲状腺球蛋白抗体 | TSH | 3.523 | mIU/L | 0.30-4.30 | 化学发光法 |
`;
const thyroidCodeColumnDraft = draftFromRawOcr(thyroidCodeColumnText, {
  groupId: 'thyroid_code_column_photo',
  photos: [{ photoId: 'photo_thyroid_code' }]
});
assert.equal(thyroidCodeColumnDraft.basicInfo.hospital, thyroidCodeColumnLabName);
assert.equal(thyroidCodeColumnDraft.basicInfo.typeKey, 'thyroid_function');
assert.deepEqual(thyroidCodeColumnDraft.metrics.map((metric: any) => metric.metricKey), ['t3', 't4', 'tsh']);
assert.deepEqual(thyroidCodeColumnDraft.metrics.map((metric: any) => metric.metricName), ['血清三碘甲状原氨酸', '血清甲状腺素', '血清促甲状腺激素']);
assert.equal(thyroidCodeColumnDraft.metrics[1].originalMetricName, '甲状腺球蛋白抗体');
assert.deepEqual(thyroidCodeColumnDraft.metrics.map((metric: any) => metric.category), [
  'thyroid_function',
  'thyroid_function',
  'thyroid_function'
]);
assert.deepEqual(thyroidCodeColumnDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'ok']);

const whitespaceCodeTableText = `
${thyroidCodeColumnLabName}\u68c0\u6d4b\u62a5\u544a\u5355
项目名称    项目简称    结果    单位    参考区间
★血清三碘甲状腺原氨酸  T3    1.091    nmol/L    正常非孕人群：0.85-2.68
    ↓
    孕早期：1.14-2.82
    ↓
★血清促甲状腺激素    T4    58.477 ↓    nmol/L    60.72-170.00
    ↓
★血清促甲状腺激素    TSH    3.523    mIU/L    0.30-4.30
`;
const whitespaceCodeTableDraft = draftFromRawOcr(whitespaceCodeTableText, {
  groupId: 'whitespace_code_table_photo',
  photos: [{ photoId: 'photo_whitespace_code_table' }]
});
assert.equal(whitespaceCodeTableDraft.basicInfo.typeKey, 'thyroid_function');
assert.deepEqual(whitespaceCodeTableDraft.metrics.map((metric: any) => metric.metricKey), ['t3', 't4', 'tsh']);
assert.deepEqual(whitespaceCodeTableDraft.metrics.map((metric: any) => metric.metricName), ['血清三碘甲状原氨酸', '血清甲状腺素', '血清促甲状腺激素']);
assert.equal(whitespaceCodeTableDraft.metrics[1].originalMetricName, '\u2605 \u8840\u6e05\u4fc3\u7532\u72b6\u817a\u6fc0\u7d20');
assert.deepEqual(whitespaceCodeTableDraft.metrics[1].reportMarkers.map((marker: any) => marker.raw), ['\u2605']);
assert.deepEqual(whitespaceCodeTableDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'ok']);

const labeledBlockThyroidText = `
天津迪安医学检验实验室检验报告单
报告名称：甲状腺功能
### 项目名称
**血清三碘甲状腺原氨酸（T3）**
**项目简称**：T3
**结果**：1.091 nmol/L
**单位**：nmol/L
**参考区间**：
- 正常非孕人群：0.85-2.68
- 孕早期：1.14-2.82
---
### 项目名称
**血清甲状腺素**
**项目简称**：T4
**结果**：58.477 ↓ nmol/L
**单位**：nmol/L
**参考区间**：60.72-170.00
---
### 项目名称
**血清促甲状腺激素**
**项目简称**：TSH
**结果**：3.523 mIU/L
**单位**：mIU/L
**参考区间**：0.30-4.30
`;
const labeledBlockThyroidDraft = draftFromRawOcr(labeledBlockThyroidText, {
  groupId: 'labeled_block_thyroid_photo',
  photos: [{ photoId: 'photo_labeled_block_thyroid' }]
});
assert.equal(labeledBlockThyroidDraft.status, 'needs_review');
assert.equal(labeledBlockThyroidDraft.basicInfo.typeKey, 'thyroid_function');
assert.deepEqual(labeledBlockThyroidDraft.metrics.map((metric: any) => metric.metricKey), ['t3', 't4', 'tsh']);
assert.deepEqual(labeledBlockThyroidDraft.metrics.map((metric: any) => metric.metricName), ['血清三碘甲状原氨酸', '血清甲状腺素', '血清促甲状腺激素']);
assert.deepEqual(labeledBlockThyroidDraft.metrics.map((metric: any) => metric.tone), ['ok', 'low', 'ok']);

const genericLabIssuerText = labeledBlockThyroidText.replace(
  '天津迪安医学检验实验室检验报告单',
  '天津迪安医院\n检验实验室检验报告单'
);
const genericLabIssuerDraft = draftFromRawOcr(genericLabIssuerText, {
  groupId: 'generic_lab_issuer_photo',
  photos: [{ photoId: 'photo_generic_lab_issuer' }]
});
assert.equal(genericLabIssuerDraft.basicInfo.hospital, '天津迪安医院');
assert.equal(genericLabIssuerDraft.basicInfo.typeKey, 'thyroid_function');

const conflictingLabeledBlockText = `
天津迪安医学检验实验室检验报告单
报告名称：甲状腺功能
### 项目名称
**血清促甲状腺激素**
**项目简称**：TSH
**结果**：3.523 mIU/L
**单位**：mIU/L
**参考区间**：0.30-4.30
---
### 项目名称
**血清促甲状腺激素**
**项目简称**：TSH
**结果**：58.477 mIU/L
**单位**：mIU/L
**参考区间**：0.30-4.30
`;
const conflictingLabeledBlockDraft = draftFromRawOcr(conflictingLabeledBlockText, {
  groupId: 'conflicting_labeled_block_photo',
  photos: [{ photoId: 'photo_conflicting_labeled_block' }]
});
assert.equal(conflictingLabeledBlockDraft.status, 'needs_manual_input');
assert.equal(conflictingLabeledBlockDraft.metrics.length, 0);
assert.equal(conflictingLabeledBlockDraft.warnings.some((warning: any) => warning.code === 'OCR_RAW_TEXT_UNSTRUCTURED'), true);

const normalChineseBloodRoutineText = `
天津市东丽区新立街社区卫生服务中心血液细胞检验报告单
姓名：张艳华 样本类型：全血 性别：女 科室：内科 样本编号：2
年龄：57岁 检验时间：2025/08/25 08:32
检验项目 结果 参考范围 单位 检验项目 结果 参考范围 单位
1 ★白细胞数目(WBC) 4.30 3.50-9.50 10^9/L 18 ★红细胞数目(RBC) 3.75 ↓ 3.80-5.10 10^12/L
2 中性粒细胞百分比(Neu%) 80.4 ↑ 40.0-75.0 % 19 血红蛋白浓度(HGB) 121 115-150 g/L
3 淋巴细胞百分比(Lym%) 12.9 ↓ 20.0-50.0 % 26 ★血小板数目(PLT) 123 ↓ 125-350 10^9/L
31 大血小板数目(P-LCC) 26 ↓ 30-90 10^9/L
报告时间：2025/08/25 08:36
`;
const normalChineseBloodRoutineDraft = draftFromRawOcr(normalChineseBloodRoutineText, {
  groupId: 'normal_chinese_blood_routine_photo',
  photos: [{ photoId: 'photo_8' }]
});
assert.equal(normalChineseBloodRoutineDraft.status, 'needs_manual_input');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.hospital, '天津市东丽区新立街社区卫生服务中心');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.patientName, '张艳华');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.department, '内科');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.orderNo, '2');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.type, '血常规');
assert.equal(normalChineseBloodRoutineDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(normalChineseBloodRoutineDraft.metrics.length, 7);
assert.equal(normalChineseBloodRoutineDraft.warnings.some((warning: any) => warning.code === 'OCR_PARTIAL_INDEXED_TABLE'), true);
const normalBloodRoutineByKey = new Map(normalChineseBloodRoutineDraft.metrics.map((metric: any) => [metric.metricKey, metric]));
assert.deepEqual(Array.from(normalBloodRoutineByKey.keys()), [
  'wbc',
  'rbc',
  'neu_percent',
  'hgb',
  'lym_percent',
  'plt',
  'p_lcc'
]);
assert.equal(normalBloodRoutineByKey.get('wbc')?.tone, 'ok');
assert.equal(normalBloodRoutineByKey.get('rbc')?.tone, 'low');
assert.equal(normalBloodRoutineByKey.get('neu_percent')?.tone, 'high');
assert.equal(normalBloodRoutineByKey.get('lym_percent')?.tone, 'low');
assert.equal(normalBloodRoutineByKey.get('hgb')?.tone, 'ok');
assert.equal(normalBloodRoutineByKey.get('plt')?.tone, 'low');
assert.equal(normalBloodRoutineByKey.get('p_lcc')?.tone, 'low');
assert.equal(normalChineseBloodRoutineDraft.metrics.every((metric: any) => metric.category === 'blood_routine'), true);

const markdownDoubleColumnBloodRoutineText = `
天津市东丽区新立街社区卫生服务中心血液细胞检验报告单
姓名：脱敏 样本类型：全血 科室：内科 样本编号：2
检验时间：2025/08/25 08:32
| 检验项目 | 结果 | 参考范围 | 单位 | 检验项目 | 结果 | 参考范围 | 单位 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 ★白细胞数目(WBC) | 4.30 | 3.50-9.50 | 10^9/L | 18 ★红细胞数目(RBC) | 3.75 ↓ | 3.80-5.10 | 10^12/L |
| 2 中性粒细胞百分比(Neu%) | 80.4 ↑ | 40.0-75.0 | % | 19 ★血红蛋白浓度(HGB) | 121 | 115-150 | g/L |
| 3 淋巴细胞百分比(Lym%) | 12.9 ↓ | 20.0-50.0 | % | 20 ★红细胞压积(HCT) | 37.5 | 35.0-45.0 | % |
| 4 单核细胞百分比(Mon%) | 4.5 | 3.0-10.0 | % | 21 平均红细胞体积(MCV) | 99.8 | 82.0-100.0 | fL |
| 5 嗜酸性粒细胞百分比(Eos%) | 2.1 | 0.4-8.0 | % | 22 平均红细胞血红蛋白含量(MCH) | 32.1 | 27.0-34.0 | pg |
| 6 嗜碱性粒细胞百分比(Bas%) | 0.1 | 0.0-1.0 | % | 23 平均红细胞血红蛋白浓度(MCHC) | 322 | 316-354 | g/L |
| 7 中性粒细胞数目(Neu#) | 3.46 | 1.80-6.30 | 10^9/L | 24 红细胞分布宽度变异系数(RDW-CV) | 13.2 | 11.0-16.0 | % |
| 8 淋巴细胞数目(Lym#) | 0.56 ↓ | 1.10-3.20 | 10^9/L | 25 红细胞分布宽度标准差(RDW-SD) | 48.2 | 35.0-56.0 | fL |
| 9 单核细胞数目(Mon#) | 0.19 | 0.10-0.60 | 10^9/L | 26 ★血小板数目(PLT) | 123 ↓ | 125-350 | 10^9/L |
| 10 嗜酸性粒细胞数目(Eos#) | 0.09 | 0.02-0.52 | 10^9/L | 27 平均血小板体积(MPV) | 9.2 | 6.5-12.0 | fL |
| 11 嗜碱性粒细胞数目(Bas#) | 0.00 | 0.00-0.06 | 10^9/L | 28 血小板分布宽度(PDW) | 10.7 | 9.0-17.0 | fL |
| 12 *异常淋巴细胞数目(ALY#) | 0.00 | 0.00-0.20 | 10^9/L | 29 血小板压积(PCT) | 0.113 | 0.108-0.282 | % |
| 13 *异常淋巴细胞百分比(ALY%) | 0.0 | 0.0-2.0 | % | 30 大血小板比率(P-LCR) | 21.3 | 11.0-45.0 | % |
| 14 *巨大未成熟细胞数目(LIC#) | 0.00 | 0.00-0.20 | 10^9/L | 31 大血小板数目(P-LCC) | 26 ↓ | 30-90 | 10^9/L |
| 15 *巨大未成熟细胞百分比(LIC%) | 0.0 | 0.0-2.5 | % |
| 16 *有核红细胞数目(NRBC#) | 0.000 | 0.000-9999.999 | 10^9/L |
| 17 *有核红细胞百分比(NRBC%) | 0.00 | 0.00-9999.99 | % |
| 白细胞分类(WBC) | 0.00 | 0.00-0.05 | 10^9/L |
| 红细胞分类(RBC) | 3.50 | 3.50-9.50 | 10^9/L |
报告时间：2025/08/25 08:36
`;
const markdownDoubleColumnBloodRoutineDraft = draftFromRawOcr(markdownDoubleColumnBloodRoutineText, {
  groupId: 'markdown_double_column_blood_routine_photo',
  photos: [{ photoId: 'photo_8b' }]
});
const markdownDoubleColumnByKey = new Map(markdownDoubleColumnBloodRoutineDraft.metrics.map((metric: any) => [metric.metricKey, metric]));
const markdownDoubleColumnKeys = Array.from(markdownDoubleColumnByKey.keys());
assert.equal(markdownDoubleColumnBloodRoutineDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(markdownDoubleColumnBloodRoutineDraft.metrics.length, 31, markdownDoubleColumnKeys.join(', '));
assert.equal(new Set(markdownDoubleColumnBloodRoutineDraft.metrics.map((metric: any) => metric.metricKey)).size, 31, markdownDoubleColumnKeys.join(', '));
for (const key of ['wbc', 'rbc', 'hgb', 'hct', 'rdw_cv', 'rdw_sd', 'plt', 'p_lcr', 'p_lcc', 'nrbc_abs', 'nrbc_percent']) {
  assert.equal(markdownDoubleColumnByKey.has(key), true, `${key} missing from ${markdownDoubleColumnKeys.join(', ')}`);
}
assert.equal(markdownDoubleColumnByKey.get('rbc')?.unit, '10^12/L');
assert.equal(markdownDoubleColumnByKey.get('rbc')?.tone, 'low');
assert.equal(markdownDoubleColumnByKey.get('plt')?.tone, 'low');
assert.equal(markdownDoubleColumnByKey.get('p_lcc')?.tone, 'low');

const wcodeBloodRoutineFalseInflammationRowsText = `
天津市东丽区新立街社区卫生服务中心血液细胞检验报告单
姓名：
性别：
年龄：57
样本类型：
科室：内科
样本编号：2
检验时间：2025/08/25 08:32
| 检验项目 | 结果 | 参考范围 | 单位 | 检验项目 | 结果 | 参考范围 | 单位 |
|---|---|---|---|---|---|---|---|
| ★白细胞数 (WBC) | 4.30 | 3.50-9.50 | 10^9/L | 18 ★红细胞数 (RBC) | 3.75 | 3.80-5.10 | 10^12/L |
| 中性粒细胞百分比 (Neu%) | 80.4 | 40.0-75.0 | % | 19 ★血红蛋白浓度 (HGB) | 121 | 115-150 | g/L |
| 淋巴细胞百分比 (Lym%) | 12.9 | 20.0-50.0 | % | 20 ★红细胞压积 (HCT) | 37.5 | 35.0-45.0 | % |
| 单核细胞百分比 (Mon%) | 4.5 | 3.0-10.0 | % | 21 平均红细胞体积 (MCV) | 98.8 | 82.0-100.0 | fL |
| 嗜酸性粒细胞百分比 (Eos%) | 2.1 | 0.4-8.0 | % | 22 平均红细胞血红蛋白含量 (MCH) | 32.1 | 27.0-34.0 | pg |
| 嗜碱性粒细胞百分比 (Bas%) | 0.1 | 0.0-1.0 | % | 23 平均红细胞血红蛋白浓度 (MCHC) | 332 | 316-354 | g/L |
| 中性粒细胞计数 (Neu#) | 3.46 | 1.80-6.30 | 10^9/L | 24 红细胞分布宽度变异系数 (RDW-CV) | 13.2 | 11.0-16.0 | % |
| 淋巴细胞计数 (Lym#) | 1.80 | 1.10-3.20 | 10^9/L | 25 红细胞分布宽度标准差 (RDW-SD) | 48.2 | 37.0-54.0 | fL |
| 单核细胞计数 (Mon#) | 0.19 | 0.10-0.60 | 10^9/L | 26 ★血小板数目 (PLT) | 123 | 125-350 | 10^9/L |
| 嗜酸性粒细胞计数 (Eos#) | 0.09 | 0.02-0.52 | 10^9/L | 27 平均血小板体积 (MPV) | 10.7 | 9.0-13.0 | fL |
| 嗜碱性粒细胞计数 (Bas#) | 0.00 | 0.00-0.06 | 10^9/L | 28 血小板分布宽度 (PDW) | 10.7 | 9.0-17.0 | % |
| 超敏C反应蛋白 (hs-CRP) | 0.00 | 0.00-0.50 | mg/L | 29 血小板压积 (PCT) | 0.113 | 0.108-0.282 | % |
| 降钙素原 (PCT) | 0.00 | 0.00-0.50 | ng/mL | 30 大血小板比率 (P-LCR) | 21.3 | 11.0-45.0 | % |
| ★C反应蛋白 (CRP) | 0.00 | 0.00-10.00 | mg/L | 31 大血小板数目 (P-LCC) | 26 | 30-90 | 10^9/L |
报告时间：2025/08/25 08:36
`;
const wcodeBloodRoutineFalseInflammationDraft = draftFromRawOcr(wcodeBloodRoutineFalseInflammationRowsText, {
  groupId: 'wcode_blood_routine_false_inflammation_photo',
  photos: [{ photoId: 'photo_8d' }]
});
const wcodeBloodRoutineFalseInflammationKeys = wcodeBloodRoutineFalseInflammationDraft.metrics.map((metric: any) => metric.metricKey);
assert.equal(wcodeBloodRoutineFalseInflammationDraft.basicInfo.typeKey, 'blood_routine');
assert.equal(wcodeBloodRoutineFalseInflammationKeys.includes('hs_crp'), false, wcodeBloodRoutineFalseInflammationKeys.join(', '));
assert.equal(wcodeBloodRoutineFalseInflammationKeys.includes('crp'), false, wcodeBloodRoutineFalseInflammationKeys.join(', '));
assert.equal(wcodeBloodRoutineFalseInflammationKeys.includes('procalcitonin'), false, wcodeBloodRoutineFalseInflammationKeys.join(', '));
assert.equal(wcodeBloodRoutineFalseInflammationKeys.includes('pct'), true, wcodeBloodRoutineFalseInflammationKeys.join(', '));
assert.equal(wcodeBloodRoutineFalseInflammationDraft.warnings.some((warning: any) => warning.code === 'OCR_SUSPECT_METRICS_SUPPRESSED'), true);

const declaredBloodRoutineCrpText = wcodeBloodRoutineFalseInflammationRowsText.replace(
  '样本编号：2',
  '报告名称：血常规+CRP\n样本编号：2'
);
const declaredBloodRoutineCrpDraft = draftFromRawOcr(declaredBloodRoutineCrpText, {
  groupId: 'declared_blood_routine_crp_photo',
  photos: [{ photoId: 'photo_8e' }]
});
const declaredBloodRoutineCrpKeys = declaredBloodRoutineCrpDraft.metrics.map((metric: any) => metric.metricKey);
assert.equal(declaredBloodRoutineCrpKeys.includes('hs_crp'), true, declaredBloodRoutineCrpKeys.join(', '));
assert.equal(declaredBloodRoutineCrpKeys.includes('crp'), true, declaredBloodRoutineCrpKeys.join(', '));
assert.equal(declaredBloodRoutineCrpKeys.includes('procalcitonin'), true, declaredBloodRoutineCrpKeys.join(', '));
assert.equal(declaredBloodRoutineCrpKeys.includes('pct'), true, declaredBloodRoutineCrpKeys.join(', '));
assert.equal(declaredBloodRoutineCrpDraft.warnings.some((warning: any) => warning.code === 'OCR_SUSPECT_METRICS_SUPPRESSED'), false);

const inflammationPanelText = `
医院：测试医院 报告名称：炎症指标 检验时间：2025/08/25
| 检验项目 | 结果 | 参考范围 | 单位 |
| --- | --- | --- | --- |
| 超敏C反应蛋白(hs-CRP) | 0.00 | 0.00-0.50 | mg/L |
| 降钙素原(PCT) | 0.00 | 0.00-0.50 | ng/mL |
| C反应蛋白(CRP) | 0.00 | 0.00-10.00 | mg/L |
`;
const inflammationPanelDraft = draftFromRawOcr(inflammationPanelText, {
  groupId: 'inflammation_panel_photo',
  photos: [{ photoId: 'photo_8f' }]
});
assert.deepEqual(inflammationPanelDraft.metrics.map((metric: any) => metric.metricKey), ['hs_crp', 'procalcitonin', 'crp']);
assert.equal(inflammationPanelDraft.warnings.some((warning: any) => warning.code === 'OCR_SUSPECT_METRICS_SUPPRESSED'), false);

const pctAmbiguityText = `
医院：测试医院 报告名称：炎症指标 检验时间：2025/08/25
| 检验项目 | 结果 | 参考范围 | 单位 |
| --- | --- | --- | --- |
| 降钙素原(PCT) | 0.02 | 0.00-0.05 | ng/mL |
| 血小板压积(PCT) | 0.113 | 0.108-0.282 | % |
`;
const pctAmbiguityDraft = draftFromRawOcr(pctAmbiguityText, {
  groupId: 'pct_ambiguity_photo',
  photos: [{ photoId: 'photo_8c' }]
});
const pctAmbiguityByKey = new Map(pctAmbiguityDraft.metrics.map((metric: any) => [metric.metricKey, metric]));
assert.deepEqual(Array.from(pctAmbiguityByKey.keys()), ['procalcitonin', 'pct']);
assert.equal(pctAmbiguityByKey.get('procalcitonin')?.category, 'other');
assert.equal(pctAmbiguityByKey.get('pct')?.category, 'blood_routine');

const normalChineseLipidMarkdownText = `
医院：天津市第一中心医院 报告名称：血脂四项 检验时间：2025/08/25 08:32
| 检验项目 | 结果 | 参考范围 | 单位 |
| --- | --- | --- | --- |
| TC | 4.49 | ≤5.60 | mmol/L |
| TG | 2.11 | ≤2.30 | mmol/L |
| HDL-C | 2.90 | ≥1.15 | mmol/L |
| LDL-C | 5.55 | 0.00-4.11 | mmol/L |
`;
const normalChineseLipidDraft = draftFromRawOcr(normalChineseLipidMarkdownText, {
  groupId: 'normal_chinese_lipid_photo',
  photos: [{ photoId: 'photo_9' }]
});
assert.equal(normalChineseLipidDraft.status, 'needs_review');
assert.equal(normalChineseLipidDraft.basicInfo.hospital, '天津市第一中心医院');
assert.equal(normalChineseLipidDraft.basicInfo.reportDate, '2025-08-25');
assert.equal(normalChineseLipidDraft.basicInfo.type, '血脂四项');
assert.equal(normalChineseLipidDraft.basicInfo.typeKey, 'blood_lipid');
assert.deepEqual(normalChineseLipidDraft.metrics.map((metric: any) => metric.metricKey), [
  'total_cholesterol',
  'triglyceride',
  'hdl_cholesterol',
  'ldl_cholesterol'
]);
assert.deepEqual(normalChineseLipidDraft.metrics.map((metric: any) => metric.tone), ['ok', 'ok', 'ok', 'high']);

const wcodeBiochemLipidMarkdownText = `
如有疑问请随时告知。

# 北京协和医院检验报告单

**单号**: TST20251222003
**检验项目**: 尿酸、电解质、血脂
**姓名**: 测试四号
**申请科室**: 泌尿外科门诊
**申请医生**: 90003
**样本类型**: 血
**接收日期**: 2025-12-22 10:46:37
**申请日期**: 2025-12-22 08:39:08
**审核医生**: 测试医生
**审核日期**: 2025-12-22 13:34:30

| 项目 | 结果 | 参考范围 | 单位 |
|---|---|---|---|
| △丙氨酸氨基转移酶 | 27 | 7-40 | U/L |
| △总蛋白 | 71 | 60-85 | g/L |
| △白蛋白(BCG法) | 45 | 35-52 | g/L |
| △天门冬氨酸氨基转移酶 | 41 | ↑ 13-35 | U/L |
| △钾 | 4.0 | 3.5-5.5 | mmol/L |
| △钠 | 138 | 135-145 | mmol/L |
| △肌酐(酶法) | 43 ↓ | 45-84 | μmol/L |
| △尿酸 | 112 ↓ | 150-357 | μmol/L |
| △总胆固醇 | 5.81 ↑ | <5.2 边缘升高 | mmol/L |
| △甘油三酯 | 1.33 | 合适水平 <1.7 | mmol/L |
| △高密度脂蛋白胆固醇 | 2.27 | 降低 <1.0 | mmol/L |
| △低密度脂蛋白胆固醇 | 2.46 | <3.4 中高危 | mmol/L |

**备注**:
此报告仅作参考，以医院打印纸质报告为准。
`;
const wcodeBiochemLipidDraft = draftFromRawOcr(wcodeBiochemLipidMarkdownText, {
  groupId: 'wcode_biochem_lipid_photo',
  photos: [{ photoId: 'photo_15' }]
});
assert.equal(wcodeBiochemLipidDraft.status, 'needs_review');
assert.equal(wcodeBiochemLipidDraft.basicInfo.hospital, '北京协和医院');
assert.equal(wcodeBiochemLipidDraft.basicInfo.reportDate, '2025-12-22');
assert.equal(wcodeBiochemLipidDraft.basicInfo.type, '尿酸、电解质、血脂');
assert.equal(wcodeBiochemLipidDraft.basicInfo.typeKey, 'blood_lipid');
assert.equal(wcodeBiochemLipidDraft.metrics.length, 12);
const wcodeBiochemByKey = new Map(wcodeBiochemLipidDraft.metrics.map((metric: any) => [metric.metricKey, metric]));
assert.equal(wcodeBiochemByKey.has('申请日期_2025-12-22'), false);
assert.equal(wcodeBiochemByKey.get('ast')?.valueNumeric, 41);
assert.equal(wcodeBiochemByKey.get('ast')?.refRangeLow, 13);
assert.equal(wcodeBiochemByKey.get('ast')?.refRangeHigh, 35);
assert.equal(wcodeBiochemByKey.get('ast')?.tone, 'high');
assert.equal(wcodeBiochemByKey.get('creatinine')?.valueNumeric, 43);
assert.equal(wcodeBiochemByKey.get('creatinine')?.tone, 'low');
assert.equal(wcodeBiochemByKey.get('uric_acid')?.valueNumeric, 112);
assert.equal(wcodeBiochemByKey.get('uric_acid')?.tone, 'low');
assert.equal(wcodeBiochemByKey.get('total_cholesterol')?.valueNumeric, 5.81);
assert.equal(wcodeBiochemByKey.get('total_cholesterol')?.refRangeHigh, 5.2);
assert.equal(wcodeBiochemByKey.get('total_cholesterol')?.tone, 'high');
assert.equal(wcodeBiochemByKey.get('hdl_cholesterol')?.refRangeLow, 1);
assert.equal(wcodeBiochemByKey.get('hdl_cholesterol')?.tone, 'ok');
assert.equal(wcodeBiochemByKey.get('ldl_cholesterol')?.tone, 'ok');

const wcodeChestCtMarkdownText = `
返回

# 检查报告详情

## 北京协和医院
胸腹盆 CT 平扫

医院：北京协和医院

姓名：测试三号

单号：SYNCT20251222001

开单医师：测试医生

检查日期：2025-12-22
检查所见：

---

## 检查意见：

与本院 2025-09-22 前片对比：双肺多发、小结节，
大致同前；较大者位于右肺下叶背段，呈实性密度，大小约为 6 mm×5 mm，请随诊；双肺散在钙化灶，右肺门多发钙化灶，
大致同前；双侧胸膜略增厚，大致同前。

---

报告医师：测试医师

审核医师：审核医师

报告日期：2025-12-24

---

此报告仅作参考，以医院实际纸质报告为准
`;
const wcodeChestCtDraft = draftFromRawOcr(wcodeChestCtMarkdownText, {
  groupId: 'wcode_chest_ct_photo',
  photos: [{ photoId: 'photo_18' }]
});
assert.equal(wcodeChestCtDraft.status, 'needs_review');
assert.equal(wcodeChestCtDraft.basicInfo.modality, 'imaging');
assert.equal(wcodeChestCtDraft.basicInfo.analysisPolicy, 'view_only');
assert.equal(wcodeChestCtDraft.basicInfo.hospital, '北京协和医院');
assert.equal(wcodeChestCtDraft.basicInfo.type, '胸腹盆CT平扫');
assert.equal(wcodeChestCtDraft.basicInfo.typeKey, 'ct_plain');
assert.equal(wcodeChestCtDraft.basicInfo.examPart, '胸部/腹部/盆腔');
assert.equal(wcodeChestCtDraft.basicInfo.examMethod, 'CT平扫');
assert.equal(wcodeChestCtDraft.basicInfo.examDate, '2025-12-22');
assert.equal(wcodeChestCtDraft.basicInfo.reportDate, '2025-12-24');
assert.ok(wcodeChestCtDraft.findings.join('\n').includes('右肺下叶背段'));

console.log('Raw OCR parser tests passed');
