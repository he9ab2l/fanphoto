# No-GL Grid 演示 · 开发记录

> 状态：**演示可用；2026-09-05 完成规范收尾，视觉参数仍可继续打磨**。

## 1. 背景与目标

基于 [`no-gl-grid-skill.md`](no-gl-grid-skill.md) 的技术方案，实现一个零依赖
（纯 DOM / JS / CSS、无 WebGL、无第三方库）的无限照片墙演示，作为照片展示站的网格方案预研。

交付物位于 [`demo/no-gl-grid/`](../demo/no-gl-grid/)：

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面骨架：舞台、网格、翻转压暗层、手电筒层、UI、加载封面 |
| `style.css` | 卡片 / 面板 / 手电筒 / UI 样式 |
| `main.js` | 全部运行逻辑：wrap → warp → inset → homography(matrix3d) |
| `images.js` | 照片清单（由脚本生成，勿手改） |
| `README.md` | 使用说明 |

## 2. 实现要点

### 渲染管线（每帧、仅可见卡片）

```text
wrap(取模无限平移) → warp(枕形弯曲 BOW + 光标高斯凸起 BULGE)
→ inset(沿邻边内缩 gap/2，恒定缝隙) → homography(单次 matrix3d)
```

- 卡片常驻 CSS Grid 流式布局，matrix3d 按屏幕坐标写角点，**需减去卡片自身流式原点**
  （`cell.left, cell.top`），否则整面墙会被放大偏移出视口。
- 手电筒：`mask-image` 径向渐变，20 级 smoothstep 取样，整像素 + 变化才写 CSS 变量。
- 翻转：角点从网格位置向视口中心方形 lerp，走同一条 inset + homography 管线；
  信息面板是卡片子元素，随 matrix3d 一起弯曲移动（`--slide` 驱动，仅翻转中的单卡每帧写）。
- 性能规则：只有视口内卡片每帧写 transform；离屏卡片一次停车写入后跳过；
  静止帧跳过全部写入；翻转中的卡片豁免停车（保证离屏点击也能回到视口中心）。

### 过程中修复的关键 bug

1. **matrix 未扣卡片流式原点** → 整面墙放大偏移出视口（表现为画面近乎全黑）。
2. **wrap 盲目映射到 `[0, max)`** → 盒子大于视口时，左/上边缘卡片被甩到周期末端，
   视口整体偏向右下角、左上角空白。修复：按「离视口最近的等价位置」取整。
3. **`#torch` 初始未隐藏** → 加载即被手电筒暗层盖住。
4. **翻转卡片被停车逻辑跳过** → 点击离屏卡片无反应。
5. **手电筒开启时翻转卡片被暗层盖住** → 观感上「点了没反应」。
   修复：翻转打开时手电筒层整体淡出（`opacity = 1 - flipE`）。
6. **stage 级 pointer capture 重定向 click 目标** → 照片点击事件到不了卡片，表现为「点了没反应」。
   修复：`pointerdown` 记录真实目标，`pointerup` 按移动距离判定轻点；拖动、捏合不触发。
7. **同一图片在无限墙中重复出现，按照片索引翻转会让多张副本一起命中**。
   修复：翻转状态改用唯一卡片实例 ID。
8. **viewport 禁用缩放，布局也只按初始宽度计算**。
   修复：允许浏览器缩放，增加内部缩放坞、Ctrl+滚轮、双指捏合、resize/visualViewport 防抖重建。

## 3. 当前参数（main.js 顶部）

| 参数 | 当前值 | skill 参考值 | 说明 |
| --- | --- | --- | --- |
| `BOW` | 0.06 | 0.15 | 调小以减少边缘外推（黑边）与缝隙观感 |
| `BULGE` | 0.16 | 0.25 | 调小避免透镜推挤产生明显缝隙 |
| `REACH` | 1.5 | 1.5 | 透镜半径（period 倍） |
| `FLIP` | 0.7 | 0.7 | 翻转尺寸 = 视口短边比例 |
| `DAMP_PAN / FLIP / CURSOR` | 0.10 / 0.12 / 0.16 | 0.1–0.14 | 阻尼 |
| `SHADE` | 0.55 | 0.7 | 翻转背景压暗 |
| `HOLE / EDGE` | 0.30×min(w,h) / hole×2.15 | — / — | 手电筒挖孔半径 / 柔边范围 |
| `GAP` | 12 | — | 卡片缝隙 |

## 4. 测试图片

- 当前 20 张：Unsplash 精选摄影图（`gallery-01.jpg` ~ `gallery-20.jpg`，宽 1800px）。
- 图源与下载记录：[`scripts/gallery-download-log.txt`](../scripts/gallery-download-log.txt)。
- 重新拉取：`powershell -File scripts/download_gallery_images.ps1`（jsDelivr/raw 双源 + JPEG 魔数校验）。
- 早期从 `drewnoakes/metadata-extractor-images`、`ianare/exif-samples` 下载的元数据测试小图
  因不适合展示已清理（下载脚本保留在 `scripts/download_test_images.ps1`，需要时可再拉）。

## 5. 验证方式

- 无头 Chrome + CDP 真实渲染 QA：[`scripts/qa-demo.mjs`](../scripts/qa-demo.mjs)
  （先启动 9222 端口的无头 Chrome，再运行脚本），输出网格 / 翻转 / 手电筒 /
  手电筒下点击翻转四张截图，校验缩放坞读数并收集 JS 报错。
- 曾用几何采样验证视口四边与四角均有卡片覆盖（黑边检测）。
- 历次 QA 均无 JS 报错；截图验证管线正确。

## 6. 当前状态与已知问题

用户实测反馈的四类问题（图标与 UI、手电筒、点击无反应、缩放适配）已在
2026-09-04 修复，2026-09-05 完成样式去重与文档收尾，真实渲染 QA 通过。
剩余打磨项：

1. **视觉参数仍是拍板值**：BOW/BULGE/GAP 的观感（弯曲强度、缝隙大小）需要
   按用户实际窗口尺寸和审美再调，必要时把参数暴露成 UI 滑杆。
2. **真实浏览器差异未覆盖**：无头 QA 不能代表真实环境的 DPR 缩放、窗口拖拽 resize
   （代际守卫逻辑未实测）、触摸设备行为、Safari 的 mask 兼容性。
3. **面板信息较简单**：目前只有文件名 + 静态描述；后续可接 EXIF 解析展示
   相机 / 参数 / GPS（与项目主线的 EXIF 调研衔接）。
4. **清单为静态生成**：增删照片需手动重跑 `node scripts/generate-demo-manifest.mjs`；
   后续正式版应改为构建期或服务端生成。
5. **测试图片来源标注**：面板 meta 未显示照片来源（Unsplash 直链在下载日志中），
   如需版权展示需补充作者信息。

## 7. 相关文档

- 技术方案：[`no-gl-grid-skill.md`](no-gl-grid-skill.md)
- 演示使用说明：[`demo/no-gl-grid/README.md`](../demo/no-gl-grid/README.md)
