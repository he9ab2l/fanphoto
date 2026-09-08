# 《FanPhoto Glass Engine Architecture》

依据 `FanPhoto 项目前端重构.md` 制定。目标：把全站玻璃从「CSS 背景+一个 SVG 位移滤镜」升级为
统一的 **Material Engine + Optical Glass Renderer + Dynamic Environment System + Spring Interaction
System**，最终观感接近 Apple Photos / iOS 26 Liquid Glass / visionOS，而不是网页图库。

## 1. 新架构图

```text
┌─────────────────────────── Glass Engine ───────────────────────────┐
│                                                                    │
│  <GlassSurface material="…" tint="auto" interactive refractive />  │
│        │       （React 接口，唯一入口，所有玻璃组件经由它）          │
│        ▼                                                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ GlassMaterial.ts   5 档材质（ultraThin/thin/regular/thick/   │  │
│  │                    ultraThick）× opacity/blur/saturation/     │  │
│  │                    brightness/tint/shadow/rim/refraction      │  │
│  │                    → 输出 CSS 变量 token（单一事实来源）       │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│                  ▼                                                 │
│  ┌───────────────┴──────────────────────────────────────────────┐  │
│  │ GlassRenderer.ts  渲染策略选择（能力闸门 + 面积预算）          │  │
│  │   CSS 毛玻璃（默认/回退）                                     │  │
│  │   ├─ SVGGlassRenderer   折射（Chromium backdrop url 增强）    │  │
│  │   └─ WebGLGlassRenderer 折射（仅 hero 面板，PhotoDialog）     │  │
│  └───────────────┬──────────────────────────────────────────────┘  │
│                  │                                                │
│   ┌──────────────┼───────────────┬────────────────┐               │
│   ▼              ▼               ▼                ▼               │
│ GlassLight    GlassEnvironment GlassMotion   shape.ts             │
│ 动态光源       环境采样          弹簧交互        连续圆角          │
│ pointer/       thumbhash →       motion/react   small/medium/     │
│ viewport/      OKLCH → tint     stiffness      large/capsule      │
│ scroll → CSS   亮/暗/夜景自适应    280–350       + squircle 模拟    │
│ --glass-light  （不显著染色）      damping20–30                    │
│ -x/-y/--intensity                                  │              │
│                                                   ▼               │
│  displacement/  lens-field.ts（SDF rounded box height field）     │
│                 sdf.ts（符号距离函数）                             │
│                 cache.ts（LRU，≤16 项，尺寸/圆角相同即命中）        │
└────────────────────────────────────────────────────────────────────┘

组件映射（全站玻璃都由 GlassSurface 驱动）：
  gallery-dock / brand / detail-nav / detail-corner / photo-opening   → thin + interactive + specular
  FilterPanel / Appearance / brand-menu / title-popover（popover）    → regular（frosted 面板）
  Modal / Confirm / select-popup                                       → thick（浮层）
  detail-info（PhotoDialog 桌面详情面板）                              → thick + tint=auto + refractive
                                                                        + WebGL hero 表面
  detail-sheet（移动底部抽屉）                                         → thick + tint=auto
```

## 2. 文件迁移计划

| 来源                                                                     | 去向                                                            | 说明                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| `apps/client/src/vendor/GlassSurface.tsx`                                | `apps/client/src/glass/GlassSurface.tsx`                        | React 接口迁入引擎目录，删除旧实现           |
| `apps/client/src/ui/glass-map.ts` 的位移场与预算                         | `apps/client/src/glass/displacement/lens-field.ts` + `cache.ts` | 保留算法，按 SDF 重写（含中心折射）          |
| `apps/client/src/styles/materials.css` 玻璃样式                          | `apps/client/src/styles/glass.css`（新增）                      | token 由 `GlassMaterial.ts` 注入；无重复 CSS |
| `apps/client/src/styles/base.css` 中 `.material`/`.glass-surface` 玻璃段 | `glass/` 样式层                                                 | 从 base.css 删除玻璃实现，只留 token 引用    |
| `apps/client/src/styles/viewer.css` 中 `.detail-info` 固定 frosted 背景  | 由 `GlassSurface material="thick"` + 环境 tint 接管           | 背景色走引擎变量                             |

