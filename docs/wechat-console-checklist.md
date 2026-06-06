# WeChat Console Checklist

Updated: 2026-05-29

本文档用于记录当前小程序账号、微信公众平台配置、开发者工具配置，以及没有正式域名时的开发边界。

## 1. Current Mini Program Account

当前项目使用的小程序 AppID：

```text
wx382d538fd178a873
```

本地开发者工具配置位置：

```text
project.config.json
```

确认项：

- 微信公众平台左上角应显示“小程序”，不是“公众号”。
- `设置与开发 -> 基本设置` 中的 AppID 应为 `wx382d538fd178a873`。
- 微信开发者工具右上角“详情”中的 AppID 应为 `wx382d538fd178a873`。
- 不要把 AppSecret 写入小程序端代码或提交到仓库。

## 2. Member Permissions

如果微信开发者工具不能上传代码，优先检查：

- 当前扫码登录开发者工具的微信号是否是该小程序的管理员或开发者。
- 微信公众平台 `管理 -> 成员管理` 中是否已添加该微信号。
- 需要上传代码时，成员角色至少应具备开发者权限。
- 需要扫码体验时，微信号应加入体验成员。

## 3. Domain Strategy

当前没有正式域名是可以接受的。开发阶段可以继续做：

- UI 和交互调试。
- mock 数据闭环。
- fixture OCR 业务闭环。
- 本地后端联调。
- 微信开发者工具预览和真机基础体验。

正式发布前必须补齐：

- HTTPS API 域名。
- request 合法域名。
- uploadFile 合法域名。
- downloadFile 合法域名，如后续需要下载导出文件或查看原图。
- socket 合法域名，如后续使用 websocket。
- 域名备案、证书和微信后台校验。

开发者工具里可以在“详情/本地设置”中开启“不校验合法域名、TLS 版本以及 HTTPS 证书”用于本地调试。该能力只适合开发阶段，正式版无效。

## 4. Current Backend Status

当前后端已经支持：

- 微信登录后端接口边界。
- 上传签名和上传完成元数据接口。
- OCR task 创建、查询、取消、重试。
- fixture OCR 结构化草稿。
- 确认保存、查重、覆盖/跳过。
- 报告、健康数据、趋势、复查计划等下游业务链路。

当前还没有接入：

- 生产对象存储。
- 生产 OCR provider。
- 生产 API 域名。
- 生产数据库。

当前开发阶段允许采用过渡方案：

- 上传图片先保存到项目根目录的 `local-object-storage/` 专用目录。
- `local-object-storage/` 已加入 git 忽略，只保留 `.gitkeep`，避免真实检查报告图片进入仓库。
- OCR provider 先使用 GPT 视觉能力做结构化识别，后续可以替换成专业 OCR API。
- OCR provider 必须通过后端适配层接入，小程序端不直接调用 GPT 或任何 OCR 服务。
- `OPENAI_API_KEY` 只能放在后端环境变量中，不能写入小程序代码、文档示例真实值或提交历史。

因此目前可完整跑通的是：

```text
realtestcase fixture -> 确认识别结果 -> 保存报告 -> 健康数据/报告详情/趋势/查重
```

尚不能完整跑通的是：

```text
真实拍照 -> 图片真实上传 -> OCR 识别 -> 结构化草稿 -> 确认保存
```

下一步真实链路的目标是：

```text
真实拍照 -> 本地对象存储目录 -> GPT 视觉 OCR provider -> 结构化草稿 -> 用户确认 -> 保存健康数据
```

## 5. Privacy And Permission Items

后续启用真实拍照、相册、上传、OCR 时，需要在微信公众平台完善用户隐私保护指引，至少覆盖：

- 用户上传的检查报告图片。
- OCR 识别后的报告信息。
- 健康指标、复查计划、档案关系。
- 微信登录所需的 openid/unionid。
- 第三方 OCR 或对象存储服务，如使用。

小程序端也需要保持：

- 上传前给出清晰用途说明。
- 识别结果保存前必须由用户确认。
- 医疗免责声明保持可见。
- 用户可删除报告和维护档案资料。

## 6. Recommended Next Development Steps

在没有域名前，建议继续做这些工作：

1. 完成小程序账号基础信息、类目和成员配置。
2. 保持本地/fixture 闭环稳定。
3. 增加 develop/trial/release 的 API base URL 配置，但 release 域名暂留为空并在发布前强校验。
4. 接入本地对象存储 provider，把真实上传图片保存到 `local-object-storage/`。
5. 接入 GPT 视觉 OCR provider，优先用结构化输出约束返回格式，并用 `realtestcase/` 做回归对比。
6. 等域名确定后，再配置测试后端和生产后端公网 HTTPS 地址。

## 7. Release Blockers

以下事项没完成前，不应发布正式版：

- 小程序信息填写完整。
- 类目和资质确认。
- ICP 备案或符合部署区域要求。
- HTTPS API 域名配置到微信后台。
- 生产对象存储和生产 OCR provider 可用。
- 生产数据库和备份策略可用。
- AppSecret 已重置并只存在于后端环境变量。
- release 构建确认不会连接 mock、fixture、localhost 或测试后端。
