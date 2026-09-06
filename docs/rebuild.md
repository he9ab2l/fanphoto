# Fanphoto 架构与运维

分支 `refactor/photo-wall`。一次完整重写：保留原功能需求，前后端与 UI 全部重做。
视觉基线：极简、少文字、液态玻璃、动态组件；照片优先，移动端与 `prefers-reduced-motion` 可用。

## 架构

```
浏览器 ── HTTPS ── Cloudflare 边缘（proxied）── Caddy :443 ── 127.0.0.1:8787（Hono API）
                                                                    │
                                                    apps/web/dist 静态资源（API 内嵌托管）
                                                                    │
                                            Node SQLite（data/fanphoto.sqlite, WAL）
                                            data/media/（originals / thumbs / videos）
```

- 单进程：Hono 同时提供 API（`/api/*`、`/media/*`）与前端静态资源（apps/web/dist）
- `@fanphoto/shared` 是前后端唯一的 schema / 类型来源（zod 校验双端复用）
- 图片在浏览器端处理：`prepareImage` 解码 → EXIF 白名单 → 4 档 WebP 变体 → ThumbHash / 主色 / 直方图 → 上传
- 实况视频：浏览器端同步提交同名 MOV/MP4，服务端 `sanitizeVideo` 保留媒体偏移、擦除隐私 atom

### 关键模块（apps/api/src）

| 模块 | 职责 |
| --- | --- |
| `node.ts` | 入口：数据库迁移、静态资源托管、IP 提取、优雅退出 |
| `app.ts` | Hono 装配：安全响应头、CSP、body 限制、路由、错误处理 |
| `auth.ts` | 会话（HttpOnly cookie + CSRF）、同源校验、登录限速、登出 |
| `photos.ts` | 照片列表/详情/上传/编辑/回收站/批量/下载/媒体流（ETag、Range） |
| `admin.ts` | 站点设置、相册 CRUD、统计、隐私批量擦除、元数据导出 |
| `repository.ts` | SQL 查询、搜索、游标分页、序列化（可见性/位置隐藏） |
| `images.ts` | WebP 头校验、视频容器 sanitize |
| `crypto.ts` | PBKDF2 口令哈希、SHA-256、常量时间比较 |
| `local.ts` | Node SQLite 适配层 + 文件存储（key 白名单防穿越、原子写入） |
| `public-origin.ts` | 临时入口 origin 覆盖（旧隧道方案，保留兼容） |

### 数据模型

- `photos`：元数据 + EXIF JSON + tags JSON + 4 档 WebP 引用 + content_hash + thumb_hash + analysis（颜色/直方图/影调）
- `albums` / `album_photos`（级联删除）；`settings`（site JSON）；`sessions`（含 credential_version 失效机制）；`login_attempts`（限速）
- 软删除：`deleted_at`；公开可见条件 `published=1 AND deleted_at IS NULL`

### 隐私

- 上传可擦除 GPS；站点设置可整体隐藏/批量清除位置（`erase-location`）
- 下载需站点开关；公开序列化剥离 source_name
- 媒体流 ETag + `Cache-Control: private, no-cache`；API 全部 `no-store`

## 环境变量（.env，由 `pnpm setup` 生成）

| 变量 | 说明 |
| --- | --- |
| `APP_ORIGIN` | 站点 origin（决定 secure cookie 与同源校验） |
| `ADMIN_PASSWORD_HASH` | PBKDF2 哈希（`pbkdf2-sha256$100000$...`） |
| `SESSION_SECRET` | 会话凭据盐（≥32 字符） |
| `FANPHOTO_DATA_DIR` | 数据目录（sqlite + media + backups + public-origin） |
| `HOST` / `PORT` | 监听地址，默认 `127.0.0.1:8787` |
| `TRUST_LOCAL_PROXY` | `true` 时信任来自本机代理的 `X-Forwarded-For` |
| `NODE_ENV` | `production` / `development` |

初始化：`pnpm setup` 生成 `.env`（0600）与 `admin-credentials.txt`（管理员密码，勿提交）。

## 部署（ten）

- 源码同步：`rsync -az --delete --exclude .git --exclude node_modules --exclude data --exclude '**/dist' ./ ten:/home/ubuntu/fanphoto-dev/workspace/`
- 发布：`bash scripts/release-ten.sh` —— 依赖安装 → `pnpm test` → 构建 → 备份 → 新 release 目录 → `current` 符号链接原子切换 → 重启服务 → 健康检查（失败自动回滚）
- 反向代理：Caddy `:443` 内 `@fanphoto host test.heabl.xyz` 反代 `127.0.0.1:8787`；
  Cloudflare 证书 `*.heabl.xyz`（CF Origin CA），DNS 记录 `test.heabl.xyz` 为 **proxied（橙云）**
- 备份：`pnpm backup`（sqlite 一致性快照 + media 复制）落盘 `data/backups/`；由 release 脚本自动触发

## 测试

- `pnpm test`：Node 内置 test runner（api.test.ts 10 项：认证/CSRF/限速/上传回滚/幂等/搜索分页/相册/隐私/导出；media.test.ts：WebP 校验与视频 sanitize）
- `pnpm test:e2e`：Playwright（formats、workflow、画廊/照片墙响应式与键盘可达），端口 8791，临时数据目录
- 测试素材为确定性合成图（tools/make-test-fixtures.py），无真实照片与虚构 EXIF/GPS

## 已删除的历史

重构过程中移除：旧 React 照片墙与样式、静态图片清单、旧下载/分析脚本（ps1/py）、
Cloudflare 无服务器架构调研文档、cloudflared 隧道方案（Caddy + CF DNS 替代）。
演示源照片 `test-photo/` 不再入库（gitignore，本地保留供 tools/prepare-demo.py 生成演示数据）。
