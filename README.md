# fffaa-photo

自托管照片展示网站：个人相册与摄影作品站。

> 当前阶段：React 照片墙可用；Cloudflare 无服务器方案设计定稿，待实现。
> 技术方向：浏览器端图片处理 + CF Pages/Functions + R2 + D1，React 19 前端。

## 已完成

- React 19 + Vite + TypeScript 照片墙：[`apps/web/`](apps/web/)
- 70 张测试照片（`photo-001.jpg` ~ `photo-070.jpg`）位于 [`test-photo/scenic/`](test-photo/scenic/)
- 零依赖无限照片墙交互：无限平移、穹顶弯曲、光标透镜、手电筒、卡片翻转、缩放
- 设计与调研文档位于 [`docs/`](docs/)

## 运行

```bash
cd apps/web
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 类型检查 + 构建
```

## 目录

```text
fffaa-photo/
├── apps/web/           # React 19 + Vite + TypeScript 照片墙
├── docs/               # 设计与调研文档
├── scripts/            # 照片下载 / 清单生成 / 分析 / QA
└── test-photo/scenic/  # 70 张统一命名的测试照片
```

## 照片管理

- 新增/删除照片后重新生成清单：`node scripts/generate-web-images.mjs`
- 统一命名（`photo-NNN.jpg`，可重复运行）：`pwsh -NoProfile -File scripts/rename_scenic_photos.ps1`
- 重新下载 50 张不同长宽比风景图：`pwsh -NoProfile -File scripts/download_scenic_photos.ps1`
- 直方图/色板与隐藏数据扫描（需 Python 3.8+、Pillow）：`python scripts/generate_charts.py`、`python scripts/scan_hidden_data.py`
- 真实渲染 QA（先启动开发服务器与 9222 端口无头 Chrome）：`node scripts/qa-demo.mjs`

## 设计文档（技术基线）

| 文档 | 内容 |
| --- | --- |
| [无服务器照片站架构设计](docs/无服务器照片站架构设计.md) | 总体架构、API、部署、Roadmap |
| [图片处理实现调研](docs/图片处理实现调研.md) | 处理管线与浏览器端适配 |
| [存储与数据设计](docs/存储与数据设计.md) | R2 布局、D1 schema、一致性 |
| [前端框架与架构](docs/前端框架与架构.md) | React 19 栈、目录、数据流 |

### 参考调研

- [ChronoFrame项目框架调研](docs/ChronoFrame项目框架调研.md)
- [ChronoFrame地图展示实现调研](docs/ChronoFrame地图展示实现调研.md)
- [Photoview项目调研](docs/Photoview项目调研.md)
- [Lychee项目调研](docs/Lychee项目调研.md)
- [gallery-dl工具调研](docs/gallery-dl工具调研.md)
- [EXIF库选型参考](docs/EXIF库选型参考.md)
- [图片元数据解析记录](docs/图片元数据解析记录.md)
- [no-gl-grid-skill](docs/no-gl-grid-skill.md)

## 参考项目

- [ChronoFrame](https://github.com/HoshinoSuzumi/chronoframe)
- [ExifTool](https://exiftool.org/)
- [exifr](https://github.com/MikeKovarik/exifr)
- [Sharp](https://sharp.pixelplumbing.com/)
