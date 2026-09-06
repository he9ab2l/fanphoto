# Fanphoto 重写进度

工作分支 `refactor/photo-wall`，重写前基线 `bb9ba04`，尚未推送。

用户要求：全套前后端重写、保留原功能、极简少字、液态玻璃及动态交互；持续借鉴 ChronoFrame/Photoview/Lychee 的功能与工程经验，在 `ten` 部署开发版并测试。

## 已完成并验证

- 新 Hono API：会话认证/CSRF/同源/持久限速、图片校验、幂等上传及回滚、查询/搜索/标签/游标分页、相册 CRUD、编辑/批量操作、回收站/恢复/永久删除、站点/隐私、媒体权限、下载和导出。
- Node SQLite + 独立文件存储，迁移、初始化与备份脚本。实况视频会保留媒体偏移并清除 metadata/udta 等隐私元数据。
- 新 React UI：玻璃导航、响应式作品网格、照片查看器/缩放/EXIF/影调、无限照片墙/拖拽/穹顶/聚光、相册、地图、关于、登录及管理后台、上传队列。
- 图片浏览器端处理：JPEG/PNG/WebP/AVIF/HEIC/TIFF，EXIF 白名单、4 档 WebP、ThumbHash、主色和直方图、实况视频配对，可选水印。
- 第一次完整 TypeScript/build 通过，12 项后端测试通过。浏览器测试刚编写，尚未跑过，不能视为验收完成。
- 本地 `artifacts/seed-media` 已生成 70 张演示照片的编码产物；不虚构拍摄时间/相机/GPS。
- 已移除旧 React 照片墙、旧 CSS、静态清单及旧锁文件；源码同步回本地，删除已暂存，其余新文件/修改尚未提交。

## 正在进行 / 后续

1. 将演示产物同步到 ten，运行 setup/seed/release，建立独立 systemd 服务。
2. 跑 `tests/browser/workflow.spec.ts`，修复真实浏览器发现的问题，生成桌面/手机截图。
3. 配置独立开发 HTTPS，完成实际 URL 冒烟测试、备份恢复检查。
4. 补 PWA 离线壳、参考功能优化、Cloudflare 适配及文档；审查边界条件、安全、无障碍和性能。
5. 最终验收、同步全部源码与验证记录。项目未完成，不可提前宣称交付。

## 环境

- ten: `/home/ubuntu/fanphoto-dev/workspace`（源码）；目标 `.env`/`data`/`releases` 均放在上级独立目录，不同步凭据。
- 服务器 Node 24.19.0，pnpm 自动匹配 9.15.9。浏览器 `/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`。
- Caddy 443 已承载其他项目；当前全局 `auto_https off`，使用 Cloudflare Origin wildcard 证书。现有域名和路由不可覆盖。
- `photos-dev.heabl.xyz` 无 DNS；`fanphoto.82.156.50.234.sslip.io` 的真实 DNS 指向 ten。尚未配置其证书或路由。
- 本地 Termux apply_patch 失败：`filesystem sandbox cannot be enforced on this executor`。可用方式：SSH 到独立工作区，`codex --codex-run-as-apply-patch` 传补丁，再 rsync 源码回来。
- rsync 排除 `.git`、node_modules、根 data/artifacts、.env、dist；不要全局排除所有名为 data 的源码目录，不使用无范围 --delete。
- 当前会话的图片查看工具不支持图像输入；仍可截图、浏览器 DOM/布局/交互验证，不能假称已用视觉模型看过截图。
- 目标面板残留暂停的 `claear`，create_goal 无法替换；继续按明确的项目指令工作，不错误标记旧目标完成，不再设置预算。
