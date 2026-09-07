# 本地 UI 资源审查

2026-09-07 在产品重构前扫描 `/data/data/com.termux/files/home/ui-libraries/`。
逐个阅读下列顶层库的 README 及 `skills/*/SKILL.md`；发生输出截断的部分已分段补读。
不把不同 skill 的相互矛盾风格默认值同时启用，当前需求文档优先。

## 组件库（26）

| 目录                  | 可用资源                                                                         | 本次决定                               |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Chart.js              | Canvas 图表                                                                      | 不新增图表需求                         |
| a2ui                  | 声明式生成 UI 协议                                                               | 非生成式 UI，不引入                    |
| ant-design            | 企业 React 组件                                                                  | 非当前视觉语言                         |
| appica-ui             | React 组件与主题                                                                 | 与 Base UI 功能重叠，不混用            |
| base-ui               | Button、Dialog、AlertDialog、Popover、ToggleGroup、Slider、Switch、Tooltip、表单 | 主要交互基础，使用正式包               |
| basecoat              | shadcn 风格 HTML / Tailwind / JS                                                 | React 项目不采用平行的 DOM 行为层      |
| chakra-ui             | React / Emotion 组件体系                                                         | 不引入第二套体系                       |
| daisyui               | Tailwind CSS 组件                                                                | 不引入第二套体系                       |
| emoji-picker-react    | 表情选择                                                                         | 无该需求                               |
| heroui                | React Aria + Tailwind 组件                                                       | 不与 Base UI 混用                      |
| json-render           | 跨平台生成式 UI                                                                  | 无该需求                               |
| liquid-glass          | SVG 折射实验                                                                     | 查阅，兼容性不适合做唯一方案           |
| liquid-glass-demo     | SVG / WebGL 玻璃演示                                                             | 查阅，保留渐进增强思路                 |
| liquid-glass-react    | React 折射、毛玻璃                                                               | 查阅，避免对整面照片反复折射           |
| magicui               | 动效组件                                                                         | 照片浏览不需要装饰动画                 |
| mantine               | 完整组件 / hooks / 表单                                                          | 不引入第二套体系                       |
| material-ui           | Material Design React                                                            | 非当前视觉语言                         |
| metal-fx              | WebGL 金属边缘                                                                   | 无需金属 / 常驻着色器                  |
| react-bits            | Masonry、DomeGallery、GlassSurface、CircularGallery、InfiniteMenu                | 适配前三者；不采用整张照片强扭曲的交互 |
| react-native-localize | 原生本地化                                                                       | Web 项目不采用                         |
| ruixen.com            | shadcn 营销组件                                                                  | 无营销页需求                           |
| saasternity           | SaaS 脚手架                                                                      | 不替换现有业务架构                     |
| shadcn-ui             | 可复用组件结构 / 主题 / Sonner                                                   | 复用组件组合约定，不混入第二套焦点管理 |
| tambo                 | 生成式 UI / Agent 对话                                                           | 无该需求                               |
| termcn                | 终端 React UI                                                                    | 非终端应用                             |
| tremor-npm            | 数据图表与仪表板                                                                 | 无新增仪表板需求                       |

## 图标库（4）

| 目录            | 决定                                                          |
| --------------- | ------------------------------------------------------------- |
| mingcute-icons  | 全站统一图标；正式 `@mingcute/react`，离线打包，24px 原生画布 |
| developer-icons | 技术品牌图标，无该需求                                        |
| morphicons      | 描边图标形变；本项目静态图标已足够，不额外引入                |
| reicon          | 另一完整图标体系，不与 MingCute 混用                          |

## 设计资源（3）

| 目录                   | 决定                                           |
| ---------------------- | ---------------------------------------------- |
| awesome-design-md      | 查阅设计语言目录；不直接套用其他品牌           |
| awesome-design-systems | 查阅系统索引；采用已有可用的 Base UI           |
| fumadocs               | 文档网站框架；本次使用仓库内 Markdown 运维文档 |

## Skills（54）

下列名称均对应 `ui-libraries/skills/<名称>/SKILL.md`，已全文读取用于选型。

