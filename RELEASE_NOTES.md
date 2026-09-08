# RELEASE_NOTES — FanPhoto 生产级重构与发布准备

分支：`refactor/production-ready`（基于 main `6035c14`，全部改动在此分支，未改动 main）。

## 1. 项目状态

FanPhoto 代码层已达到正式发布准备状态：构建、类型检查、Prettier、非 sharp 单测、启动与
API 冒烟验证通过，依赖无已知安全漏洞，文档与 .env.example 齐备。

尚有两项**环境性**限制（非代码缺陷），见 §6「已知问题」：

- 本地 Termux（arm64）缺 sharp 二进制，3 个媒体相关测试需在 ten（x86_64）运行时执行；
- 本分支尚未部署上线（当前 live 仍是 `release.cBYkTK`），发布走 `deploy/release.sh`。

## 2. 核心改动

### Gallery / 环绕模式（视觉密度对齐）

- `SURROUND_OPTIONS` 与平铺 gap 体系统一：常规 10px、密集 6px（原环绕 14/8px），
  面积因子 `0.78 → 1.0`（竖图纯比例缩放，不再额外压缩）。
- 效果：环绕竖图占列宽由约 72% 提升到 78%+，平均 tile 面积达平铺的 90%+（桌面）。
- 新增回归测试 `surround density matches the flat wall`：同一 gap 体系、竖图占列宽 ≥70%、
  列内间距严格等于 gap、桌面面积比 ≥70%（列式布局对全景图的列宽上限是固有约束，已注释说明）。

### UI 与设计语言

- 玻璃 scrim/toast 的背景 blur 从硬编码值（6px/20px/3px）统一到 glass token
  `--glass-scrim-blur` / `--glass-blur` / `--glass-line`，全部 backdrop-filter 收敛到
  `glass.css` 一处事实来源。移除 base.css 里重复的 `.detail-backdrop` 定义（viewer.css 拥有它）。
- 全站浅色/深色/系统主题、移动端与桌面端、主页面与管理端此前已完成 Glass Engine 统一，
  本次仅修正上述偏差点；降级路径（reduced-motion / 低核数 / 非 Chromium）保持不变。

### 后端与依赖

- `zod` 3.25 → 4.5（工作区 4 处，全部无 API 破坏；`pnpm typecheck` 与 27 项非 sharp 测试通过）。
- 后端未做机械拆分：`app.ts` 的 HTTP 壳职责内聚（安全头/缓存/静态/媒体），模块层
  （auth/gallery/media/settings）边界清晰，行为已有测试覆盖；拆分属无收益 churn。

### 配置

- 新增 `.env.example`：完整列出 `APP_ORIGIN`、`ADMIN_PASSWORD_HASH`、`SESSION_SECRET`、
  `FANPHOTO_DATA_DIR`、`FANPHOTO_ROOT`、`FANPHOTO_ENV_FILE`、`HOST`/`PORT`、`NODE_ENV`、
  `TRUST_LOCAL_PROXY`，并说明初始化与生成方式。

## 3. 清理内容

- 删除 `REFACTOR_LOG.md`（临时重构日志，六缺陷修复已固化进 `docs/glass-engine-architecture.md`
  与提交历史）。
- 删除一次性 / demo / 快照工具 6 个：`audit-ui.mjs`、`capture-ui.mjs`、`cleanup-test-data.mjs`、
  `enrich-demo-locations.ts`、`retire-demo-photo.ts`、`verify-heic.ts`（均为一次性取证 / 演示数据 /
  HEIC 验证，现无引用、已失效）。
- 保留仍被引用或有再生价值的工具：`download-landscapes.mjs`、`audit-photos.ts`、
  `verify-browser.mjs`、`verify-live.mjs`、`license-notices.mjs`、`write-photo-sources.mjs`。
- 未发现残留 `console.log` / `debugger` / `TODO` / `FIXME` / `any` / mock / debug 路由或后门；
  服务端仅保留错误日志、启动日志与孤儿媒体清理日志，脚本 / 工具中的 `console` 属正常 CLI 输出。

## 4. 文档

| 文档                                       | 状态                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `README.md`                                | 重写：简介 / 功能 / 技术栈 / 系统要求 / 结构 / 本地开发 / 环境变量 / 数据库 / 构建部署 / 测试照片 / License |
| `docs/API.md`                              | 重写：补齐 admin albums / settings / modules / imports / export / source 等全部接口、上传格式、错误码表     |
| `docs/{architecture.md → ARCHITECTURE.md}` | 更名，内容与实现一致（此前已对齐）                                                                          |
| `docs/acceptance.md`                       | 追加本轮 refactor 与六缺陷修复（release.cBYkTK）条目，修正过时声明                                          |
| `.env.example`                             | 新增                                                                                                        |
| `CLAUDE.md`                                | 同步 tools 清单与文档名（`docs/API.md`）                                                                    |

## 5. 验证结果

| 检查                                     | 结果                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                         | ✅ 通过（server + client，strict）                                                                                                                  |
| `pnpm build`                             | ✅ 通过（client Vite 9.0s + server esbuild + Brotli/gzip 26 文件）                                                                                  |
| Prettier `--check`                       | ✅ 通过（`pnpm format` 已幂等）                                                                                                                     |
| `node --test`（非 sharp）                | ✅ 27/27 通过                                                                                                                                       |
| `node --test`（sharp：api/limits/media） | ⚠️ 本地 arm64 无法运行，需 ten x86_64（见 §6）                                                                                                      |
| 启动 + API 冒烟                          | ✅ 本地启动 `server.mjs` `:8799`：`/api/v1/health` `{ok:true}`、`/api/v1/site` 正常、`/` 返回构建产物、CSP/nosniff/DENY/noindex/X-Request-Id 头齐全 |
| `pnpm audit`                             | ✅ 无已知漏洞                                                                                                                                       |
| `pnpm outdated`                          | ⚠️ 仅 dev 依赖：`@types/node` 24→26、`typescript` 5.9→7.0、`esbuild` 0.25→0.28                                                                      |
| Git 历史敏感信息扫描                     | ✅ 无硬编码凭证 / 私钥 / 内网地址；`admin-credentials.txt` 从未入 Git                                                                               |
| ten 服务器状态                           | ✅ load 0.08、磁盘 51%、`fanphoto.service` active、70 张 / 标签正常                                                                                 |

## 6. 已知问题

1. **sharp 依赖测试**：`tests/{api,limits,media}.test.ts` 依赖 sharp 原生二进制；Termux
   arm64 无该二进制，需在 ten workspace（x86_64）运行 `pnpm test`。此前重构在 ten 已验证
   全量通过，本分支仅有文档 / 文件结构 / 非媒体改动，不影响这套测试。
2. **未部署**：本分支尚未发布。上线前需将工作区 rsync 到十，`pnpm install --frozen-lockfile`
   - `pnpm test` + `bash deploy/release.sh` 走既有的不可变发布流程。
3. **dev 依赖可升级**：`typescript` 7.0（原生编译器，属 breaking，暂不升）、`@types/node`
   26（需 Node 26，项目锁定 Node 24，保持 24 匹配）、`esbuild` 0.28（次要）。均为 dev-only，
   无 CVE，按“不追新版本破坏稳定”原则暂保留。
4. **真实浏览器视觉验收**：本机无浏览器环境，环绕密度改动有纯几何测试 + 数值证据，但未有
   实测截图对比；建议下次 `pnpm test:ui`（连接开发机浏览器）或 ten 域名级 `verify-live` 时补一轮。
