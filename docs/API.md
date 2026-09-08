# API v1

所有 JSON 接口前缀 `/api/v1`。旧 `/api/photos`、`/api/auth/*` 等不提供兼容。
契约来源：`packages/contracts/src/index.ts`（唯一 API 事实来源）。

较大的 JSON 响应按 `Accept-Encoding` 压缩；字段契约不变，且仍为 `no-store`。
媒体授权在 ETag 判断之前执行；撤回公开后的缓存请求同样不能绕过可见性检查。

错误响应统一为 `{ "error": { "code": "...", "message": "..." } }`，同时返回相应 HTTP 状态。
不要只判断 HTTP 200：上传新建为 201，重复导入为 200，验证失败为 400，未授权 401，越权 403，
缺失 404，超限 413，服务端错误 500。常见错误码见文末。

## 公开与认证

| 方法   | 路径                  | 返回 / 用途                                                  |
| ------ | --------------------- | ------------------------------------------------------------ |
| GET    | /health               | `{ ok, version, apiVersion, storage }`；连接数据库做探活      |
| GET    | /site                 | 公开设置投影、数量、公开标签（`SiteInfo`）                    |
| GET    | /photos               | `{ items, page: { nextCursor, total, limit } }`               |
| GET    | /photos/:id           | `{ photo, neighbors: { previous, next } }`，可传相同筛选条件  |
| GET    | /albums               | `{ items }`，只含有公开照片的相册                            |
| GET    | /photos/:id/download  | 清洁高清 WebP（`original` 变体），受下载开关限制              |
| GET    | /session              | `{ authenticated }`；登录后另有 csrfToken、expiresAt          |
| POST   | /session              | `{ password }`，创建 Cookie 会话                             |
| DELETE | /session              | 退出并撤销会话，需要 CSRF                                    |

图库 / 列表查询参数（`listSchema`）：

| 参数        | 合法值                                                     |
| ----------- | ---------------------------------------------------------- |
| q           | 最多 160 字，标题 / 描述 / 相机 / 标签；地点仅在允许时参与 |
| tag         | 单一标签（最多 40 字）                                       |
| album       | 空白或相册 UUID                                             |
| orientation | all / landscape / portrait / square / panorama             |
| favorite    | true / false                                               |
| sort        | newest / oldest                                            |
| status      | all / public / private / trash（仅 /admin/photos 生效）     |
| limit       | 1–80，默认 24                                              |
| cursor      | 服务器返回的不透明游标，必须配原筛选 / 排序使用            |

宽高比分类：竖幅 <0.85，方图 0.92–1.08，全景 ≥2.4，横幅 >1.15 且 <2.4。
不属于这些区间的照片仍出现在“所有比例”，不改变照片真实比例。

公共图片地址为 `/media/photos/:id/:variant?v=<checksum>`，位于 API 前缀之外。
variant 为 sm / md / lg / original；不允许 source。元数据提供实际派生尺寸，用于 srcset。
媒体先验证公开 / 回收状态，再考虑条件缓存；命中 `If-None-Match` 返回 304，否则返回
ETag、`private, no-cache` 和实际内容。`original` 变体受下载开关限制（管理员不受限）。

## 管理接口

下列接口均需要有效会话；非 GET / HEAD 方法还需要 `X-CSRF-Token`，跨站写入被拒绝。
会话通过 HttpOnly + Secure + SameSite=Lax Cookie 携带，登录另做限速。

