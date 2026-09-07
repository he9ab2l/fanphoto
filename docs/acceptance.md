# 验收记录

重构已全量验收通过，部署于 `https://test.heabl.xyz`（fanphoto 2.0.0）。

- 旧实现（apps/api、apps/web、fanphoto-dev.service）已停用并归档至
  `ten:/home/ubuntu/fanphoto-archive/legacy.vBtzjG`，可恢复。
- 类型检查与构建通过；单元测试 22 项全绿（API / 媒体 / 几何 / 权限 / 迁移 /
  Caddy 清理），含静态 HTML 安全响应头回归测试。
- 桌面 / 手机浏览器：三模式、拖动循环、详情、信息折叠、焦点、减弱动态与
  触控、管理完整流程、分页均通过（Playwright，含重复交互与多视口组）。
- 32 张真实风景原片经同一服务端管线导入：32 新建、0 失败。
- 域名级验收（tools/verify-live.mjs，2026-09-07 03:59Z 通过）：
  - 128 个图片变体可访问（内容类型 / 私有缓存头 / 长度完整）
  - 安全头：静态 HTML、媒体、下载响应均带 nosniff / DENY / CSP / noindex
  - 登录会话（HttpOnly + Secure + SameSite=Lax）、CSRF 强制
  - 原片上传往返、公开撤回、临时数据清理
- 真实图片审计（tools/audit-photos.ts）：32 原片哈希与元数据全部匹配，
  派生图全部剥离 EXIF / GPS，位置差异 0。
- 发布：不可变 release + current 符号链接原子切换 + 发布前停写备份，
  最新备份 `data/backups/2026-09-07T03-59-32-790Z`。