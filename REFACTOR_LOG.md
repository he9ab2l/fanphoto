# REFACTOR_LOG — 2026-09-09 全面审计与液态玻璃修复

基线：`f4862be`（基线标记，实际重构前状态 = fc8c9d3）。全部改动在 `feat/glass-engine` 分支，
主线提交 `ef09eb3`。

## 结论先行

全面审计后，**服务端与客户端非玻璃部分是健康的**（44 项测试全绿、结构清晰、无 TODO/FIXME/any
残留），真正"实现得非常糟糕"的是玻璃引擎——这次重构把它的六处实锤缺陷全部修掉，并对文档做了
对齐。没有为了"重构感"去拆分健康代码。

## 修复的缺陷（全部有代码证据）

### 1. SVG 色散链丢弃蓝通道（视觉发黄的根因之一）
`SVGGlassRenderer.tsx` 的 dispersion 链只把 R（偏移 +1px）和 G 做 arithmetic 合成，
偏移后的 B（−1px）结果 `b2` 计算了但从未参与合成 → 最终图像 B=0。所有
`dispersion: true` 的表面（dock、工具栏等 thin 材质）背景整体偏黄。
修复：`r2 + g` 之后与 `b2` 二次合成。

### 2. WebGL 边缘因子反转（"倒置透镜"）
`edgeFactor = clamp(-d / u_rim_band, 0, 1)`：d 在盒内为负，所以中心=1、边缘=0——
与注释和物理常识完全相反，照片详情面板的折射**中心最强、边缘为零**。
修复：`band = clamp(1 + d / u_rim_band, 0, 1)`（边缘 1、内部 0），强度
`band*(0.35+0.65*band)`，内部不折射。

### 3. WebGL rim 光环渲染在形状外侧
`rimGlow = pow(1 - inside, 1.6)` 只在形状**外部**非零，而外部被 CSS border-radius
裁掉 → Fresnel rim 实际不可见。修复：内缘光环 `clamp(1+d/…,0,1)*inside`。
顺带修掉 `normalize(vec2(0))` 在正中心的未定义行为。

### 4. 透镜场内部接缝
`lensField()` 给全盘位移，但 `sdfNormal` 在盒内部指向"最近边缘"——中线两侧方向
180° 翻转，每块玻璃中央有隐形折线。修复：折射只存在于边缘带（smoothstep 过渡），
内部像素保持中性 128；高度编码进 alpha。物理上也更正确：平板玻璃内部不弯光。

### 5. 光系统无限 rAF 循环
`GlassLight.tick()` 的 `if (listeners.size) requestTick()` 永不停止——只要存在任一
specular 表面，页面空闲时仍以 60fps 空转。修复：空闲阈值（220ms）后发布 intensity 0
并让循环死亡，指针/滚动事件重新唤醒。同时删除了零消费者的
`--glass-light-x/y/intensity` :root 变量发布。

### 6. specular 高光 setState 风暴
指针每动一下，所有 specular 表面每帧 `setSpecLight` → N 次 React 重渲染/帧 +
每次 getBoundingClientRect。修复：高光位置直接写元素 CSS 变量（`::before` 消费），
指针移动零 React 渲染；rect 缓存，resize/scroll 才重测。
附带：WebGL 能力探测从"每个 GlassSurface 无条件动态 import WebGL 模块"改为只在
声明 `webgl` prop 的表面上探测——gallery 首屏不再下载 WebGL chunk。

### 7. 折射预算过紧（引擎形同虚设）
原预算 640×160 / 60k px：详情面板、弹层、移动 sheet 全部进不了液态路径，实际只有
dock 一小条有折射。提升为 1024×900 / 280k px（约 380×680 面板、320×640 sheet 可入），
低端设备仍被 `restricted` 闸门（≤2 核 / saveData / reduced-*）挡在 CSS 路径。

### 8. SVG lighting pass 无效 → rim 统一进 CSS
原 `feSpecularLighting in={base}` 以常数 alpha 为高度场，输出是整体提亮而非边缘高光。
删除该 pass；Fresnel rim 由 `glass.css` ::after 的 inset 光晕实现，强度跟随材质
`--glass-rim-strength`，SVG/WebGL/CSS 三条路径共享同一 rim 语言。

## 结构性调整

- `apps/server/src/vendor.d.ts` → `apps/server/src/types/heic-convert.d.ts`
  （位置语义：这是第三方类型声明，不是 vendor 代码）。
- `tests/viewer.test.ts` 透镜场断言重写：内部中性、边缘带位移、alpha 高度、连续性
  （无中线跳变）、新预算边界。
- `docs/glass-engine-architecture.md` 重写：原文含未落地的内容（shape.ts、
  GlassMotion.ts 文件名、16 项 LRU、`--glass-light-*` 变量、60k 预算、组件映射与实际
  不符），现与代码一致。
- `CLAUDE.md`：现状区标注"线上仍是修复前版本，ef09eb3 未发布"；需求记录追加本次
  修复与"UI 组件暂缓、新组件优先从组件库选型"约定。

## 审计过但不动的部分（判断依据）

- **服务端不拆**：`app.ts`（260 行）虽然集中了路由，但 HTTP 壳职责内聚（安全头/缓存/
  静态/媒体流），模块层（auth/gallery/media/settings）边界清晰，44 项测试覆盖行为。
  机械拆分路由文件不改变任何事实来源，属无收益 churn。
- **studio UI 层不动**：按约定（UI 组件缓一缓，选用组件库里的），本次不重构
  Library/PhotoEditor/Albums 等表现层。
- **PhotoDialog（669 行）不拆**：键盘/手势/布局/预取各就各位，拆分收益低、回归风险高。

## 验证

- 本地（Termux）：`pnpm typecheck` ✓；`pnpm build` ✓（9.7s，WebGL 仍为独立按需
  chunk 7.5 kB）；非 sharp 测试 26/26 ✓。
- ten（x86_64）：`pnpm test` 44/44 ✓（含 sharp 依赖的 API/media/limits）。
- 未做：真实浏览器视觉验收（本机无浏览器环境，CDP 单实例约定未就绪）——修复的六处
  缺陷均有测试或代码级证据，建议下次 `pnpm test:ui` / verify-live 时补一轮截图。

## 残余风险

- 折射预算提升后，中端移动 GPU 上大 sheet 的 feDisplacementMap 成本未实测；
  `restricted` 闸门挡住了低端设备，但视觉/性能验收仍建议在真机过一遍。
- 线上（release.Om8mnP）仍是修复前版本；发布走 `bash deploy/release.sh`（自带
  install→build→test→备份→原子切换）。