| 方法         | 路径                        | 用途                                                        |
| ------------ | --------------------------- | ------------------------------------------------------------ |
| GET          | /admin/stats                | 总量 / 公开 / 私密 / 精选 / 回收站 / 存储 / 相册（`LibraryStats`） |
| GET          | /admin/photos               | 同图库参数，另支持 status=all/public/private/trash，返回完整管理投影 |
| GET          | /admin/photos/:id           | 完整详情 + 私有 `extensions`                                 |
| PATCH        | /admin/photos/:id           | `{ photo }`；编辑标题、描述、地点、tags、albumIds、isPublic、favorite |
| DELETE       | /admin/photos/:id           | 移入回收站                                                    |
| DELETE       | /admin/photos/:id/permanent | 只接受已在回收站中的照片；永久删除文件与关联记录             |
| POST         | /admin/photos/actions       | ids 最多 100；action ∈ trash/restore/publish/unpublish/favorite/unfavorite/add-to-album；可选 albumId |
| POST         | /admin/uploads              | multipart 原片上传，见下                                        |
| GET          | /admin/albums               | `{ items }`；包含空相册与私密照片                            |
| POST         | /admin/albums               | `{ album }`（201）；title 1–100 字，description ≤1000 字       |
| PATCH        | /admin/albums/:id           | `{ album }`；重命名 / 改描述                                  |
| DELETE       | /admin/albums/:id           | `{ ok }`；删除相册（不删照片）                               |
| GET          | /admin/settings             | `{ settings }`；站点完整设置                                  |
| PATCH        | /admin/settings             | `{ settings }`；保存站点设置（SiteSettings）                 |
| GET          | /admin/modules              | `{ items: [{ namespace, version }] }`；图片处理扩展模块       |
| GET          | /admin/imports              | `{ items }`；最近 100 条导入事件（状态 / 错误码 / 起止时间）  |
| GET          | /admin/export               | 附件 `fanphoto-catalog.json`；站点设置 + 照片/资源/标签/相册/扩展全量导出 |
| GET          | /admin/photos/:id/source    | 原始上传文件，仅管理员，强制 attachment                      |

### 原片上传

`POST /admin/uploads` 为 `multipart/form-data`：

- `file`：原始照片文件（扩展名 / MIME 由 magic byte 判定，限制 50 MB 源、8000 万像素）。
- `options`：JSON 字符串，等价 `uploadSchema`（`clientId`、`title`、`description`、
  `location`、`tags`、`albumIds`、`isPublic`、`favorite`、`stripLocation`、`attribution`）。

响应：新建返回 201，按源文件 SHA256 查重后的重复导入返回 200；字段结构一致。
处理为有界队列，处理器忙时返回 `PROCESSOR_BUSY`（503，附 `Retry-After`）。

### 错误码

| code                 | 含义                                                       |
| -------------------- | ---------------------------------------------------------- |
| VALIDATION           | Zod 校验失败（400），message 为前 3 条 issue 拼接           |
| INVALID_JSON         | 请求体不是有效 JSON                                         |
| NOT_FOUND            | 资源 / 页面不存在（404）                                   |
| UNAUTHORIZED         | 需要登录（401）                                            |
| INVALID_PASSWORD     | 密码错误（401）                                            |
| RATE_LIMIT           | 登录尝试过多（429，15 分钟冷却）                           |
| ORIGIN               | Origin 不符，拒绝跨站（403）                               |
| CSRF                 | 会话安全令牌缺失 / 不符（403）                             |
| DOWNLOAD_DISABLED    | 作者未开放下载（403）                                      |
| ALBUM_REQUIRED       | 批量加入相册未给 albumId（400）                            |
| NOT_IN_TRASH         | 永久删除前必须先移入回收站（409）                          |
| IDEMPOTENCY_CONFLICT | 同一 clientId 对应了不同文件（409）                        |
| PHOTO_IN_TRASH       | 目标照片在回收站中，需先恢复（409）                        |
| BODY_LIMIT           | 请求体超限（413）                                          |
| INVALID_UPLOAD       | 上传表单结构错误                                           |
| FILE_REQUIRED        | 未选择文件                                                 |
| INVALID_OPTIONS      | 上传 options 解析失败                                     |
| PROCESSOR_BUSY       | 处理队列满（503，附 Retry-After）                          |
| MODULE_DATA_LIMIT    | 扩展模块元数据超限（500）                                  |
| SETUP_REQUIRED       | 尚未初始化环境（503，先 pnpm setup）                       |
| CLIENT_NOT_BUILT     | 客户端尚未构建（503）                                      |
| INTERNAL             | 服务端内部错误（500），详情只写服务端日志                  |