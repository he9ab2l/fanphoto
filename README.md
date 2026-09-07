# FanPhoto

全新开发的自托管照片墙与摄影工作室。React 展示端 / 管理端，Node 服务端原片处理，
独立数据库和 `/api/v1` 契约；没有旧项目兼容层。

测试站：<https://test.heabl.xyz> · 工作室：<https://test.heabl.xyz/studio>

## 使用

- 平铺：保持真实比例的照片墙，全景跨列，向下自动加载。
- 圆柱 / 球面：拖动、滚轮或聚焦墙后使用方向键，循环探索照片；静止时停止渲染循环。
- 点击照片：浮层左图右信息，手机上下布局；`I` 收起 / 展开信息，方向键切换，`Esc` 关闭。
- 玻璃悬浮工具：比例 / 相册 / 标签 / 精选 / 搜索 / 排序，明亮 / 深色 / 跟随系统，三档密度。
- 工作室：登录、原图导入队列、编辑、批量公开 / 私密 / 精选 / 分组、回收站、相册与站点设置。
- 原文件保存在私有档案中，公开图像不嵌入 EXIF；界面只显示从原片提取的真实信息。

## 项目结构

```text
apps/client/         React + Vite；gallery / studio / ui / vendor
apps/server/         Node + Hono；core / modules；SQLite 迁移
packages/contracts/  Zod 请求契约和 TypeScript 响应类型
scripts/             初始化、构建、原片导入、备份
deploy/              systemd、原子发布、旧站归档、定向 Caddy 配置替换
tests/               API、媒体、几何、部署配置与浏览器测试
tools/               真风景图下载、原片核验、截图取证
docs/                架构、接口、运维、资源来源与验收
```

## 本地开发

完整后端推荐 Linux / macOS + Node 24 LTS、pnpm 9。当前 Termux 可进行前端构建和类型检查；
Sharp 原生解码与浏览器测试在 ten 的独立工作目录验证。

```bash
pnpm install
pnpm setup                        # 新建 .env 和 0600 管理员凭据文件，拒绝覆盖已有配置
pnpm dev                          # Web :5173，API :8787
pnpm photos:import --directory test-photo/commons-landscapes
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e                     # 必须先构建；独立临时数据库，不操作真实图库
pnpm start
```

管理员密码在初始化生成的 `admin-credentials.txt`，不写入源码、不输出到日志。
`data/`、`.env`、原片、测试产物及密码文件全部不入 Git。

## 测试照片

`node tools/download-landscapes.mjs` 下载 Wikimedia Commons 开放许可的风景原片，
保留原始字节和真实 EXIF，记录作者、许可、来源、尺寸、SHA256。
当前清单为 32 张：12 横幅、8 竖幅、6 方图、6 全景。自动化合成素材与真实图库分开。

## 文档

- [架构与扩展设计](docs/architecture.md)
- [API 契约](docs/api.md)
- [开发、部署与恢复](docs/operations.md)
- [本地组件 / 图标 / skill 审查](docs/ui-resources.md)
- [实施计划与验收范围](docs/plan.md)
- [验收结果](docs/acceptance.md)

旧源码、旧样图和旧测试已移出工作区，保存在
`/data/data/com.termux/files/home/archive/fanphoto-legacy.h24FbT`；原始 Git 提交为 `3cec0e2`。
