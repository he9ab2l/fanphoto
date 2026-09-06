# Fanphoto

自托管个人照片展示站：照片墙、相册、地图足迹与私密工作室。前后端一体，Hono + React，Node SQLite 存储。

线上：<https://test.heabl.xyz>（开发预览，经 Cloudflare 代理）

## 技术栈

- **前端** `apps/web`：React 19 + Vite + TypeScript，React Router、TanStack Query、Motion、Maplibre GL
- **后端** `apps/api`：Hono + Node SQLite（WAL）+ 文件存储，浏览器端图片处理
- **共享** `packages/shared`：zod 校验 schema 与类型，前后端共用
- **构建**：pnpm workspace + esbuild 单文件打包 API，Vite 构建 Web

## 功能

- 响应式照片网格（搜索 / 标签 / 精选 / 排序 / 游标分页）
- 无限照片墙：拖拽平移、穹顶透视、聚光效果、触控缩放
- 照片查看器：缩放平移、EXIF 信息、影调直方图、分享下载
- 相册 / 地图足迹 / 关于页
- 私密工作室（`/admin`）：上传队列、照片库批量操作、回收站、相册管理、站点设置、元数据导出
- 图片处理：浏览器端解码 JPEG/PNG/WebP/AVIF/HEIC/TIFF，EXIF 白名单提取、4 档 WebP 变体、ThumbHash、主色与直方图、实况视频（MOV/MP4）配对与元数据擦除
- 安全：会话 Cookie（HttpOnly）、CSRF、同源校验、登录限速、路径穿越防护、严格 CSP

## 目录

```text
apps/web/            # React 前端
apps/api/            # Hono 后端（src/ 源码，dist/ 由构建生成）
apps/api/migrations/ # SQLite 迁移
packages/shared/     # 前后端共享的 schema 与类型
scripts/             # setup / seed / backup / 构建 / 部署
deploy/              # systemd 单元
tests/               # Node 单元测试 + Playwright 浏览器测试
tools/               # 演示与测试素材生成工具
docs/                # 架构与运维文档（docs/rebuild.md）
```

## 开发

```bash
pnpm install
pnpm setup           # 生成 .env 与 admin-credentials.txt（含管理员密码）
pnpm dev             # API :8787 + Web :5173（vite 代理 /api 与 /media）
pnpm test            # Node 单元测试（api / media）
pnpm test:e2e        # Playwright 浏览器测试
pnpm build           # 类型检查 + Web 构建 + API 打包
pnpm start           # 运行 apps/api/dist/server.mjs（需先 build）
```

## 生产部署（ten 服务器）

```bash
# 同步源码到服务器 workspace 后，在服务器上执行：
bash scripts/release-ten.sh   # 安装依赖 → 测试 → 构建 → 备份 → 原子切换 release → 健康检查
```

systemd 单元 `deploy/fanphoto-dev.service`：运行 `apps/api/dist/server.mjs`，
监听 `127.0.0.1:8787`，由 Caddy 反向代理并配 Cloudflare 证书与 DNS。

更多运维细节见 [docs/rebuild.md](docs/rebuild.md)。
