# FanPhoto — 项目上下文（下次开发先读这里）

相册站（user 的长期项目，会继续开发）。**fanphoto 2.0 = 全新架构，无旧版兼容层，不迁旧数据。**

## 现状（2026-09-08）
- 已上线：`https://test.heabl.xyz`（Caddod v2 → ten:127.0.0.1:8787，systemd `fanphoto.service`）
- 图库：70 张 Wikimedia Commons 真实风景原片（横 26 / 竖 14 / 方 12 / 全景 18，GPS 46 张）
- 当前发布：`release.xG3VoR`；仅平铺/环绕。详情、玻璃与加载优化已部署，44 项回归和线上必要浏览器检查通过，详见 `docs/acceptance.md`。
- 管理端：`/studio`，密码在 ten 服务器 `/home/ubuntu/fanphoto-next/admin-credentials.txt`（600 权限，勿外泄）

## 代码与拓扑
```
~/fanphoto（本机 Termux = 开发环境，git 仓库 github.com/he9ab2l/fanphoto，当前 feat/photo-detail-viewer）
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
node tools/verify-live.mjs   # 域名级验收（断言 70 张！加图需同步改）
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

## 照片墙布局（纯函数在 `apps/client/src/gallery/geometry.ts`）
- 平铺改为整段动态规划：对称惩罚过大/过小的视觉面积，兼顾行高、短边和相邻行变化；保持原始顺序及真实比例。
- 参数集中在 `DEFAULT_JUSTIFY_OPTIONS`，三档密度分别设置手机目标行高；`JustifyOverrides` 支持嵌套部分覆盖，Masonry `options` 透传。
- 矩形墙约束保留；病态超长竖图、以及与所有相邻图都无法满足阅读下限的孤立窄图使用有界居中例外，不放大成巨幅。普通合法行全部铺满。
- `appendMasonry` 分页只重排最后两行，避免追加照片使已浏览区域整体跳动。
- 环绕是单水平曲率的无限照片空间；竖图按面积收敛尺寸，单次大滚动立即补足可见窗口，闲置/隐藏/详情打开时停止帧循环。
- 几何改动跑 `node --import tsx --test tests/geometry.test.ts`，包含真实 manifest、七档宽度、面积分布、比例、矩形与分页稳定性检查。

## 需求记录（长期约定：开发过程中每确认一条需求/决策就及时追加于此，改即覆写维护）
| 日期 | 需求 / 决策 | 状态 |
| --- | --- | --- |
| 2026-09-07 | 照片墙重写为 Adaptive Justified Gallery V2.1（提示词 10 条：previousHeight 独立、extreme 真 special row、soft/hard 双带宽带、5 层分层评分不堆权重、轻量 next-row preview、末行 A 策略、emitRow 浮点修正、保持原始顺序、架构不变、先设计后改码） | ✅ 已实现 |
| 2026-09-07 | **矩形墙（硬需求）**：不论什么比例屏幕，所有照片铺满后整体是长方形，不能因照片少留下空缺 | ✅ 已实现（planTail 尾部整体规划，最后一行也铺满） |
| 2026-09-07 | 窄图不被压成小条：行内极差对全景/竖图混合要收敛（此前 6.7×、最窄 99px） | ✅ 已实现（tileDispersion 5/3.5 + soft/strict 下限提升，最窄 117px） |
| 2026-09-07 | 参考 miromannino/Justified-Gallery 学习后重写优化 | ✅ 已实现（k* 锚定行填充 + maxRowHeightFactor） |
| 2026-09-07 | 布局参数不硬编码，集中配置、方便调试 | ✅ 已实现（DEFAULT_JUSTIFY_OPTIONS + Partial 覆盖 + Masonry options prop） |
| 2026-09-07 | 部署 ten 供用户查看 | ✅ 已部署 + 验收 |
| 2026-09-07 | 垃圾备份清理（只留最新）、删提示词、提交 GitHub、合并 main、删分支 | ✅ 已完成 |
| 2026-09-07 | 完整收尾流程（重检/主动修复/清理/副作用/确认/汇报） | ✅ 已执行 |
| 2026-09-07 | 需求须及时记录，且以后每次开发都遵循 | ✅ 本表为承载，见用户偏好 |
| 2026-09-08 | 严格按 `~/问题清单.txt` 与 `FanPhoto 照片详情页 UI 改动.md` 修复详情、照片大小失衡、排版、玻璃、折叠闪屏和加载慢；两份原文不改，不用其他提示词覆盖 | ✅ 已实现、验证并部署 |
| 2026-09-08 | 只保留「平铺」「环绕」；环绕是原圆柱的无限滑动照片空间，移除球面代码与文案 | ✅ 已实现、验证并部署 |
| 2026-09-08 | 复用 Base UI/MingCute/Motion 和设计、玻璃、无障碍、性能 skills；图标语义对应，液态折射和毛玻璃分层、可降级 | ✅ 已实现、验证并部署 |
| 2026-09-08 | 基于当前分支对照 main，完成修改、自测、回归修复、更新和收尾；自主判断，不等确认，不擅改 main、不影响照片数据或其他服务 | ✅ 已实现、验证并部署 |
| 2026-09-08 | 前后端一起优化，网站加载速度优先；首屏按需加载、主图优先、静态 Brotli/gzip、API 压缩与轻量数据库查询，权限边界不变 | ✅ 已实现、验证并部署  |
| 2026-09-08 | 以写代码和交付为主，只做必要的类型/构建、关键回归与浏览器检查，不扩展耗时测试环境 | 本轮执行约束 |

## 用户偏好
- **需求及时记录（永久规则）**：每确认一条需求/决策立即追加到上方「需求记录」表并提交；以后每次开发默认遵守。
- 简体中文汇报、结论先行；严格模式（无兼容层、改即覆写、最小改动）；高风险破坏性操作（删数据/备份/归档）需先确认；可能授权全权委托但要求最终汇报。
