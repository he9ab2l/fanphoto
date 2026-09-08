# FanPhoto

自托管照片墙与摄影工作室。React 展示端 / 管理端，Node 服务端原片处理，独立 SQLite
数据库与 `/api/v1` 契约；fanphoto 2.0 为全新架构，无旧版兼容层、不迁移旧数据。

测试站：<https://test.heabl.xyz> · 工作室：<https://test.heabl.xyz/studio>

## 核心功能

- 平铺：保持真实比例的照片墙，全景跨列，向下自动加载。
- 环绕：拖动、滚轮或聚焦墙后使用方向键无限探索；静止时停止渲染循环。
- 照片详情：桌面左图右信息、手机三态底部面板；`I` 收起 / 展开信息，方向键切换，`Esc` 关闭，折叠不重载图片。
- 玻璃悬浮工具：比例 / 相册 / 标签 / 精选 / 搜索 / 排序，明亮 / 深色 / 跟随系统，三档密度。
- 工作室：登录、原图导入队列、编辑、批量公开 / 私密 / 精选 / 分组、回收站、相册与站点设置。
- 原文件保存在私有档案，公开图像不嵌入 EXIF；界面只显示从原片提取的真实信息。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite 7 · TypeScript（strict）· Base UI · MingCute · Motion · TanStack Query |
| 后端 | Node 24 · Hono · node:sqlite（WAL）· sharp · exifr · heic-convert |
| 契约 | Zod（unique API source of truth，`packages/contracts`） |
| 工具链 | pnpm 9 workspace · esbuild · node:test（`--import tsx`）· Prettier |

全站玻璃为自研 Glass Engine（`apps/client/src/glass/`），见
[docs/glass-engine-architecture.md](docs/glass-engine-architecture.md)。

## 系统要求

- Node 24 LTS、pnpm 9。
- sharp 需要平台原生二进制：本地 Termux（android-arm64）仅能通过类型检查与前端构建；
  API / 媒体集成测试需在 linux x86_64（如 ten 测试服务器）执行。

## 项目结构

```text
apps/client/         React + Vite；gallery / studio / ui / glass / vendor
apps/server/         Node + Hono；core（配置/SQLite/存储/安全）+ modules（auth/gallery/media/settings）
packages/contracts/  Zod 请求契约与 TypeScript 响应类型
scripts/             setup（建 .env）/ import（原片导入）/ backup / build-server / compress-client
deploy/              systemd、原子发布、Caddy 配置替换、旧站归档
tests/               API、媒体、几何、查看器、HTTP 缓存、部署配置、限额单测
tools/               风景图下载、原片核验、域名验收、许可 NOTICE / 来源再生
docs/                架构、API、玻璃引擎、运维、验收、照片来源与清单
```

## 本地开发

```bash
pnpm install
pnpm setup                        # 新建 .env 与 0600 管理员凭据，拒绝覆盖
pnpm dev                          # Web :5173，API :8787
pnpm photos:import --directory test-photo/commons-landscapes
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

管理员密码在初始化生成的 `admin-credentials.txt`（仅本机，不入 Git、不写日志）。
`data/`、`.env`、原片 `test-photo/`、测试产物与密码文件全部忽略。

## 环境变量

见 [.env.example](.env.example)，完整配置说明在
[docs/operations.md](docs/operations.md)。核心项：

| 变量 | 说明 |
| --- | --- |
| `APP_ORIGIN` | 唯一站点 origin，影响 Cookie 与同源校验 |
| `ADMIN_PASSWORD_HASH` | scrypt 口令哈希（`pnpm setup` 生成） |
| `SESSION_SECRET` | 会话签名盐，至少 32 字符随机值 |
| `FANPHOTO_DATA_DIR` | SQLite / media / backups 目录 |
| `HOST` / `PORT` | 默认 `127.0.0.1:8787`，仅本机反代可达 |
| `NODE_ENV` / `TRUST_LOCAL_PROXY` | 生产模式 / 可信反代开关 |

## 数据库初始化

数据库 schema 由 `apps/server/migrations/001_initial.sql` 创建；启动时自动应用缺失迁移，
无需手动初始化。媒体文件与派生图存放于 `FANPHOTO_DATA_DIR`，与代码分离。

## 构建与部署

```bash
pnpm build                        # typecheck + 客户端构建 + 服务端 esbuild 打包 + Brotli/gzip
bash deploy/release.sh            # 在服务器 workspace：install→build→test→停写备份→原子切换→健康检查
```

生产部署为不可变 release + `current` 符号链接原子切换，systemd `fanphoto.service` 托管，
Caddy 反向代理并强制 HTTPS。详见 [docs/operations.md](docs/operations.md)。

## 测试照片

`node tools/download-landscapes.mjs` 下载 Wikimedia Commons 开放许可风景原片，保留原始字节
与真实 EXIF，记录作者、许可、来源、尺寸、SHA256。当前清单 70 张（横 26 / 竖 14 / 方 12 /
全景 18）。自动化合成素材与真实图库分离。

## 文档

- [架构与扩展设计](docs/ARCHITECTURE.md)
- [API 契约](docs/API.md)
- [玻璃引擎](docs/glass-engine-architecture.md)
- [开发、部署与恢复](docs/operations.md)
- [验收记录](docs/acceptance.md)
- [照片来源](docs/photo-sources.md)

## License

本项目未选择开源许可证（私有项目）；测试照片按各自作者许可署名（CC BY / CC BY-SA / CC0），
见 [docs/photo-sources.md](docs/photo-sources.md)。