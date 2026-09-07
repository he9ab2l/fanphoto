# 开发、测试、部署与恢复

## 环境对应

| 项目     | 本地开发                                 | ten 测试部署                       |
| -------- | ---------------------------------------- | ---------------------------------- |
| Node     | 24 LTS（当前 Termux 前端工具为 Node 26） | 24.19.0                            |
| Web      | Vite :5173                               | 构建后由 Hono 静态托管             |
| API      | :8787                                    | 127.0.0.1:8787                     |
| 公开入口 | http://localhost:5173                    | https://test.heabl.xyz             |
| 数据     | 项目 data/                               | /home/ubuntu/fanphoto-next/data    |
| 配置     | 项目 .env                                | /home/ubuntu/fanphoto-next/.env    |
| 服务     | pnpm dev                                 | systemd fanphoto.service           |
| 反代     | Vite /api、/media                        | 现有 Caddy / Cloudflare DNS 与 TLS |

当前 Termux 不依赖不可用的 Sharp Android 原生包来声称后端通过：类型检查与 Web 构建可本地跑；
原片解码、集成与 Chromium 测试在 ten 的独立工作目录执行。全栈本地环境推荐 Linux / macOS。
也可将本地 8787 隧道到 ten 上独立的开发 API，再运行本地 Vite；不要把开发请求指向公开生产库。

## 初始化与数据

`pnpm setup` 新建 `.env` 和 `admin-credentials.txt`（0600），拒绝覆盖。
测试服务器初始化时设 `FANPHOTO_SETUP_DIR=/home/ubuntu/fanphoto-next`、
`APP_ORIGIN=https://test.heabl.xyz`。

| 变量                | 说明                                         |
| ------------------- | -------------------------------------------- |
| APP_ORIGIN          | 唯一站点 origin，影响 Cookie 与同源校验      |
| ADMIN_PASSWORD_HASH | scrypt 口令哈希                              |
| SESSION_SECRET      | 至少 32 字符的随机会话 / 凭据版本盐          |
| FANPHOTO_DATA_DIR   | SQLite、media、backups 所在目录              |
| FANPHOTO_ROOT       | 源码 / 发布根，寻找迁移与静态构建            |
| FANPHOTO_ENV_FILE   | 环境文件路径                                 |
| HOST / PORT         | 默认 127.0.0.1:8787                          |
| TRUST_LOCAL_PROXY   | 只对本机代理生效                             |
| NODE_ENV            | production 时关闭 localhost 开发 origin 例外 |

不要输出、提交、放入 Web 静态目录或公开传输环境文件 / 密码文件。
`source` 文件即使本身是开放许可素材，也只通过管理接口获取。

## 导入与测试

```bash
node tools/download-landscapes.mjs
pnpm photos:import --directory test-photo/commons-landscapes
pnpm typecheck
pnpm test
pnpm build
# UI 验收：人工在测试站核对（浏览器自动化已移除，见 CLAUDE.md）
```

不能用 `pnpm import` 代替 `photos:import`，前者是 pnpm 自己的锁文件命令。
目录有 manifest.json 时同时读来源 / 许可 / 原片校验和；否则导入该目录中的支持格式。
处理服务和 Web 上传完全复用，重复导入按源 SHA256 去重。

截图 / 行为验收使用真实图库：

```bash
FANPHOTO_ENV_FILE=/home/ubuntu/fanphoto-next/.env pnpm exec tsx tools/audit-photos.ts
FANPHOTO_CAPTURE_ORIGIN=http://127.0.0.1:8788 \
FANPHOTO_CREDENTIALS_FILE=/home/ubuntu/fanphoto-next/admin-credentials.txt \
node tools/capture-ui.mjs
```

密码只在服务器进程内部读取用于登录，不写入截图、报告或控制台。

## ten 清理与发布

旧部署确定为 `/home/ubuntu/fanphoto-dev`、`fanphoto-dev.service` 和 Caddy 的 FanPhoto host 分支。
服务器其他 Docker / 网站 / 数据库不是本项目，不做通用 docker prune、不删共享目录。

1. 检查旧 service 的 WorkingDirectory / PID、8787 监听、Caddy 分支、容器列表和 nginx 是否存在。
2. 新工作目录为 `/home/ubuntu/fanphoto-next/workspace`。同步排除 .git、node_modules、数据、密码、
   大原片及本地构建；在服务器用固定锁文件安装和构建。
3. 先完成类型 / API / 几何 / 真原片验证；UI 在测试站人工核验。
4. `bash deploy/cleanup-legacy.sh`：验证精确目标、保存共享配置与服务清单、停止旧服务、
   归档整个旧部署、移走旧 unit；定向替换 Caddy 分支。其他 Caddy 文本逐字校验保持不变，
   其他运行容器 ID / 镜像 / 状态前后比较。
5. `bash deploy/release.sh`：发布锁、安装、构建、单元测试、打包生产依赖、停写备份、
   原子 current 符号链接切换、systemd 重启、API 与 HTML 双健康检查。
6. 通过域名再验证 HTTPS、所有模式、详情、手机视图、原片导入结果、权限和缓存头。

发布目录：`/home/ubuntu/fanphoto-next/releases/release.*`。数据不跟着 release 移动。
Sharp / libheif 原生依赖由 pnpm deploy 随服务打包，不能只复制一份 server.mjs。
不改 Cloudflare DNS / 证书账户设置，不创建隧道或 Workers，复用现有测试域名入口。

## 备份与恢复

`pnpm backup` 使用 SQLite 在线备份 API与媒体副本，放在 data/backups/。
为了数据库与媒体在同一时刻一致，发布脚本在停写后备份；手动完整备份也应先停止服务，
备份成功后再启动。备份包含原图和私有元数据，应按私有数据处理。

新版本健康检查失败时恢复上一份新架构 release。首次部署没有前一份新 release 则停止服务，
不删除数据。数据库迁移采取可追加设计，不能用应用回滚掩盖破坏性数据迁移。

恢复备份时：停止 fanphoto.service；把当前 data 移到单独的可恢复目录；
从明确选定的备份恢复 library.sqlite 与 media；确保 ubuntu 所有权和私有权限；启动并核验数量与媒体。
不要在服务运行时覆盖 SQLite / WAL，也不要把备份还原到源码目录。

旧项目另在 `/home/ubuntu/fanphoto-archive/legacy.*` 可恢复归档。
恢复旧项目需要把 `deployment` 放回原来的 `/home/ubuntu/fanphoto-dev`、
恢复旧 unit 和已保存的 Caddyfile；这不是新应用的兼容模式。

归档 / 备份的保留和清理应按明确路径进行，不能对 `/home/ubuntu`、项目根或共享 Docker 卷做递归删除。
