# gallery-dl 工具调研（批量下载 / 测试素材）

> 状态：调研完成。参考代码 clone 于 `~/tmp/afilmory-research/gallery-dl`（mikf/gallery-dl，master）。
> 定位：**素材获取工具**（非照片站参考）。用于批量拉取测试照片，验证 fanphoto 的
> 浏览器端处理管线（HEIC/RAW 混合、EXIF、缩略图）；其 extractor 插件架构对 v2 多图源导入有参考价值。
> 注意：开发已迁往 Codeberg（GitHub 仓库仍同步）。

## 1. 项目概览

| 项 | 值 |
| --- | --- |
| 定位 | 通用批量图片下载器（命令行） |
| 协议 | GPL-2.0 |
| 规模 | 7999 commits，v1.32.11；312 个 Python 模块，支持 **258 个站点** |
| 语言 | Python 3.8+（核心依赖仅 Requests） |
| 安装 | `pip install -U gallery-dl` |
| 文档 | https://gdl-org.github.io/docs/ |

## 2. 核心架构（extractor 插件模式）

```
gallery_dl/
├── extractor/    # 258 个站点适配器，每站一模块（继承 Extractor 基类）
├── downloader/   # 下载器（http / ytdl / HLS）
├── job.py        # 任务编排：URL → extractor → downloader → 落盘
├── formatter.py  # 文件名模板引擎（{artist}/{title}/{id}.{ext}）
├── config.py     # 分层配置（CLI > 配置文件 > 默认）
└── archive.py    # 归档：记录已下载 URL，断点续传/去重
```

设计核心：站点适配器只负责"URL → 媒体链接 + 元数据"，下载/命名/去重/归档由公共框架
统一处理。新增站点 = 写一个继承 `Extractor` 的模块。

## 3. 优点

1. **站点覆盖极广 + 插件化**：258 个适配器，新增成本极低
2. **文件名模板**：`-o` 支持 `{artist}/{title}_{id}.{extension}` 占位符，按来源自动归档
3. **断点续传**：archive 记录已下载 URL，重跑只拉新内容
4. **认证**：`--cookies-from-browser`、OAuth（Pixiv/Twitter 等）、代理
5. **健壮性**：重试、限速、按站点细粒度配置（gallery-dl.conf）

## 4. 对 fanphoto 的用途

### 4.1 批量获取测试照片（合规源）

```bash
pip install gallery-dl
gallery-dl -d ~/fanphoto/test-photo 'https://unsplash.com/s/photos/landscape'
gallery-dl -d ~/fanphoto/test-photo 'https://www.pexels.com/search/mountain/'
gallery-dl -d ~/fanphoto/test-photo 'https://commons.wikimedia.org/wiki/Category:...'
```

用途：构建**混合格式测试集**（JPEG/HEIC/RAW/PNG/WebP），验证浏览器端转码/EXIF/
缩略图管线。比手写脚本强在：多源、自动命名、断点续传、可指定格式/尺寸。
**合规边界**：只用允许下载的源（Unsplash/Pexels/Wikimedia），避开付费墙/版权站点。

### 4.2 v2 多图源导入参考

其 extractor 插件模式与"从 Flickr/Pixiv 抓图入库"的 v2 功能同构：
- 每个图源一个适配器，统一输出"媒体链接 + 元数据"
- 下载/去重/命名由公共层处理
- fanphoto v2 可借鉴该分层：`importers/` 目录 + 统一 ImportService

## 5. 参考代码索引

| 模块 | 位置 |
| --- | --- |
| Extractor 基类 | `gallery_dl/extractor/common.py` |
| 站点适配器示例 | `gallery_dl/extractor/unsplash.py`、`flickr.py`、`pixiv.py` |
| 下载器 | `gallery_dl/downloader/common.py` |
| 任务编排 | `gallery_dl/job.py` |
| 文件名模板 | `gallery_dl/formatter.py` |
| 归档/续传 | `gallery_dl/archive.py` |
