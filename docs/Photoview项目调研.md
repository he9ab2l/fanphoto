# Photoview 项目调研

> 状态：调研完成。参考代码 clone 于 `~/tmp/afilmory-research/photoview`（photoview/photoview，master）。
> 定位：**"服务器版"功能最全的参考书**——其扫描模型、分享机制、媒体保护、渐进加载
> 四个设计值得进入 fanphoto v2 roadmap；RAW/人脸/视频/多用户与无服务器单人路线不兼容。

## 1. 项目概览

| 项 | 值 |
| --- | --- |
| 定位 | 自托管照片画廊：把磁盘目录映射为相册，扫描自动生成缩略图，网页浏览 |
| 协议 | **GPL-3.0**（可参考功能，抄代码需注意传染性） |
| 规模 | 1473 commits，Go 34K 行 + React 18.6K 行 ≈ 52K 行 |
| 后端 | Go 1.26 + GraphQL（gqlgen）+ GORM |
| 前端 | React 18 + Apollo Client + Tailwind + mapbox-gl |
| 数据库 | SQLite / MariaDB / PostgreSQL 三选 |
| 部署 | Docker 镜像 + Debian/Ubuntu/Arch/NixOS/Unraid/TrueNAS/YunoHost 系统包 |
| 图片 | ImageMagick（imagick，RAW 解码）+ exiftool + jellyfin-ffmpeg（视频转码）+ go-face（人脸） |

## 2. 核心架构

```
服务器磁盘目录（照片/视频按目录存放）
  │  periodic_scanner（定时扫描 + 手动触发）
  ▼
scanner_queue → scanner_task 异步处理：
  ├─ media_type 判定（图片/视频/RAW）
  ├─ 缩略图生成（ImageMagick）+ blurhash
  ├─ EXIF 提取（exiftool）
  ├─ 视频转码（jellyfin-ffmpeg）
  └─ face_detection（go-face/dlib 人脸检测）
  ▼
GraphQL API（gqlgen）→ React 前端（目录=相册树展示）
```

## 3. 功能与优点

| 功能 | 说明 | 借鉴价值 |
| --- | --- | --- |
| **目录=相册** | 文件系统组织照片，网页只是投影；备份/迁移=复制文件夹 | ⭐ 核心哲学 |
| **多用户+路径权限** | 每用户绑定文件系统路径，只能访问自己路径内照片 | 单人用不到 |
| **分享** | 相册/单张生成公开链接，可选密码保护 | ⭐ v2 借鉴 |
| **RAW 支持** | ImageMagick 解码 CR2/NEF/ARW 全系（Afilmory/ChronoFrame 均不支持） | 无服务器不可行，排除 |
| **人脸识别** | go-face 自动检测+聚类分组（人物相册） | 无服务器不可行，排除 |
| **视频支持** | ffmpeg 转码+视频缩略图 | v2 可评估（R2+播放器） |
| **渐进加载** | 全屏先显示缩略图，高清加载完替换 | ⭐ 与 no-gl-grid 目标一致 |
| **媒体保护** | 所有媒体资源 cookie-token 保护，URL 不可猜；严格 CORS | ⭐ 安全设计可抄 |
| **定期扫描** | periodic_scanner 自动发现新文件 | ⭐ cron trigger 同思路 |
| **扫描队列** | scanner_queue + 任务重试，异步处理 | 设计参考 |

## 4. 对比定位（与已调研项目）

| 维度 | Photoview | ChronoFrame | Afilmory | Lychee |
| --- | --- | --- | --- | --- |
| 后端 | Go/GraphQL | Nuxt/Nitro | Hono/静态 | PHP/Laravel |
| 前端 | React 18 | Vue 3 | React 19 | Vue 3 |
| 照片组织 | 磁盘目录 | 上传管理 | 构建拉取 | 上传管理 |
| 多用户 | ✅ 路径权限 | 单管理员 | SaaS 多租户 | 多用户 |
| RAW | ✅ | ❌ | ❌ | ❌ |
| 人脸 | ✅ 自动 | ❌ | ❌ | ✅ 建议制 |
| 视频 | ✅ 转码 | 部分 | LivePhoto | ✅ |
| 协议 | GPL-3.0 | MIT | ANL | MIT |

## 5. 对 fanphoto（CF 无服务器方案）的可借鉴点

| Photoview 设计 | 适配方案 |
| --- | --- |
| 目录=相册 | R2 key 前缀模拟：`photos/相册名/{id}.webp`；cron 扫 R2 前缀自动建相册（v2） |
| 定期扫描 | CF cron trigger 定期 list R2 比对 D1，发现外部上传的图（v2） |
| 媒体保护 | v2 分享链接加签名/随机 token（R2 presigned/条件访问） |
| 渐进加载 | sm→lg 多档缩略图实现同款体验（v1 已设计） |
| 分享链接 | v2 加 share_tokens 表 + 公开链接（可选密码） |

**明确排除**：RAW 支持（需 ImageMagick）、人脸识别（需 dlib 原生库）、视频转码（v1）、多用户权限。

## 6. 参考代码索引

| 模块 | 位置 |
| --- | --- |
| 扫描调度 | `api/scanner/periodic_scanner/` |
| 扫描队列/任务 | `api/scanner/scanner_queue/`、`scanner_task/`、`scanner_tasks/` |
| 媒体类型/编码 | `api/scanner/media_type/`、`media_encoding/` |
| 人脸检测 | `api/scanner/face_detection/` |
| 分享 token | `api/graphql/models/share_token.go` |
| 权限模型 | `api/graphql/models/user.go`、`access_permission` 相关 |
