# No-GL Grid 演示 · 无限照片墙

纯 DOM / JS / CSS 实现的**零依赖无限照片墙**，完整实现 [`docs/no-gl-grid-skill.md`](../../docs/no-gl-grid-skill.md) 描述的管线：

`wrap(取模无限平移) → warp(枕形弯曲 + 光标凸起) → inset(恒定缝隙) → homography(matrix3d)`

## 打开方式

直接双击 `index.html` 即可（`file://` 可用，无跨域限制），或用任意静态服务器：

```bash
npx serve demo/no-gl-grid
```

## 操作

| 操作 | 效果 |
| --- | --- |
| 拖拽 / 滚轮 / 方向键 / 空格 / Shift+空格 | 无限平移 |
| 轻点照片 | 翻转放大 + 信息面板；再次轻点、关闭按钮、Esc 或空白处关闭 |
| 底部缩放坞 / Ctrl+滚轮 / 双指捏合 / + - 0 | 缩放或回到 100% 适配尺寸 |
| 手电筒按钮或 T | 切换聚光透镜（mask-image + smoothstep 暗场） |
| 回到中心按钮 | 复位视角并关闭翻转 |

## 图片清单

照片放在项目根 `test-photo/`，由清单脚本生成
`images.js`。新增/删除照片后重新生成：

```bash
node scripts/generate-demo-manifest.mjs
```

图源记录在 [`scripts/gallery-download-log.txt`](../../scripts/gallery-download-log.txt)（Unsplash 直链）。
重新拉取高清图：`powershell -File scripts/download_gallery_images.ps1`。

## 当前状态

演示已重构为暗色玻璃 UI 与 MingCute 风格线性 SVG 图标（零运行时依赖），包含底部缩放坞、
视口自适应重建、轻点照片放大和重新设计的手电筒。剩余视觉参数可在
[docs/no-gl-grid演示开发记录.md](../../docs/no-gl-grid演示开发记录.md) 中继续调整。

## 冒烟测试

```bash
# 先启动无头 Chrome（9222 端口），再执行：
node scripts/qa-demo.mjs
```

脚本会真实渲染页面并输出网格 / 翻转 / 手电筒 / 手电筒下点击翻转四张截图到 `demo/_qa-*.png`，同时校验缩放坞读数并收集 JS 报错。
