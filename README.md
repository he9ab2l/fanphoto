# fffaa-photo

自托管照片展示网站，用于构建个人相册与摄影作品站。

> 当前阶段：**设计定稿**（Cloudflare 无服务器方案），待实现。
>
> 技术方向已确认：**浏览器端图片处理 + CF Pages/Functions + R2 + D1，React 19 前端**，
> 取代原"服务端 ExifTool 解析"的旧方向（见下方文档索引与《无服务器照片站架构设计》）。
>
> 演示状态：可用；2026-09-05 完成 UI/交互收尾，视觉参数仍可继续打磨（见开发记录）。

## 项目目标

- 管理和展示个人照片
- 上传时提取 EXIF、GPS 等元数据
- 生成缩略图及基础图片分析数据
- 提供网格、详情、地图和相册等展示方式

## 当前调研

- EXIF 解析库的能力与兼容性
- 图片元数据字段及数据模型
- 图片重编码、隐藏数据检测与上传安全
- 直方图、主色提取等图片分析
- 参考项目 ChronoFrame 的整体框架与地图展示实现

调研记录与设计文档位于 [`docs/`](docs/)：

### 设计文档（技术基线，定稿）

| 文档 | 内容 |
| --- | --- |
| [无服务器照片站架构设计](docs/无服务器照片站架构设计.md) | 总体架构、API、部署、Roadmap（骨架） |
| [图片处理实现调研](docs/图片处理实现调研.md) | ChronoFrame/Afilmory 处理明细、可抄参数、浏览器端管线 |
| [存储与数据设计](docs/存储与数据设计.md) | R2 布局/缓存、D1 schema/备份、一致性协议 |
| [前端框架与架构](docs/前端框架与架构.md) | React 19 栈、目录、数据流、借鉴清单 |

### 项目调研（参考源）

| 文档 | 内容 |
| --- | --- |
| [EXIF库选型参考](docs/EXIF库选型参考.md) | EXIF 库对比与初步选型 |
| [图片元数据解析记录](docs/图片元数据解析记录.md) | 测试图片的元数据解析结果 |
| [ChronoFrame项目框架调研](docs/ChronoFrame项目框架调研.md) | Nuxt 全栈架构、存储、队列与处理流程 |
| [ChronoFrame地图展示实现调研](docs/ChronoFrame地图展示实现调研.md) | 地图、照片点位、聚类和 GPS 展示 |
| [Photoview项目调研](docs/Photoview项目调研.md) | Go/GraphQL 照片站：目录=相册、RAW、人脸、分享、媒体保护 |
| [Lychee项目调研](docs/Lychee项目调研.md) | PHP/Laravel 照片站：智能相册、星级、水印、主色提取 |
| [gallery-dl工具调研](docs/gallery-dl工具调研.md) | 批量下载工具：测试素材获取、extractor 插件架构 |
| [no-gl-grid-skill](docs/no-gl-grid-skill.md) | 无限照片墙技术方案（零依赖 DOM/JS/CSS） |
| [no-gl-grid演示开发记录](docs/no-gl-grid演示开发记录.md) | 演示实现、修复过程、当前参数与已知问题 |

## 技术方向（已定稿）

> 原"暂定技术方向"已由《无服务器照片站架构设计》取代，摘要如下：

- 浏览器端处理图片（exifr 读 EXIF/GPS、heic2any 转码、Canvas 缩略图），函数只做校验/写库
- 托管：Cloudflare Pages（静态）+ Functions（Hono API）+ R2（图片）+ D1（元数据）
- 前端：React 19 + Vite + Tailwind 4 + TanStack Query + jotai
- 上传即生效（写入 D1/R2，无需重新构建）；R2 自定义域直连图片

## 计划中的数据流程

```text
上传照片
  → 安全检查与重编码
  → 提取 EXIF / GPS
  → 生成缩略图
  → 保存元数据与文件信息
  → 网格 / 详情 / 地图展示
```

## 下一步

1. 确定基础框架和数据模型
2. 完成最小上传与元数据解析流程
3. 建立测试图片和处理结果校验
4. 实现照片网格与详情页
5. 再加入地图、相册管理和图片分析功能

## 目录

```text
fffaa-photo/
├── docs/              # 调研、技术方案与开发记录
├── demo/no-gl-grid/   # 零依赖无限照片墙演示
├── scripts/           # 图片分析 / 下载 / 清单生成 / QA 脚本
├── test-photo/        # 演示用测试图片
└── histograms/        # 脚本生成的直方图与色板
```

## 脚本

```bash
# 生成直方图和主色色板
python scripts/generate_charts.py

# 扫描图片隐藏数据
python scripts/scan_hidden_data.py

# 重新生成演示照片清单（需 Node.js 18+）
node scripts/generate-demo-manifest.mjs

# 无头渲染 QA（先自行启动 9222 端口无头 Chrome）
node scripts/qa-demo.mjs
```

Python 脚本依赖 Python 3.8+、Pillow 和 exifread：

```bash
pip install pillow exifread
```

下载类脚本（PowerShell，可选）：

- `scripts/download_gallery_images.ps1`：从 Unsplash 拉取演示高清图
- `scripts/download_test_images.ps1`：从两个元数据测试图仓库拉取样张

图源记录：[`scripts/gallery-download-log.txt`](scripts/gallery-download-log.txt)。

## 演示

[`demo/no-gl-grid/`](demo/no-gl-grid/) 是基于 [`docs/no-gl-grid-skill.md`](docs/no-gl-grid-skill.md)
的零依赖无限照片墙演示：纯 DOM + matrix3d 实现无限平移、穹顶弯曲、光标透镜、
手电筒聚光、卡片翻转放大、视口自适应缩放，以及 MingCute 风格线性图标 UI。
直接双击 `demo/no-gl-grid/index.html` 即可浏览。

- 使用说明：[`demo/no-gl-grid/README.md`](demo/no-gl-grid/README.md)
- 实现细节、修复记录与已知问题：[`docs/no-gl-grid演示开发记录.md`](docs/no-gl-grid演示开发记录.md)
- 测试图片在 [`test-photo/`](test-photo/)，增删照片后运行 `node scripts/generate-demo-manifest.mjs` 重新生成清单

## 参考项目

- [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe)
- [ExifTool](https://exiftool.org/)
- [exifr](https://github.com/MikeKovarik/exifr)
- [Sharp](https://sharp.pixelplumbing.com/)
