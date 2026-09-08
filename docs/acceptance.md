# 验收记录

## 2026-09-09：生产级重构与发布准备（refactor/production-ready）

- 分支：`refactor/production-ready`（基于 main，全部改动在此分支）。
- 已做：环绕模式与平铺视觉密度对齐（同一 gap 体系 + 纯比例缩放 + 密度回归测试）；玻璃
  scrim/toast 统一到 glass token；zod 3.25 → 4.5；清理 REFACTOR_LOG 与一次性 demo/截图工具；
  README / docs/API.md / docs/ARCHITECTURE.md / .env.example 对齐实际代码。
- 验证见 `RELEASE_NOTES.md` 与主线提交历史。

## 2026-09-09：液态玻璃六缺陷修复（release.cBYkTK）

- 修复 SVG 色散丢蓝通道、WebGL 边缘因子/rim 反转、透镜场内部接缝、光系统无限 rAF、
  高光 setState 风暴、WebGL 探测误加载；折射预算提升至 1024×900/280k px。
- 已合并 main 并切换 `current`；44 项回归 + verify-live 域名验收通过。

## 2026-09-08：Glass Engine 前端重构

- 测试站：`https://test.heabl.xyz`；本轮不可变发布：`release.Om8mnP`（current 已切换）。
- 分支：`feat/glass-engine`（当年未合并 main，后已合并）。
- 需求依据：`FanPhoto 项目前端重构.md`（已下载至本机 `~/FanPhoto 项目前端重构.md`），按提示词先输出《FanPhoto Glass Engine Architecture》（docs/glass-engine-architecture.md）后实施。
- 服务器构建与 **44 项回归全部通过**（API/媒体/权限/迁移/缓存/压缩/图库/查看器几何 + 更新的透镜字段测试：确定性、中心轻微折射、边缘增强、面积预算）。
- `tools/verify-live.mjs` 域名级验收通过：health/安全头/70 张/280 变体可访问/会话与 CSRF/原片上传往返/可见性撤回/临时数据清理。
- 实施要点：
  - `apps/client/src/glass/` 新增统一引擎：`GlassSurface`（唯一 React 入口，material/shape/tint/interactive/refractive/specular/webgl）、`GlassMaterial`（ultraThin→ultraThick 五档 × opacity/blur/saturation/brightness/tint/shadow/rim/refraction）、`GlassEnvironment`（thumbHashToAverageRGBA→OKLCH 克制着色，亮/暗/夜景/高饱和自适应，document 级 `--glass-ambient`）、`GlassLight`（pointer/viewport/scroll → `--glass-light-x/y/intensity`，rAF 合帧）、`GlassMotion`（motion/react 弹簧：hover 吸附/pointer 变形/press 压缩/release 弹性，stiffness 320/damping 24）、`displacement/{sdf,lens-field,cache}`（SDF rounded box 高度场，中心 0.35 + 边缘 1.15 折射，IOR≈1.3–1.5 观感）、`renderers/SVGGlassRenderer`（feImage+feDisplacementMap+feGaussianBlur+feColorMatrix+lighting composite+边缘 RGB 色散 R+1/G0/B−1）、`renderers/WebGLGlassRenderer`（SDF 透镜/法线/折射/色差/Fresnel/specular/blur，DPR≤1.5，render-on-change，contextlost 降级）。
  - PhotoDialog：桌面详情面板改为悬浮玻璃（material=thick，照片环境色 tint，WebGL hero 透镜用真实 DOM 图片按布局几何重建面板下方背景，不整页截图）；移动抽屉为 token 玻璃并带照片 tint；nav/corner/浮层均为 thin+interactive。
  - 全站单玻璃样式层 `styles/glass.css`；删除 `materials.css`、`ui/glass-map.ts`、`vendor/GlassSurface.tsx` 与 base.css 内重复玻璃 CSS；圆角收敛为 small/medium/large/capsule 连续系统。
  - 性能：motion 与 WebGL renderer 拆为懒加载 chunk（`manualChunks`），入口 index chunk 约 492KB→270KB（gzip 约 162KB→92KB），react-vendor/motion 独立缓存；玻璃面仍限 60k px 透镜预算。
- 未做浏览器视觉截图验收（本轮用户指示不做截图验证；上一轮约定“不在 ten 跑软件栅格化浏览器”，本轮用户指示改在 ten 测试但明确不需要截图）。

## 2026-09-08：详情、两种照片墙与加载优化

- 测试站：`https://test.heabl.xyz`；本轮验收时不可变发布：`release.xG3VoR`（后续发布为 `release.QLYqBJ`）。
- 分支：`feat/photo-detail-viewer`，对照 main 修复，未合并或改写 main。
- 需求依据（`~/问题清单.txt`、项目根 `FanPhoto 照片详情页 UI 改动.md`）已全部实现，两份需求文档应要求于 2026-09-08 清理删除。
- 服务器类型检查、生产构建及 **44 项回归全部通过**，涵盖 API/媒体/权限/迁移/缓存/压缩/图库/查看器几何。
- 线上 Chromium 152 检查通过：七档宽度、四种比例的代表样例、稳定折叠、元数据滚动保留、分享/下载、Esc、平铺/环绕、手机三态、固定操作区、背景禁触、真实触摸拖拽及关闭。额外验证了信息面板打开时的全局关闭。
- 主脚本从约 705 KB 降至约 492 KB；首屏 CSS 从约 38 KB 降至约 18 KB。线上主脚本 Brotli 响应 **151413 字节**，哈希资源 `immutable`，`Vary: Accept-Encoding` 正确。
- JSON gzip 已在线上生效且仍为 `no-store`；媒体访问先校验可见性再处理 ETag，错误媒体响应不缓存。
- 主图优先于背景整墙和邻图；代表照片手机 2× 预览使用约 30 KB 的 md，而非一律约 96 KB 的 lg。
- 真实排序 390px 默认密度：首屏面积极差 7.71→4.42；分页后的孤立竖图 606px→234px，整体面积极差 21.8→9.35。顺序、比例、70 张完整性保留；孤立窄图仅在无法健康拼行时采用既有的有界居中例外。
- 玻璃使用静态毛玻璃与小面积、缓存 PNG 位移图的 SVG RG 折射；不是 Apple 原生材质。减少动态/透明度、高对比度和不支持增强的环境保留可用回退。
- 备份 `2026-09-08T00-23-05-198Z` 已核对：70 照片、350 资源、70 媒体目录。按既定策略仅保留这份最新完整备份；上一份冗余备份已删除。
- 开发机浏览器、预览服务和临时 ADB 已停止；约 927 MB 的临时浏览器环境移入本机回收站，可恢复。没有在 ten 启动浏览器。

浏览器布局/交互检查原本的截图与机器报告（`artifacts/viewer/`）已于 2026-09-08 清理归档，
证据要点见上文；不宣称完成了 Safari、Firefox、iOS 真机的人工视觉验收。

## 2026-09-07：历史验收

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
