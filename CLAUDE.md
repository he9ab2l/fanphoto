# FanPhoto — 项目上下文（下次开发先读这里）

相册站（user 的长期项目，会继续开发）。**fanphoto 2.0 = 全新架构，无旧版兼容层，不迁旧数据。**

## 现状（2026-09-07）
- 已上线：`https://test.heabl.xyz`（Caddod v2 → ten:127.0.0.1:8787，systemd `fanphoto.service`）
- 图库：70 张 Wikimedia Commons 真实风景原片（横 26 / 竖 14 / 方 12 / 全景 18，GPS 46 张）
- 管理端：`/studio`，密码在 ten 服务器 `/home/ubuntu/fanphoto-next/admin-credentials.txt`（600 权限，勿外泄）

## 代码与拓扑
```
~/fanphoto（本机 Termux = 开发环境，git 仓库 github.com/he9ab2l/fanphoto main）
├─ apps/client    React 19 + Vite + TS：gallery(三种照片墙) / studio(管理) / ui(token)
├─ apps/server    Node 24 + Hono：core(配置/SQLite/存储/安全) + modules(认证/媒体/图库/相册)
├─ packages/contracts   Zod 请求契约（唯一 API 事实来源，docs/api.md）
├─ scripts         dev/import/setup/build/backup
├─ deploy          release.sh(不可变发布) / caddy-config.mjs / fanphoto.service
├─ tests           node:test 单元 + Playwright 浏览器(e2e)
└─ tools           download-landscapes / audit-photos / verify-live / capture-ui 等
ten:/home/ubuntu/fanphoto-next/  服务器部署（非 git，rsync 同步 workspace）
   ├─ workspace/   最新源码（与本地保持一致）
   ├─ releases/    release.*（current → 最新，不可变）
   ├─ data/        活数据：library.sqlite + media/<UUID>/（原片+派生）+ backups（发布时自动生成）
```
数据与代码分离：发布切换不影响 data。**远程命令入口 `ssh ten`。**

## 常用命令
```bash
# 本地开发（本机只能 typecheck/build，测不了 sharp 相关）
pnpm typecheck && pnpm build
# 服务器验证与测试（sharp 有 x86_64 二进制；本地 Termux 无 android-arm64 sharp）
ssh ten 'cd /home/ubuntu/fanphoto-next/workspace && pnpm test'          # 22 项单元
ssh ten 'cd /home/ubuntu/fanphoto-next/workspace && pnpm test:e2e'      # 12 项浏览器
# 部署（自带 install→build→test→停写备份→原子切换→健康检查）
ssh ten 'cd /home/ubuntu/fanphoto-next/workspace && bash deploy/release.sh'
# 导入图片 / 验收 / 审计 / 备份
FANPHOTO_ENV_FILE=/home/ubuntu/fanphoto-next/.env pnpm photos:import   # 在 ten workspace 跑
node tools/verify-live.mjs   # 域名级验收（断言 70 张！加图需同步改）
FANPHOTO_ENV_FILE=... pnpm exec tsx tools/audit-photos.ts              # 哈希/元数据审计
svc: systemctl {start|stop|restart|status} fanphoto.service
```

## 关键约束与坑
- **本机 Termux 跑不了 sharp 测试**（android-arm64 无二进制）→ API/媒体测试必须在 ten 执行；本机只做 typecheck/build。
- **verify-live.mjs 与 acceptance 断言数量**：当前 70 张 / 280 变体，加图必须同步更新，否则发布后验收报 70≠N。
- **Wikimedia 下载**：upload.wikimedia.org 会 429 限流；Termux curl 的 `--retry` 会吞掉失败退出码（429 时 exit 0 且不写文件）→ 下载脚本已去掉 --retry 并内置指数退避；批量下载走 ten（不同 IP）更快。
- **e2e 数据独立性**：start-server.ts 用 32 张合成 fixture，与线上 70 张真实图无关；`centeredTile` 的鲁棒性修复（不要求瓷砖完全在视口内）不要回退。
- **备份策略**：release.sh 发布前自动停写备份到 data/backups/；用户已自行删过历史备份，不再额外保留快照。
- **照片证据**：docs/photo-manifest.json（70 份 SHA256/来源/许可）+ docs/photo-sources.md 署名；网页按 CC BY/CC0 署名来源。
- **旧版资源**：旧实现已在 git 历史移除（commit 4c2ed7e），归档不可恢复；不要做兼容层。

## 用户偏好
简体中文汇报、结论先行；严格模式（无兼容层、改即覆写、最小改动）；高风险破坏性操作（删数据/备份/归档）需先确认；可能授权全权委托但要求最终汇报。