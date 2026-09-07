# 架构与扩展设计

本版按全新项目开发，不迁移旧数据库，不提供旧 API / UI 兼容层。
程序版本为 2.0.0；新 HTTP 契约从 `/api/v1` 开始。

## 总体结构

```text
React 浏览器
  ├─ gallery：自然比例平铺 / 圆柱 / 球面 / 背景详情
  ├─ studio：认证 / 图库 / 上传 / 编辑 / 相册 / 设置
  └─ ui：Base UI + MingCute + 共享主题
           │ 同源 /api/v1 与 /media/photos
           ▼
Caddy HTTPS → Hono HTTP 装配
  ├─ AuthService       会话、CSRF、同源验证与登录限速
  ├─ SettingsService   站点公开投影和管理设置
  ├─ PhotoRepository   分页、过滤、序列化、相册和邻接照片
  ├─ GalleryService    修改、批量、回收站、永久删除、相册
  └─ IngestService     有界处理队列、幂等、图片管线、扩展钩子
           │                         │
           ▼                         ▼
     SQLite WAL                ObjectStore 接口
                                     │
                              FileStore（当前实现）
```

`apps/server/src/app.ts` 只负责 HTTP、安全响应头、校验和路由装配。处理、存储与数据库逻辑
在服务层，CLI 导入复用同一 `IngestService`，不是单独写一套入库脚本。

## 前端

- React 19 + Vite + TypeScript；React Router 使用背景路由，让详情打开时原照片墙保持挂载。
- TanStack Query 管理服务端数据、取消旧查询、游标与更新失效；界面偏好独立存于 localStorage。
- gallery / studio / 大型交互按入口懒加载；没有地图、旧查看器、客户端 HEIC/TIFF 解码器等遗留负担。
- Base UI 负责按钮、弹层、选择、开关、滑块、复选框与焦点；不手写焦点陷阱。
- React Bits Masonry / DomeGallery / GlassSurface 的适配见 `ui-resources.md` 和 `vendor/NOTICE.md`。
- MingCute 是唯一图标体系；不请求远程图标 CDN，不手画图标。
- 所有公开与管理页面共享黑白灰 token、系统字体、安全区、明 / 暗 / 系统主题和交互反馈。

### 照片墙

平铺用最短列布局，尺寸来自服务器元数据。宽高比严格保持，全景可以跨列；
图片使用 `object-fit: contain`，不是正方形裁切。列表末尾的 IntersectionObserver 触发下一页。

圆柱和球面将真实比例的矩形图片放置在内侧曲面的切平面上；圆柱只有水平曲率，球面加入
垂直曲率，不对照片内部做网格拉伸。虚拟列 / 行周期支持正反方向循环探索。
Pointer / wheel 输入由成熟手势库管理，惯性与每帧 transform 在 ref 中，React 只更新粗粒度窗口。
停止、隐藏标签页、打开详情、卸载后均不保留空转循环；减少动态时禁用惯性。

`geometry.ts` 是可测试的纯几何层，覆盖横、竖、方、超宽、不同视口 / 密度、负坐标与大范围循环。

### 详情与工作室

详情使用 Base UI Dialog：桌面左图右信息，小屏重排上下。图像区不叠加标题、按钮或水印；
工具位于独立页头 / 页脚；背景墙通过静态模糊、透明遮罩与外边距保留。
信息默认展开，收起后图像区扩大。关闭恢复触发照片的焦点与原浏览位置。

上传队列不在浏览器解码原图。浏览器只发送文件、展示真实上传进度；上传完成后显示
“服务器处理中”，收到结果才标记完成。失败可使用同一幂等键重试；暂停只暂停后续队列。
原图预览使用服务器生成的缩略图，避免一次解码几十张大原图消耗手机内存。

## 媒体处理

```text
原始文件
  → 文件大小 / 签名检查
  → Sharp 解码与像素限制
  → exifr 提取真实 EXIF / XMP / IPTC
  → 方向校正、sRGB、四档清洁 WebP、ThumbHash 与图像统计
  → 受信任的命名空间扩展钩子
  → 原子文件写入
  → 数据库事务提交照片 / assets / 标签 / 相册 / extensions / ingest 记录
```

- 原文件上限 50 MiB，HTTP 上传上限 52 MiB，像素总量上限 8000 万。
- JPEG / PNG / WebP / AVIF / TIFF 由 Sharp 处理；HEIC 用 libheif 解码器兜底。
- 同一服务进程一次解码一张，最多两项等待；满队列返回 `503 PROCESSOR_BUSY`。
- `sm` 400、`md` 800、`lg` 1600，最长边限制且不放大。
- `original` 是完整尺寸的清洁 WebP，因 WebP 格式限制最长边最多 16380；
  `source` 是不改动字节的输入原文件，独立私有存储。两者不是同一个概念。
