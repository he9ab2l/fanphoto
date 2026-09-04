# EXIF 元数据解析库选型参考

> 用途：图片展示/上传网站开发时，选择解析照片 EXIF、IPTC、XMP 等元数据的库。
> 最后更新时间：2026-09-03

## 速览对比表

| 项目 | 语言 | Stars | 最后提交 | npm周下载 | 许可证 | 定位 |
|------|------|------:|---------|----------:|--------|------|
| [ExifTool](https://github.com/exiftool/exiftool) | Perl | 5002 | 2026-05 | - | GPL-3.0 | 业界标准，功能最强，全格式读写 |
| [metadata-extractor](https://github.com/drewnoakes/metadata-extractor) | Java | 2828 | 2026-07 | - | Apache-2.0 | JVM 生态首选，支持 EXIF/IPTC/XMP/ICC |
| [exifr](https://github.com/MikeKovarik/exifr) | JavaScript | 1247 | 2024-03 | 200万 | MIT | JS 最快最全，浏览器/Node 均可 |
| [exif-py (exifread)](https://github.com/ianare/exif-py) | Python | 965 | 2026-06 | - | BSD-3-Clause | 纯 Python 轻量读取，零依赖 |
| [go-exif](https://github.com/dsoprea/go-exif) | Go | 587 | 2024-04 | - | MIT | Go 完整读写，标准驱动 |
| [exiftool-vendored.js](https://github.com/photostructure/exiftool-vendored.js) | TypeScript | 557 | 2026-08 | 13.3万 | MIT | Node 封装 ExifTool 二进制 |
| [libexif](https://github.com/libexif/libexif) | C | 374 | 2026-08 | - | LGPL-2.1 | C 语言经典库 |
| [ExifGlass](https://github.com/d2phap/ExifGlass) | C# | 301 | 2026-07 | - | GPL-3.0 | 桌面元数据查看工具（非库） |
| [kamadak/exif-rs](https://github.com/kamadak/exif-rs) | Rust | 258 | 2025-10 | - | BSD-2-Clause | Rust 纯解析库 |
| [exif-parser](https://github.com/bwindels/exif-parser) | JavaScript | 229 | 2021-09 | - | MIT | 轻量 JS（已停更，不推荐） |
| [imagemeta](https://github.com/evanoberholster/imagemeta) | Go | 165 | 2026-08 | - | MIT | Go 支持 RAW/HEIC/AVIF |
| [TinyEXIF](https://github.com/cdcseacave/TinyEXIF) | C++ | 147 | 2026-08 | - | 不明(Other) | 轻量 C++（许可证不明确⚠️） |

> 数据来源：GitHub API（2026-09-03 查询）

## 详细说明

### 1. ExifTool —— 业界标准、最强
- **语言**：Perl，命令行工具
- **优势**：支持格式最全（EXIF/IPTC/XMP/ICC/GPS/视频/音频/RAW），可读可写，全平台
- **劣势**：需调用外部进程（性能开销），GPL-3.0 许可证对商业闭源项目不友好
- **适用**：需要最强兼容性的构建期/后台批处理；作为所有其他语言的"兜底"

### 2. metadata-extractor —— Java 首选
- **语言**：Java，纯库
- **优势**：功能全面（EXIF+XMP+IPTC+ICC+视频），Apache-2.0 宽松，维护活跃
- **适合**：Spring Boot 等 JVM 后端，读取复杂格式元数据

### 3. exifr —— JS 生态首选、最快
- **语言**：JavaScript，浏览器 + Node 双端
- **优势**：速度最快、支持 JPEG/TIFF/PNG/HEIC/WebP、可按需 tree-shaking 加载 codec、200 万周下载
- **注意**：2024-03 后无新提交，但成熟稳定
- **适合**：前端在浏览器直接读本地图片元数据；Node 端轻量解析

### 4. exif-py (exifread) —— Python 轻量读取
- **语言**：Python，纯库零依赖，pip 安装 `exifread`
- **优势**：简单易用，支持 JPEG/TIFF/PNG/WebP/HEIC/RAW，BSD 许可友好
- **适合**：Python 脚本、快速验证、Django/FastAPI 待定（性能一般）

### 5. go-exif · imagemeta —— Go 生态
- **go-exif**：读写完整、标准驱动，但 2024-04 后不活跃
- **imagemeta**：性能优先，支持 JPEG/HEIC/AVIF/TIFF/RAW 与 XMP，维护活跃（2026-08）
- **适合**：Go 后端，优先 imagemeta

### 6. exiftool-vendored.js —— Node 最强封装
- **语言**：TypeScript，npm 包捆绑 ExifTool 二进制
- **优势**：Node 里直接获得 ExifTool 全部能力，跨平台，13.3 万周下载
- **劣势**：依赖外部二进制，初次安装体积大、启动慢
- **适合**：Node 服务端需要支持 HEIC/RAW 等复杂格式时

### 7. libexif —— C 经典
- **语言**：C，LGPL-2.1
- **适合**：嵌入式、桌面原生应用、对依赖轻量的 C/C++ 项目

### 8. kamadak/exif-rs —— Rust
- **语言**：Rust，纯解析，BSD-2-Clause
- **优势**：无外部依赖，安全高性能
- **适合**：Rust web 服务 / CLI 工具

### 9. TinyEXIF —— 轻量 C++
- **语言**：C++ 头文件库，JPEG 专用
- **风险**：许可证为 NOASSERTION/Other，不明确，商用需谨慎

### 10. exif-parser —— 已停更
- 2021-09 后无更新，功能弱于 exifr，**新项目不推荐选它**

### 11. ExifGlass —— 桌面查看工具
- 不是库，是 C# 编写的跨平台桌面 EXIF 查看软件；如有桌面查看需求可参考

## 选型决策（按技术栈）

| 我的技术栈 / 场景 | 推荐 |
|-------------------|------|
| 前端浏览器直接读取（拖拽上传即显示） | **exifr** |
| Node.js 服务端、格式简单（JPEG/PNG） | **exifr** |
| Node.js 服务端、格式复杂（HEIC/RAW/视频） | **exiftool-vendored.js** |
| Java / Spring Boot 后端 | **metadata-extractor** |
| Python 后端 / 脚本 | **exif-py (exifread)** |
| Go 后端 | **imagemeta** |
| Rust 后端 | **kamadak/exif-rs** |
| 需要最强兼容性的批处理/构建期 | **ExifTool** 命令行 |
| C/C++ 嵌入式 | **libexif** |

## 使用注意
1. **维护风险**：exifr、go-exif、exif-parser 近年更新缓慢，选型时以"能满足当前需求"为准，不必追新。
2. **性能**：浏览器端优先 exifr（快、可 tree-shaking）；服务端优先原生库（metadata-extractor / imagemeta / exif-rs）。
3. **许可证**：商业闭源项目避免 ExifTool(GPL)、TinyEXIF(不明)、ExifGlass(GPL)；优先 MIT / Apache / BSD。
4. **展示网站落地**：上传时在服务端抽一次元数据存入数据库（含 GPS 坐标、时间、设备型号、镜头），后续列表/详情页直接查库，不要在每次请求时现场解析图片。
