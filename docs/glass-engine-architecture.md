# FanPhoto Glass Engine

统一的玻璃引擎：材质、形状、环境色、动态光、折射渲染都由 `apps/client/src/glass/` 一处解析，
组件不写玻璃参数。目标观感是 Apple 式的"真实玻璃"——边缘折射、内部干净、随环境微调，
而不是网页常见的糊一层 blur。

## 1. 结构

```text
GlassSurface.tsx      React 唯一入口：material / shape / tint / interactive /
                      refractive / specular / webgl props → 引擎内解析
GlassMaterial.ts      5 档材质 × 明暗主题的全部光学参数（单一事实来源）+
                      shape 圆角 token（small 10 / medium 16 / large 22 / capsule 999）
GlassRenderer.ts      一次性能力探测：backdrop-filter 可用性、SVG 滤镜路径（Chromium）、
                      无障碍/省流/低核数限制（restricted → 全部降级 CSS）
GlassLight.ts         全局指针光：rAF 合帧，仅在指针活跃期间运行（空闲即停，
                      指针/滚动事件重新唤醒）；表面订阅后把局部高光位置
                      直接写到自身节点（不经过 React 渲染）
GlassEnvironment.ts   照片 thumbhash 平均色 → 克制的 OKLCH tint（chroma ≤ 0.05），
                      发布到 :root；auto 表面跟随，neutral 表面忽略
GlassMotion.tsx       弹簧交互（motion/react，懒加载）：hover 吸附 / 指针微形变 /
                      press 压缩 / release 弹性恢复
oklch.ts              OKLCH ↔ sRGB 色彩数学
displacement/
  sdf.ts              圆角盒 SDF 与法线
  lens-field.ts       位移场光栅化：R/G = x/y 位移，A = 边缘高度。
                      折射只存在于边缘带（内部保持中性——平板不弯光，
                      且全盘位移会在中线两侧方向翻转产生接缝）
  cache.ts            位移图 LRU（24 项，键 = 尺寸:圆角:强度）
renderers/
  SVGGlassRenderer.tsx   Chromium 增强路径：feImage(位移图) → feDisplacementMap →
                         feGaussianBlur → 亮度/饱和度 → 可选 RGB 色散（R+1px/B−1px）
  WebGLGlassRenderer.ts  hero 透镜（仅桌面详情面板）：SDF 法线折射、边缘带色差、
                         Fresnel 内缘光环、环境 tint；render-on-change，无常驻 rAF
```

样式只有一个文件：`styles/glass.css`。材质参数经 `materialVars()` 注入表面内联变量，
`.material` 静态面板（popover/modal/studio 导航）读同一组 :root token。

## 2. 渲染路径与降级

```text
restricted（reduced-motion/transparency/contrast、saveData、≤2 核） → CSS 毛玻璃
非 Chromium / 无 backdrop-filter                                    → CSS 毛玻璃
Chromium + refractive + 预算内（≤1024×900 且 ≤280k px）             → SVG 液态折射
桌面详情面板（webgl prop + 探测通过）                                → WebGL hero 透镜
```

- 面积预算：dock、按钮、弹层、详情面板、移动 sheet 都能进入液态路径；
  超预算的大表面保持毛玻璃。
- 位移/滤波失败（canvas 不可用、滤镜未生效）自动回到 frosted，功能不受影响。
- WebGL 探测只在声明了 `webgl` prop 的表面上进行，模块按需加载。

## 3. 光与高光

- `GlassLight` 维护全局指针光（viewport 分数 + 活跃强度），空闲 220ms 后 rAF 停转。
- 每个开启 specular 的表面订阅光状态，把 `--glass-spec-x/y/intensity` 直接写到
  自己的元素上（`glass.css` 的 ::before radial-gradient 消费），指针移动不触发任何
  React 重渲染。
- Fresnel 内缘光环由 `glass.css` ::after 的 inset 光晕实现，强度跟随
  `--glass-rim-strength`（材质定义），SVG/WebGL/CSS 三条路径共享同一 rim 语言。

## 4. 组件约定

- 交互控制面（dock、导航按钮、详情角标、详情面板）→ `GlassSurface`，thin/regular/thick。
- 静态面板（popover、modal、select、studio 卡片）→ `className="… material"`，读 token。
- 新玻璃表面一律走以上两条路；禁止在组件里手写 blur/border/rgba 玻璃参数。
