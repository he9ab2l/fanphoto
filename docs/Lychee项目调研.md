# Lychee 项目调研

> 状态：调研完成。参考代码 clone 于 `~/tmp/afilmory-research/lychee`（LycheeOrg/Lychee，master）。
> 定位：**"功能最全的管理型照片站"**——智能相册/星级/水印/主色四个设计可用 SQL 或
> canvas 直接搬进 fanphoto 无服务器架构；人脸类功能与无服务器路线不兼容。
> 官网：lycheeorg.dev（Docker/docker-compose 部署）。

## 1. 项目概览

| 项 | 值 |
| --- | --- |
| 定位 | 自托管照片管理系统（2017 至今，最老牌活跃项目之一） |
| 协议 | **MIT**（整个项目可参考/借鉴） |
| 规模 | 2743 commits，v7.8.3；PHP 1450 文件 + Vue 607 组件 + TS/JS 199 文件 |
| 后端 | PHP 8.4 + Laravel（Eloquent/队列 Jobs/策略 Policies） |
| 前端 | Vue 3 + Vite + TypeScript + Leaflet 地图 |
| 数据库 | MySQL 默认（SQLite 备选） |
| 图片 | 双引擎可切换：GD / ImageMagick（GdHandler/ImagickHandler）+ VideoHandler + GoogleMotionPictureHandler |
| 部署 | Docker / docker-compose |

## 2. 核心架构

```
上传（网页 / URL 导入 / Dropbox）
  │  Laravel Jobs 队列：ImportImageJob → ProcessImageJob
  ▼
  ├─ EmbedMetadataJob（EXIF/IPTC）
  ├─ ExtractColoursJob（主色提取）
  ├─ GeodecodeLocationJob（GPS 反向地理编码）
  ├─ DispatchFaceScanJob（人脸检测）
  └─ Watermarker（水印，可配置）
  ▼
MySQL（照片记录 + 相册 + 星级 + 人脸 Person/Face）→ Vue 前端
  + SmartAlbums（虚拟相册：动态查询，不复制照片）
```

## 3. 功能与优点

| 功能 | 说明 | 借鉴价值 |
| --- | --- | --- |
| **智能相册（虚拟）** | Recent/OnThisDay/Highlighted/星级 1-5/Unsorted/Untagged/BestPictures，动态查询不复制照片 | ⭐⭐ SQL 直接实现 |
| **星级 + 收藏** | 1-5 星评分联动智能相册 | ⭐ 一个字段的事 |
| **水印** | 上传自动/手动打水印，防盗图 | ⭐ canvas 可实现 |
| **主色提取** | ColourExtractor 提取主色，用于相册封面/UI 主题 | ⭐ canvas 聚类可实现 |
| **人脸（建议制）** | 自动检测 → 聚类 → FaceSuggestion **建议用户确认合并**（比全自动可控） | 无服务器不可行，排除 |
| **Live Photo** | GoogleMotionPictureHandler | 已纳入图片处理调研 |
| **分享** | 公开链接 + 密码保护 | ⭐ v2 借鉴 |
| **导入方式** | 本地/服务器 URL/Dropbox | 部分适用（URL 导入） |
| **双图像引擎** | GD/ImageMagick 可切换 | 无服务器不适用 |
| **长期维护** | 2017 至今 + 完整文档站 + 大量测试 | 工程参考 |

## 4. 对比定位（与已调研项目）

| 维度 | Lychee | Photoview | ChronoFrame | Afilmory |
| --- | --- | --- | --- | --- |
| 后端 | PHP/Laravel | Go/GraphQL | Nuxt/Nitro | Hono/静态 |
| 前端 | Vue 3 | React 18 | Vue 3 | React 19 |
| 智能相册/星级 | ✅ | ❌ | ❌ | ❌ |
| 人脸 | ✅ 建议制 | ✅ 自动 | ❌ | ❌ |
| 水印 | ✅ | ❌ | ❌ | ❌ |
| 主色提取 | ✅ | ❌ | ❌ | 影调分析（近似） |
| 协议 | MIT | GPL-3.0 | MIT | ANL |

## 5. 对 fanphoto（CF 无服务器方案）的可借鉴点

| Lychee 设计 | 适配方案 |
| --- | --- |
| 智能相册（虚拟） | **纯 D1 SQL 查询**：OnThisDay=`strftime('%m-%d', date_taken)=today`；Recent=`ORDER BY date_taken DESC`；星级/未分类同理（v2，零成本） |
| 星级/收藏 | photos 表加 `rating INTEGER DEFAULT 0` + `favorite INTEGER`（v2 一个字段的事） |
| 主色提取 | 浏览器端 canvas `getImageData` 聚类 → 存 D1，用于相册封面/UI 主题（v2） |
| 水印 | 浏览器端上传时 canvas 打水印（v1 可做成设置开关） |
| FaceSuggestion 交互 | 不做 ML，但"机器建议+人工确认"模式可借鉴到标签建议（v2） |
| URL 导入 | v2 可用 gallery-dl 类工具抓取 + API 入库 |

**明确排除**：人脸识别（需 ML 模型）、双图像引擎（无服务器无此概念）、MySQL 运维。

## 6. 参考代码索引

| 模块 | 位置 |
| --- | --- |
| 智能相册 | `app/SmartAlbums/`（BaseSmartAlbum 基类 + 各虚拟相册实现） |
| 图片处理 | `app/Image/`（Handlers/、SizeVariant、ColourExtractor、Watermarker、PlaceholderEncoder） |
| 队列任务 | `app/Jobs/`（Import/Process/EmbedMetadata/ExtractColours/Geodecode/FaceScan） |
| 人脸模型 | `app/Models/Face.php`、`Person.php`、`FaceSuggestion.php` |
| 权限 | `app/Policies/`、`app/Models/AccessPermission.php` |
| 前端组件 | `resources/js/`（Vue 3 + 607 组件） |
