# fffaa-photo

自托管照片展示网站，用于构建个人相册与摄影作品站。

> 当前阶段：**准备与调研**。暂未开始正式开发，技术方案仍可调整。
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

调研记录位于 [`docs/`](docs/)：

| 文档 | 内容 |
| --- | --- |
| [EXIF库选型参考](docs/EXIF库选型参考.md) | EXIF 库对比与初步选型 |
| [图片元数据解析记录](docs/图片元数据解析记录.md) | 测试图片的元数据解析结果 |
| [ChronoFrame项目框架调研](docs/ChronoFrame项目框架调研.md) | Nuxt 全栈架构、存储、队列与处理流程 |
| [ChronoFrame地图展示实现调研](docs/ChronoFrame地图展示实现调研.md) | 地图、照片点位、聚类和 GPS 展示 |
| [no-gl-grid-skill](docs/no-gl-grid-skill.md) | 无限照片墙技术方案（零依赖 DOM/JS/CSS） |
| [no-gl-grid演示开发记录](docs/no-gl-grid演示开发记录.md) | 演示实现、修复过程、当前参数与已知问题 |

## 暂定技术方向

这些方案仅作为后续实现的起点，尚未最终确定：

- 服务端使用 ExifTool 兼容方案解析完整元数据
- 前端使用轻量库进行上传前的快速预览
- 上传流程负责重编码、元数据提取、缩略图生成和数据入库
- 展示页面直接读取已处理的数据，避免实时解析原图
- GPS 信息支持地图展示，并视需要进行反向地理编码
- 直方图、主色和 Live Photo 等功能按优先级逐步加入

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