## 3. 删除列表

- `apps/client/src/vendor/GlassSurface.tsx`（整体删除，组件迁移至 `glass/GlassSurface.tsx`）
- `apps/client/src/ui/glass-map.ts`（功能拆入 displacement/，无并行实现）
- `apps/client/src/styles/materials.css`（被 `glass.css` 取代，删除防重复玻璃 CSS）
- `base.css` 中 `.material, .glass-surface--fallback` 与 `.glass-surface*` 玻璃样式段（并入引擎样式层）
- 组件内所有硬编码玻璃参数（`--liquid-tint`、`--frosted-tint` 直接引用改为走材质变量；组件里不写玻璃参数）
- `.detail-info` / `.detail-sheet-footer` 的 `var(--frosted-tint)` 直引（由材质 token 接管）
- 11 种散落圆角值 → 收敛为 shape 系统（small 10 / medium 16 / large 22 / capsule 999）

## 4. 新增列表

```text
apps/client/src/glass/
├─ GlassSurface.tsx       React 接口：material / tint / shape / interactive / refractive / specular
├─ GlassMaterial.ts       材质定义：5 档 × 8 参数；导出 resolveMaterial() → CSS 变量
├─ GlassRenderer.ts       渲染策略：probe 能力 → css | svg | webgl；LRU 与面积预算
├─ GlassLight.ts          动态光源：pointer/viewport/scroll → --glass-light-x/y/intensity（rAF 合帧）
├─ GlassMotion.ts         弹簧交互：motion/react，hover 吸附 / press 压缩(0.97) / release 弹性恢复
├─ GlassEnvironment.ts    环境采样：thumbHashToAverageRGBA → OKLCH → 克制 tint（森林微绿/天空微蓝/雪中性）
├─ oklch.ts               sRGB→linear→XYZ→OKLab→OKLCH 与反向，亮/暗主题映射
├─ shape.ts               连续圆角 token + squircle SVG mask 模拟
├─ displacement/
│  ├─ sdf.ts              sdRoundedBox / 法线 / height field
│  ├─ lens-field.ts       SDF rounded box 位移图（中心轻微折射、边缘增强，IOR 1.3–1.5 外观）
│  └─ cache.ts            LRU 缓存（尺寸+圆角为键）
└─ renderers/
   ├─ SVGGlassRenderer.ts   feImage+feDisplacementMap+feGaussianBlur+feColorMatrix
   │                        +lighting composite+RGB dispersion（R+1px G0 B-1px，仪边缘）
   └─ WebGLGlassRenderer.ts SDF 圆角矩形/法线/折射/色差/Fresnel/specular/blur，
                            用 DOM 图片布局重绘玻璃下区域，contextlost 恢复，自动降级 SVG
apps/client/src/styles/glass.css    引擎样式层（材质变量 + 各渲染器输出类）
```

## 5. 性能风险与对策

| 风险                         | 对策                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| backdrop-filter url 滤镜过重 | 面积预算沿用 `width*height<=60_000` 且限高 160（控制面）；阅读面板走 CSS frosted，不叠折射               |
| WebGL 每帧重绘               | 仅一个 hero 表面（桌面详情面板）；render-on-change（id/布局/图片就绪），非 rAF 常驻；DPR ≤ 1.5           |
| 色散/光照叠加成本            | 色散只 ±1px、仅 edges 通道；specular 为 CSS radial-gradient 单层，由 GlassLight rAF 合帧更新             |
| 低端设备                     | hardwareConcurrency ≤2 / saveData / reduced-motion / reduced-transparency / 无 WebGL → 自动走 CSS 毛玻璃 |
| 内存                         | displacement 图 LRU ≤16；WebGL 纹理随面板尺寸重建并释放旧纹理；析构时 delete 上下文资源                  |
| 多玻璃层 overdraw            | gallery 的 dock/brand/计数统一走引擎（GlassSurface + 同一 token 层），不逐元素独立 blur                          |
| context 丢失                 | 监听 webglcontextlost/restored；丢失期间静态 CSS 保底                                                    |
| 移动端                       | 不做 WebGL；抽屉玻璃用 CSS frosted + 环境 tint，控制点用 thin 材质                                       |