| 名称                         | 用途 / 是否用于当前实现                             |
| ---------------------------- | --------------------------------------------------- |
| apple-design                 | 使用：直接操控、克制弹簧、半透明层次、主题与触控    |
| baseline-ui                  | 使用：已有组件优先、语义控件、安全区、短转场        |
| fixing-accessibility         | 使用：可访问名称、键盘、焦点与 dialog               |
| fixing-motion-performance    | 使用：只在交互时渲染、批量读写、静态模糊层          |
| animate                      | 动画构建参考；现有 Motion / CSS 足够                |
| animate-expo                 | 原生动画，不适用                                    |
| animation-vocabulary         | 动效术语目录                                        |
| ask-sonner                   | Toast 方案参考                                      |
| beautiful-article            | 单文件文章，不适用                                  |
| brandkit                     | 品牌图像生成，不适用                                |
| brutalist-skill              | 工业视觉，不适用                                    |
| create-design-md             | 提取已存在设计系统；本次按明确需求制定迁移文档      |
| emil-design-eng              | 微交互参考，避免过量动画                            |
| find-animation-opportunities | 只读机会清单，不启用工作流                          |
| fixing-metadata              | 页面元信息参考                                      |
| frontend-slides              | 幻灯片，不适用                                      |
| gpt-image-2                  | 生图，不适用，测试需要真实风景原片                  |
| gpt-tasteskill               | 营销 / GSAP 页面，不适用                            |
| gsap-core                    | GSAP 基础，查阅，不新增平行动画引擎                 |
| gsap-frameworks              | Vue / Svelte，不适用                                |
| gsap-performance             | GSAP 性能，查阅                                     |
| gsap-plugins                 | GSAP 插件，查阅                                     |
| gsap-react                   | GSAP React，查阅                                    |
| gsap-scrolltrigger           | 滚动叙事，不适用                                    |
| gsap-timeline                | 时间轴，查阅                                        |
| gsap-utils                   | 动画工具目录，查阅                                  |
| hallmark                     | 通用设计目录，明确 Apple 照片墙需求优先             |
| image-to-code-skill          | 由生图转网页，不适用                                |
| imagegen-frontend-mobile     | 手机样机生图，不适用                                |
| imagegen-frontend-web        | 营销网页生图，不适用                                |
| improve-animations           | 只读计划，不启用工作流                              |
| improve-react                | 只读 React 计划，不启用工作流                       |
| improve-threejs              | Three.js 审查，不采用 WebGL 渲染                    |
| improve-ui                   | 保持现有视觉的只读审查，与本次整体重构不同          |
| kb-retriever                 | 本地知识库问答，不适用                              |
| minimalist-skill             | 编辑风格目录，不覆盖 Apple 规范                     |
| mono-color-skill             | 印刷单色图像，不适用，照片保持真实颜色              |
| output-skill                 | 完整性参考，不用占位实现                            |
| performance                  | 性能取证方法参考                                    |
| pick-ui-library              | 组件选型目录，Base UI / Motion / Sonner 可用        |
| prototype                    | 多版本选择器，不适用，用户已明确方向                |
| react-doctor                 | React 检查参考                                      |
| redesign-skill               | 审查后升级参考，具体要求优先                        |
| review-animations            | 动效审查参考                                        |
| soft-skill                   | 高端营销视觉，不适用                                |
| stitch-skill                 | Stitch 系统生成，不适用                             |
| taste-skill                  | 通用前端风格目录，当前明确需求优先                  |
| taste-skill-v1               | 旧版风格目录，不启用                                |
| ui-skills-root               | skill 路由参考                                      |
| ui-ux-pro-max                | UX 与响应式目录，选用更聚焦的上述规范               |
| web-design-engineer          | 通用网页设计流程，当前明确需求优先                  |
| web-video-presentation       | 口播 / 录屏演示，不适用                             |
| website-rebuild              | 1:1 镜像复刻，不适用；参考项目只借鉴设计 / 架构思路 |
| write-swift                  | Swift，不适用                                       |

## 来源与适配边界

- Base UI：本地提交 `47b4052`，包版本 `1.8.0`，MIT。
- MingCute：本地提交 `ca98bb5`，正式 React 包 `3.0.2`，Apache-2.0。
- React Bits：本地提交 `0e69e73`，Masonry / DomeGallery / GlassSurface 的 TypeScript + CSS
  实现已阅读。许可为 MIT + Commons Clause，可作为应用使用，不作为组件库销售 / 再分发。
- shadcn：本地提交 `5c7072d`，MIT。组件组合按本项目样式和 Base UI 统一。
- 适配需要改变上游演示的 `background-size: cover` / 方形放大、默认灰度、
  手写 dialog、无终止条件的动画、全量预加载等；不能因为来自库就照搬不符合要求的行为。
- 照片墙的曲率与自然比例排列是本项目的业务布局；继承可复用组件的结构 / 数学和输入策略，
  拆出可测试的几何函数。按钮、弹层、选择、焦点行为使用成熟组件，不自造重复控件。
- 玻璃是 Web 毛玻璃近似，不宣称为 Apple 原生 Liquid Glass；Safari / Firefox 使用同等可读的
  CSS 毛玻璃路径，减少透明度时使用实色。
- Afilmory 与 ChronoFrame 的 README 已阅读：采用照片优先、多尺寸与 EXIF、增量导入、
  存储适配 / 模块边界的思路，不复制其产品代码和视觉品牌。
