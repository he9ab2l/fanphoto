# FanPhoto

一个自托管照片站点：公开照片墙 + 管理工作室。浏览器端展示照片墙与管理后台，Node 服务负责
原片处理与派生图生成，数据存于本地 SQLite，前端通过 `/api` 契约与服务端交互。

## 功能

- 平铺墙：保持真实比例的照片墙，全景跨列，向下自动加载。
- 环绕墙：拖动、滚轮或聚焦后使用方向键无限探索；静止时停止渲染循环。
- 照片详情：桌面左图右信息，移动端三态底部面板；`I` 收起 / 展开信息，方向键切换，`Esc` 关闭。
- 玻璃悬浮工具：比例 / 相册 / 标签 / 精选 / 搜索 / 排序，亮色 / 深色 / 跟随系统，三档密度。
- 工作室：登录、原图导入队列、编辑、批量公开 / 私密 / 精选 / 分组、回收站、相册与站点设置。
- 隐私：原文件保存在私有档案，公开图像不嵌入 EXIF；界面只展示从原片提取的真实信息。

## 技术栈

| 层     | 技术                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| 前端   | React 19 · Vite 7 · TypeScript · Base UI · MingCute · Motion · TanStack Query |
| 后端   | Node 24 · Hono · SQLite（WAL）· sharp · exifr · heic-convert                  |
| 契约   | Zod（`packages/contracts`，前后端共享的 API 事实来源）                        |
| 工具链 | pnpm 9 workspace · esbuild · node:test · Prettier                             |

全站玻璃为自研 Glass Engine（`apps/client/src/glass/`），见
[docs/glass-engine-architecture.md](docs/glass-engine-architecture.md)。

## 前置要求

- Node 24 LTS、pnpm 9。
- 图片处理依赖 sharp（需与运行平台匹配的原生二进制）。

## 项目结构

```text
apps/client/         React + Vite；gallery / studio / ui / glass / vendor
apps/server/         Node + Hono；core（配置 / 数据库 / 存储 / 安全）+ modules（认证 / 媒体 / 图库 / 设置）
packages/contracts/  Zod 请求契约与 TypeScript 响应类型
scripts/             初始化、原片导入、备份、构建打包
deploy/              systemd 服务、原子发布、Caddy 配置替换
tests/               API、媒体、几何、查看器、缓存、部署配置、限额测试
tools/               依赖许可汇总、浏览器与域名验收
docs/                架构、API、玻璃引擎
```

## 快速开始

```bash
pnpm install
pnpm setup                        # 生成 .env 与管理员凭据（0600，拒绝覆盖）
pnpm dev                          # 前端 :5173，API :8787
pnpm photos:import --directory <照片目录>
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

管理员密码在初始化生成的 `admin-credentials.txt`（仅本机，不入 Git、不写日志）。
`data/`、`.env`、原始照片、测试产物与密码文件均被 Git 忽略。

## 配置

环境变量见 [.env.example](.env.example)。核心项：

| 变量                             | 说明                                    |
| -------------------------------- | --------------------------------------- |
| `APP_ORIGIN`                     | 站点唯一 origin，影响 Cookie 与同源校验 |
| `ADMIN_PASSWORD_HASH`            | scrypt 口令哈希（`pnpm setup` 生成）    |
| `SESSION_SECRET`                 | 会话签名盐，至少 32 字符随机值          |
| `FANPHOTO_DATA_DIR`              | SQLite / media / backups 目录           |
| `HOST` / `PORT`                  | 默认 `127.0.0.1:8787`，仅本机反代可达   |
| `NODE_ENV` / `TRUST_LOCAL_PROXY` | 生产模式 / 可信反代开关                 |

数据库 schema 由 `apps/server/migrations/001_initial.sql` 创建，启动时自动应用缺失迁移；
媒体文件与派生图存放于 `FANPHOTO_DATA_DIR`，与代码分离。

## 构建与部署

```bash
pnpm build                        # typecheck + 前端构建 + 服务端打包 + Brotli/gzip
bash deploy/release.sh            # install→build→test→备份→原子切换→健康检查（失败自动回滚）
```

生产部署为不可变 release + `current` 符号链接原子切换，systemd `fanphoto.service` 托管，
Caddy 反向代理并强制 HTTPS。

## 文档

- [架构设计](docs/ARCHITECTURE.md)
- [API 契约](docs/API.md)
- [玻璃引擎](docs/glass-engine-architecture.md)

## License

本项目未选择开源许可证（私有项目）。
