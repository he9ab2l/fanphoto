# Fanphoto

自托管个人照片展示站：全屏照片墙、相册、地图足迹与私密工作室。前后端一体，Hono + React，Node SQLite 存储。

线上：<https://test.heabl.xyz>（开发预览，经 Cloudflare 代理）

## 技术栈

- **前端** `apps/web`：React 19 + Vite + TypeScript，React Router、TanStack Query、Motion、Maplibre GL
- **公开端视觉**：全屏 no-GL 无限照片墙（纯 DOM `matrix3d`），黑白灰配色，液态玻璃控件，MingCute 图标（本地打包）
- **后端** `apps/api`：Hono + Node SQLite（WAL）+ 文件存储，浏览器端图片处理
- **共享** `packages/shared`：zod 校验 schema 与类型，前后端共用
- **构建**：pnpm workspace + esbuild 单文件打包 API，Vite 构建 Web

## 功能

- 全屏无限照片墙：穹顶弯曲、光标凸起、聚光遮罩、点击翻转进入查看器，零 WebGL
- 照片查看器：缩放平移、EXIF 信息、影调直方图、分享下载、实况视频
- 搜索 / 相册 / 地图足迹 / 关于页，全部采用照片优先、少文字的沉浸式布局
- 私密工作室（`/admin`）：上传队列、照片库批量操作、回收站、相册管理、站点设置、元数据导出
- 图片处理：浏览器端解码 JPEG/PNG/WebP/AVIF/HEIC/TIFF，EXIF 白名单提取、4 档 WebP 变体、ThumbHash、主色与直方图、实况视频（MOV/MP4）配对与元数据擦除
- 安全：会话 Cookie（HttpOnly）、CSRF、同源校验、登录限速、路径穿越防护、严格 CSP

## 目录

```text
apps/web/            # React 前端
apps/web/src/config/ # 前端可调参数（导航、网格、查看器、文案）
apps/web/src/lib/    # API 封装、MingCute 图标本地子集
apps/web/src/components/public/  # 公开端组件（NoGlGrid、液态玻璃控件）
apps/web/src/styles/  # app.css（后台）+ public.css（公开端）
apps/api/            # Hono 后端（src/ 源码，dist/ 由构建生成）
apps/api/migrations/ # SQLite 迁移
packages/shared/     # 前后端共享的 schema 与类型
scripts/             # setup / seed / backup / 构建 / 部署
tests/               # Node 单元测试 + Playwright 浏览器测试
tools/               # 演示素材与图标子集工具
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

## 前端配置

公开端视觉参数集中在 `apps/web/src/config/site.ts`，不需要改组件即可调整：

- 品牌名、导航项与图标
- 网格 `visibleColumns / gap / bow / bulge / reach / flipFraction`
- 缩放范围与步进
- 查看器缩放范围

配色、圆角、液态玻璃与响应式断点写在 `apps/web/src/styles/public.css`。图标来自 MingCute，已通过 `tools/build-mingcute-subset.py` 生成本地子集 `apps/web/src/lib/mingcute-subset.json`，新增图标时同步更新该脚本。

## 演示照片

测试数据默认从 `artifacts/seed-media` 导入。需要重新拉取 100 张高清风景测试图时：

```bash
# 1. 从 Wikimedia Commons 挑选比例多样的高清风景 URL（需网络）
python tools/fetch-commons-urls.py

# 2. 用 gallery-dl 下载（示例为 Flickr 高清风景搜索）
gallery-dl --range 1-180 --sleep-request 0.6 -D artifacts/gdl-flickr-batch \
  "https://flickr.com/search/?text=mountain%20landscape%20nature&sort=interestingness-desc"
gallery-dl --range 1-120 --sleep-request 0.6 -D artifacts/gdl-flickr-portrait \
  "https://flickr.com/search/?text=vertical%20landscape%20photography%20nature&sort=interestingness-desc"

# 3. 按比例配额精选 100 张到 test-photo/scenic
python tools/select-photo-set.py

# 4. 生成 WebP 变体与 manifest
python tools/prepare-demo.py

# 5. 写入本地数据库
pnpm seed
```

`artifacts/`、`data/`、`test-photo/` 均已 gitignore，不会进入仓库。

## 生产部署（ten 服务器）

```bash
# 同步源码到服务器 workspace 后，在服务器上执行：
bash scripts/release-ten.sh   # 安装依赖 → 测试 → 构建 → 备份 → 原子切换 release → 健康检查
```

systemd 单元 `deploy/fanphoto-dev.service`：运行 `apps/api/dist/server.mjs`，
监听 `127.0.0.1:8787`，由 Caddy 反向代理并配 Cloudflare 证书与 DNS。

更多运维细节见 [docs/rebuild.md](docs/rebuild.md)。
