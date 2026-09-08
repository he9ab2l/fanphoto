# FanPhoto — 项目上下文（下次开发先读这里）

相册站（user 的长期项目，会继续开发）。**fanphoto 2.0 = 全新架构，无旧版兼容层，不迁旧数据。**

## 现状（2026-09-09）

- 已上线：`https://test.heabl.xyz`（Caddy v2 → ten:127.0.0.1:8787，systemd `fanphoto.service`）
- 图库：70 张 Wikimedia Commons 真实风景原片（横 26 / 竖 14 / 方 12 / 全景 18，GPS 46 张）
- 当前发布：`release.Om8mnP`（2026-09-09 00:46）；线上仍是修复前的 Glass Engine，`ef09eb3` 修复尚未发布
- 当前开发分支：`feat/glass-engine`（已推送，未合并 main；最新 ef09eb3 = 液态玻璃六处缺陷修复 + 预算提升）
- 管理端：`/studio`，密码在 ten 服务器 `/home/ubuntu/fanphoto-next/admin-credentials.txt`（600 权限，勿外泄）

## 代码与拓扑

```
~/fanphoto（本机 Termux = 开发环境，git 仓库 github.com/he9ab2l/fanphoto，当前 main，功能分支合并后删除）
├─ apps/client    React 19 + Vite + TS：gallery(平铺 / 环绕) / studio(管理) / ui(token)
├─ apps/server    Node 24 + Hono：core(配置/SQLite/存储/安全) + modules(认证/媒体/图库/相册)
├─ packages/contracts   Zod 请求契约（唯一 API 事实来源，docs/api.md）
├─ scripts         dev/import/setup/build/backup
├─ deploy          release.sh(不可变发布) / caddy-config.mjs / fanphoto.service
├─ tests           node:test 单元（API/媒体/几何/部署）
└─ tools           download-landscapes / audit-photos / verify-live / capture-ui 等
ten:/home/ubuntu/fanphoto-next/  服务器部署（非 git，rsync 同步 workspace）
   ├─ workspace/   最新源码（与本地保持一致）
   ├─ releases/    release.*（current → 最新，不可变）
   ├─ data/        活数据：library.sqlite + media/<UUID>/（原片+派生）+ backups（发布时自动生成）
```

数据与代码分离：发布切换不影响 data。**远程命令入口 `ssh ten`。**

## 常用命令

```bash
# 本地开发（本机只能 typecheck/build，测不了 sharp 相关）
pnpm typecheck && pnpm build
# 服务器验证与测试（sharp 有 x86_64 二进制；本地 Termux 无 android-arm64 sharp）
ssh ten 'cd /home/ubuntu/fanphoto-next/workspace && pnpm test'          # 44 项必要回归
# 部署（自带 install→build→test→停写备份→原子切换→健康检查）
ssh ten 'cd /home/ubuntu/fanphoto-next/workspace && bash deploy/release.sh'
# 导入图片 / 验收 / 审计 / 备份
FANPHOTO_ENV_FILE=/home/ubuntu/fanphoto-next/.env pnpm photos:import   # 在 ten workspace 跑
node tools/verify-live.mjs   # 域名级验收（在 ten workspace 跑，断言 70 张！加图需同步改）
FANPHOTO_ENV_FILE=... pnpm exec tsx tools/audit-photos.ts              # 哈希/元数据审计
svc: systemctl {start|stop|restart|status} fanphoto.service
```

## 关键约束与坑

- **本机 Termux 跑不了 sharp 测试**（android-arm64 无二进制）→ API/媒体测试必须在 ten 执行；本机只做 typecheck/build。
- **verify-live.mjs 与 acceptance 断言数量**：当前 70 张 / 280 变体，加图必须同步更新，否则发布后验收报 70≠N。
- **Wikimedia 下载**：upload.wikimedia.org 会 429 限流；Termux curl 的 `--retry` 会吞掉失败退出码（429 时 exit 0 且不写文件）→ 下载脚本已去掉 --retry 并内置指数退避；批量下载走 ten（不同 IP）更快。
- **禁止在 ten 跑软件栅格化浏览器**：4 核 VPS 曾被 SwiftShader 打满。必要浏览器检查只连接开发机上已启动的单实例浏览器（`FANPHOTO_CDP_ENDPOINT=... pnpm test:ui`），不自动在服务器启动浏览器。
- **备份策略**：release.sh 发布前自动停写备份到 data/backups/；过渡备份为垃圾需清理，**只保留最新一份**（2026-09-07 起约定，删除前可仅凭目录名判断新旧）。
- **照片证据**：docs/photo-manifest.json（70 份 SHA256/来源/许可）+ docs/photo-sources.md 署名；网页按 CC BY/CC0 署名来源。
- **旧版资源**：旧实现已在 git 历史移除（commit 4c2ed7e），归档不可恢复；不要做兼容层。

## 需求记录（长期约定：开发过程中每确认一条需求/决策就及时追加于此，改即覆写维护）

| 日期       | 需求 / 决策                                                                                                | 状态                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 2026-09-07 | 照片墙重写：Adaptive Justified Gallery（整段动态规划、矩形墙硬约束、窄图下限收敛、参数集中配置、分页稳定） | ✅ 已实现                               |
| 2026-09-08 | 按 `~/问题清单.txt` 与 `FanPhoto 照片详情页 UI 改动.md` 修复详情/排版/玻璃/加载（原文已实现后按约定删除）  | ✅ 已实现、验证并部署                   |
| 2026-09-08 | 只保留「平铺」「环绕」两种模式                                                                             | ✅ 已实现、验证并部署                   |
| 2026-09-08 | 复用 Base UI/MingCute/Motion 与设计、玻璃、无障碍、性能 skills；玻璃分层、可降级                           | ✅ 已实现、验证并部署                   |
| 2026-09-08 | 网站加载速度优先：首屏按需加载、主图优先、静态 Brotli/gzip、API 压缩，权限边界不变                         | ✅ 已实现、验证并部署                   |
| 2026-09-08 | Glass Engine 玻璃引擎重构（材料/环境/光照/弹簧/折射渲染器，详见 `docs/glass-engine-architecture.md`）      | ✅ 已实现、验证并部署（release.Om8mnP） |
| 2026-09-09 | 液态玻璃六处缺陷修复（SVG 色散丢蓝通道、WebGL 边缘因子/rim 反转、透镜场内部接缝、光系统无限 rAF、高光 setState 风暴、WebGL 探测误加载）；折射预算提升至 1024×900/280k px；文档对齐实现 | ✅ 已实现、测试通过（44/44，未发布） |
| 2026-09-09 | UI 组件层重构暂缓；后续需要新组件时优先从 `~/ui-libraries/components` 组件库选型，不手写                   | 📌 约定                                   |

## 用户偏好

- **需求及时记录（永久规则）**：每确认一条需求/决策立即追加到上方「需求记录」表并提交；以后每次开发默认遵守。
- 简体中文汇报、结论先行；严格模式（无兼容层、改即覆写、最小改动）。
- 高风险破坏性操作（删数据/备份/归档）执行前**不需要确认**，自主判断执行，但完成后必须汇报。
- **注意服务器占用**：ten 是共享 4 核 VPS，避免长时间高 CPU/高内存任务（批量解码、软件浏览器、超长构建等），必要任务限流或错峰。
- 可能授权全权委托但要求最终汇报。
