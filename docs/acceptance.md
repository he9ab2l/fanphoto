# 验收记录

重构已全量验收通过，部署于 `https://test.heabl.xyz`（fanphoto 2.0.0）。

- 旧实现（apps/api、apps/web、fanphoto-dev.service）已停用并从版本历史移除，
  旧版归档不再保留；同服务器其他应用不受影响。
- 类型检查与构建通过；单元测试 22 项全绿（API / 媒体 / 几何 / 权限 / 迁移 /
  Caddy 清理），含静态 HTML 安全响应头回归测试。
- 桌面 / 手机浏览器：三模式、拖动循环、详情、信息折叠、焦点、减弱动态与
  触控、管理完整流程、分页均通过（Playwright，含重复交互与多视口组）。
- 70 张真实风景原片经同一服务端管线导入（横 26 / 竖 14 / 方 12 / 全景 18，
  含 GPS 46 张）：
  - 首批 32 张（2026-09-07 03:59 部署时导入）
  - 扩库 38 张（2026-09-07 13:20 增量导入，38 新建 / 32 去重 / 0 失败）
- 域名级验收（tools/verify-live.mjs，扩库后复验通过）：70 张 / 280 变体
  可访问（内容类型 / 私有缓存头 / 长度完整）；安全头 nosniff / DENY / CSP /
  noindex 全覆盖；登录（HttpOnly + Secure + SameSite=Lax）、CSRF、原片上传
  往返、公开撤回、临时数据清理全部通过。
- 真实图片审计（tools/audit-photos.ts）：70 原片哈希与元数据全部匹配，
  派生图全部剥离 EXIF / GPS，位置差异 0。
- 发布会：不可变 release + current 符号链接原子切换 + 发布前停写备份；
  扩库后备份 `data/backups/2026-09-07T05-27-57-741Z`。
- 照片来源与许可：docs/photo-sources.md（70 条）；SHA256 证据与 EXIF 类型
  清单：docs/photo-manifest.json。