- 公开派生图去除嵌入 EXIF / GPS，原文件只通过认证端点下载。
- 开启位置擦除时，坐标 / 地点为空且不保留可能包含 GPS 的原文件；仍保存清洁高清副本。
- EXIF 严格白名单，不公开序列号 / MakerNote。未知值保持空，不编造镜头、ISO、地点或日期。
- 没有时区的拍摄时间保留 `capturedLocal`，公开 `capturedAt` 为 null；
  数据库仅用其本地时间的 UTC 数值作排序替代，绝不把它宣传成真实 UTC 拍摄时间。
- 内容 SHA256 去重，客户端 UUID 幂等键拒绝用于不同文件。磁盘写失败回滚，不出现半张图库记录。
- 服务启动把中断的处理记录标为失败；重试重新检查源哈希，可安全恢复。

## 数据模型

| 表                    | 责任与关键约束                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| photos                | UUID、内容字段、拍摄字段、EXIF/分析 JSON、公开/精选/软删除、原文件描述、唯一源哈希、时间戳 |
| assets                | 照片 + variant 复合主键，存储 key 唯一，每份文件的 MIME、尺寸、字节、SHA256                |
| tags / photo_tags     | 规范化标签与多对多关系，按 tag 索引                                                        |
| albums / album_photos | 相册与多对多成员，预留 position 顺序                                                       |
| extensions            | 照片 + namespace 复合主键、独立 schema_version、受限 JSON                                  |
| ingest_events         | 幂等来源、状态、错误码、开始/结束时间，支持处理追踪                                        |
| settings              | 经过共享 schema 校验的站点 JSON                                                            |
| sessions              | 随机令牌的哈希、CSRF、凭据版本、过期时间                                                   |
| auth_attempts         | 持久化登录限速                                                                             |
| schema_versions       | 迁移名、校验和、应用时间；已应用迁移不允许被悄悄修改                                       |

SQLite 开启 WAL、外键和 busy timeout；SQL 全部参数绑定。公开过滤先限定
`is_public=1 AND deleted_at IS NULL`，再做查询。日期 + UUID 双键分页不依赖不稳定的 OFFSET，
游标绑定筛选与排序。匿名媒体读取同样先检查可见性，再处理 ETag。

## 安全与隐私边界

- 管理员密码使用 scrypt；会话令牌仅保存 SHA256，HttpOnly + SameSite + HTTPS Secure Cookie。
- 写操作要求会话、CSRF 和同源校验；错误登录按来源限速，凭据改变后旧会话自然失效。
- 服务只绑定回环地址，由 Caddy 入口提供 HTTPS；只信任本机代理链的最后一段来源。
- CSP、禁止嵌入、nosniff、明确 MIME、路径白名单；用户文件名不参与存储路径。
- 原文件、数据库、密码、环境文件不放在 Web 静态目录，不允许通过 SPA fallback 读取。
- API `no-store`；媒体 `private, no-cache`，避免撤回公开后仍被代理作为公开缓存提供。
- “隐藏位置”作用于结构化字段及地点字段搜索，不自动改写标题 / 描述，也不能改变照片本身的地理线索。
- 下载开关不是 DRM；访客已经看见的预览无法防止截图或另存。
- 当前为测试环境，HTML 与响应都设置 noindex。

## 扩展与未来兼容

不是兼容旧项目，而是给这份新契约留出正常迭代路径：

1. `/api/v1` 只做加法兼容：新增可选字段 / 新端点，现有字段的意义和类型不改。
   破坏性变化使用 `/api/v2`，不要按客户端版本隐式猜测。
2. 增量 SQL 迁移按序、事务和校验和执行；不编辑已应用文件。
3. `MediaModule` 接收照片 ID、清洁预览字节、源尺寸与只读 EXIF，返回限长的命名空间数据。
   例如 `ai.labels`、`camera.recipe`。模块由服务器代码显式注册，不执行上传的脚本。
4. 扩展 JSON 默认不公开。新增公开功能必须定义自己的 schema / 权限 / 投影，
   不能直接把整张 extensions 表透传给访客。
5. 分享可新增 token_hash / 权限 / expires_at 表；评论可新增审核状态和索引；
   AI 标签可写独立模型版本 / 置信度，再由显式操作加入人工标签，不覆盖来源事实。
6. 对象存储替换只需实现 ObjectStore，图库不拼绝对磁盘路径。
   多进程大批量处理时可把 ingest 队列迁移为持久任务 worker，HTTP 契约与照片 ID 保持。

目前没有虚假的评论、AI 标注或私有分享按钮；扩展位置真实存在，但未实现功能不冒充已上线。
