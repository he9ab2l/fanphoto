# API v1

所有 JSON 接口前缀 `/api/v1`。旧 `/api/photos`、`/api/auth/*` 等不提供兼容。
契约来源：`packages/contracts/src/index.ts`。

较大的 JSON 响应按 `Accept-Encoding` 压缩，字段契约不变且仍为 `no-store`。
媒体授权在 ETag 判断之前执行；撤回公开后的缓存请求同样不能绕过可见性检查。

错误响应统一为 `{ "error": { "code": "...", "message": "..." } }`，同时返回相应 HTTP 状态。
不要只判断 HTTP 200；上传新建为 201，重复导入为 200。

## 公开与认证

| 方法   | 路径                 | 返回 / 用途                                                  |
| ------ | -------------------- | ------------------------------------------------------------ |
| GET    | /health              | ok、程序版本、API 版本、存储后端                             |
| GET    | /site                | 公开设置投影、数量、公开标签                                 |
| GET    | /photos              | `{ items, page: { nextCursor, total, limit } }`              |
| GET    | /photos/:id          | `{ photo, neighbors: { previous, next } }`，可传相同筛选条件 |
| GET    | /albums              | `{ items }`，只含有公开照片的相册                            |
| GET    | /photos/:id/download | 清洁高清 WebP；受下载开关限制                                |
| GET    | /session             | authenticated；登录后另有 csrfToken、expiresAt               |
| POST   | /session             | `{ password }`，创建 Cookie 会话                             |
| DELETE | /session             | 退出并撤销会话，需要 CSRF                                    |

图库查询参数：

| 参数        | 合法值                                                     |
| ----------- | ---------------------------------------------------------- |
| q           | 最多 160 字，标题 / 描述 / 相机 / 标签；地点仅在允许时参与 |
| tag         | 单一标签                                                   |
| album       | 相册 UUID                                                  |
| orientation | all / landscape / portrait / square / panorama             |
| favorite    | true / false                                               |
| sort        | newest / oldest                                            |
| limit       | 1–80，默认 24                                              |
| cursor      | 服务器返回的不透明游标，必须配原筛选 / 排序使用            |

宽高比分类：竖幅 <0.85，方图 0.92–1.08，全景 ≥2.4，横幅 >1.15 且 <2.4。
不属于这些细分区间的照片仍在“所有比例”出现，不改变照片真实比例。

公共图片地址为 `/media/photos/:id/:variant?v=<checksum>`，不在 API 前缀内。
variant 为 sm / md / lg / original；不允许 source。元数据提供实际派生尺寸，用于 srcset。
媒体先验证公开 / 回收状态，之后才考虑条件缓存，返回 ETag 和 `private, no-cache`。

## 管理

下列接口均需要有效会话；非 GET / HEAD 方法还需要 `X-CSRF-Token`，跨站写入被拒绝。

| 方法         | 路径                        | 用途                                                                          |
| ------------ | --------------------------- | ----------------------------------------------------------------------------- |
| GET          | /admin/stats                | 总量、公开、私密、精选、回收站、存储、相册                                    |
| GET          | /admin/photos               | 同图库参数，另支持 status=all/public/private/trash，返回完整管理投影          |
| GET          | /admin/photos/:id           | 完整详情与私有 extensions                                                     |
| PATCH        | /admin/photos/:id           | 编辑完整 PhotoEdit 表单：标题、描述、地点、tags、albumIds、isPublic、favorite |
| DELETE       | /admin/photos/:id           | 移入回收站                                                                    |
| DELETE       | /admin/photos/:id/permanent | 只接受已在回收站中的照片；永久删除文件与关联记录                              |
| POST         | /admin/photos/actions       | ids 最多 100，action、可选 albumId                                            |
| POST         | /admin/uploads              | multipart 原片上传，见下                                                      |
| GET          | /admin/photos/:id/source    | 原始文件，仅管理员，强制 attachment                                           |
| GET/POST     | /admin/albums               | 列出 / 新建相册                                                               |
| PATCH/DELETE | /admin/albums/:id           | 编辑 / 删除相册，删除相册不删除照片                                           |
| GET/PATCH    | /admin/settings             | 读取 / 保存设置                                                               |
| GET          | /admin/modules              | 已注册模块名与数据版本                                                        |
| GET          | /admin/imports              | 最近 100 次处理状态                                                           |
| GET          | /admin/export               | schemaVersion=1 的私有元数据 / 资源 / 关系导出                                |

批量 action：trash、restore、publish、unpublish、favorite、unfavorite、add-to-album。
`add-to-album` 必须传真实相册 UUID。无效 ID / 相册在写入前拒绝。

### 上传

multipart 有两个字段：

- `file`：原文件，不传浏览器生成的缩略图。
- `options`：JSON，包含必填 clientId（UUID）和可选 title、description、location、tags、
  albumIds、isPublic、favorite、stripLocation、attribution。

attribution 为 `{ author, sourceUrl, license, licenseUrl }`，URL 只允许 HTTP(S)。
宽高、EXIF、源哈希和所有派生图由服务器产生；伪造这些字段的请求被拒绝。
成功返回 `{ photo, duplicate }`。同一 clientId 只能对应同一源文件；原内容已存在时不重复入库。

50 MiB 原文件、8000 万像素、最多两项等待。超限 413，无法解码 415，
幂等键冲突 409，忙碌 503 并附 Retry-After。失败可使用同一个 clientId 安全重试。

### 照片字段语义

- width / height：方向校正后的展示图尺寸。
- file.width / height / bytes / mime：原文件描述，不是缩略图大小。
- file.name、file.originalAvailable：只有管理投影提供原文件可取信息。
- capturedLocal：文件记录的拍摄本地时间；capturedOffset：真实记录的时区或 null。
- capturedAt：有明确时区才返回 UTC 时间；否则 null，不猜测。
- exif：白名单字段，未知值不生成；API 不公开序列号、MakerNote 或嵌入 GPS。
- latitude / longitude / location：受站点位置设置控制。
- assets：每档的 URL、实际宽高与字节数。
- Source 下载与 original 展示图不同：前者是私有输入字节，后者是去元数据的高清 WebP。

回收、撤回公开、登录状态变化都由服务器判断，客户端隐藏按钮不是权限控制。
