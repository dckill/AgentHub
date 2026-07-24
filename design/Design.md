---
design_system: AgentHub Amber Crystal
version: 1.0.0
status: implemented
updated: 2026-07-05
purpose: Guide and verify the AgentHub 1.0 app interface implementation across dark and light themes.

references:
  dark_preview_4k: outputs/agenthub-amber-crystal-full-preview/agenthub-amber-crystal-full-preview-4k.png
  dark_mobile_panels: outputs/agenthub-mobile-panels
  light_mobile_panels: outputs/agenthub-light-mobile-panels
  light_imagegen_chat: 1. 聊天页-亮色.png
  light_imagegen_settings: 4. 设置页-亮色.png
  light_imagegen_components: UI风格.png

theme_modes:
  default: dark
  dark: Amber Crystal
  light: Amber Crystal Light

tokens:
  color_dark:
    canvas: "#070A0B"
    canvas_elevated: "#0B1012"
    surface: "rgba(12, 17, 19, 0.72)"
    surface_raised: "rgba(17, 24, 27, 0.84)"
    surface_hover: "#182126"
    border: "rgba(238, 248, 250, 0.13)"
    border_strong: "rgba(255, 202, 116, 0.52)"
    accent: "#FFB22E"
    accent_dark: "#F6A21A"
    accent_soft: "rgba(255, 178, 46, 0.12)"
    accent_glow: "rgba(255, 178, 46, 0.32)"
    edge_bright: "rgba(255, 255, 255, 0.26)"
    edge_muted: "rgba(255, 255, 255, 0.055)"
    edge_warm: "rgba(255, 196, 88, 0.20)"
    reflection: "rgba(255, 255, 255, 0.065)"
    text_primary: "#F3EFE7"
    text_secondary: "#C8C0B4"
    text_muted: "#7A8790"
    success: "#50C878"
    warning: "#FFB22E"
    danger: "#EF3D3D"
    info: "#5FA8FF"
  color_light:
    canvas: "#F6F9FA"
    canvas_elevated: "#EEF4F6"
    surface: "rgba(255, 255, 255, 0.62)"
    surface_raised: "rgba(255, 255, 255, 0.88)"
    surface_hover: "#F1F6F7"
    border: "rgba(28, 44, 52, 0.14)"
    border_strong: "rgba(217, 144, 18, 0.36)"
    accent: "#D99012"
    accent_dark: "#B76D00"
    accent_soft: "rgba(217, 144, 18, 0.105)"
    accent_glow: "rgba(217, 144, 18, 0.20)"
    text_primary: "#0E1720"
    text_secondary: "#485866"
    text_muted: "#75828C"
    success: "#158A4B"
    warning: "#D99012"
    danger: "#C7352E"
    info: "#2F73D9"
  typography:
    font_family_ui: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    font_family_mono: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
    size_xs: 11
    size_sm: 12
    size_md: 14
    size_lg: 16
    size_xl: 20
    line_height_dense: 1.25
    line_height_normal: 1.45
    weight_regular: 400
    weight_medium: 500
    weight_semibold: 600
  spacing:
    unit: 4
    xs: 4
    sm: 8
    md: 12
    lg: 16
    xl: 24
    xxl: 32
  radius:
    xs: 4
    sm: 6
    md: 8
    lg: 10
    pill: 999
  glass:
    blur_sm: 12
    blur_md: 18
    blur_lg: 28
    saturation: 1.18
  motion:
    fast: 120
    normal: 180
    slow: 260
    easing_standard: "cubic-bezier(0.2, 0.8, 0.2, 1)"
---

# AgentHub Amber Crystal Design

## 1. 文档目标

`Design.md` 是 AgentHub APP 视觉设计和前端实现的统一约束文件。当前 1.0 基线已经落到 `packages/agenthub-app` 的主题 token、基础 glass 原语、主要页面、品牌资产、Web/Tauri 外壳和 Android preview 包名/应用名中。V02 原生验收仍继续追踪 Android arm64 真机和 iOS 模拟器/真机证据，但不改变本文作为 AgentHub Amber Crystal 1.0 设计事实源的定位。

当前系统支持两套主题：

- `Amber Crystal`：默认暗色主题，黑色石墨玻璃、暖白玻璃边缘、少量琥珀强调、紧凑开发工具气质。
- `Amber Crystal Light`：亮色主题，白瓷/浅雾磨砂玻璃、深石墨文字、细白边缘高光、少量琥珀反光，保留技术感但降低黑色压迫感。

两套主题必须共享同一套布局、组件结构、圆角、动效和信息密度。亮色主题不是重新设计产品，只是将同一套语义 token 映射到更明亮的材质和对比关系。

亮色主题的视觉基准来自三张 ImageGen 参考图：聊天主界面、账户设置页、组件材质板。后续浅色主题调整必须优先满足这些图里体现的白瓷画布、半透明玻璃厚边、冷灰阴影、短边缘高光、琥珀主按钮和浅色状态胶囊，而不是回退到普通白色后台 UI。

## 2. 共同设计原则

1. AgentHub 是工作台，不是营销页。界面必须服务监控、会话、配置、部署和开发者协作。
2. 琥珀色只用于品牌识别、主操作、选中状态、关键状态和焦点，不做大面积铺色。
3. 所有主题都使用 glass surface：半透明底色、方向性细边框、微弱内高光、克制阴影、可感知的厚边和倒角。
4. 信息密度偏高，但每个信息组要有清晰边界和状态提示。
5. 移动端优先单列、卡片化、底部导航；桌面端优先 app shell、左侧导航、中央工作区和右侧状态区。
6. 状态不能只靠颜色表达，必须搭配文本、图标或 chip label。

## 3. 暗色主题：Amber Crystal

暗色主题关键词：`dark / graphite / glass / amber / precise / compact`。

背景为接近黑色的石墨色，表层为深色半透明玻璃。普通边缘优先使用低透明暖白/冷白细线、顶部内高光和底部暗边来表达厚度；琥珀边缘只用于主按钮、选中态、焦点和关键状态。主按钮和选中态允许有琥珀 glow，但不可让界面变成橙色主题。暗色主题适合夜间工作、终端、运维和高专注场景。

暗色主题常用语义：

```css
[data-theme="dark"] {
  --ah-color-canvas: #070a0b;
  --ah-color-canvas-elevated: #0b1012;
  --ah-color-surface: rgba(12, 17, 19, 0.72);
  --ah-color-surface-raised: rgba(17, 24, 27, 0.84);
  --ah-color-border: rgba(238, 248, 250, 0.13);
  --ah-color-border-strong: rgba(255, 202, 116, 0.52);
  --ah-color-accent: #ffb22e;
  --ah-color-accent-dark: #f6a21a;
  --ah-color-text-primary: #f3efe7;
  --ah-color-text-secondary: #c8c0b4;
  --ah-color-text-muted: #7a8790;
  --ah-color-success: #50c878;
  --ah-color-danger: #ef3d3d;
}
```

## 4. 亮色主题：Amber Crystal Light

亮色主题关键词：`porcelain / mist glass / graphite text / restrained amber / precise`。

亮色主题不使用纯白后台管理风格，也不使用大面积米色/奶油色铺底。底色应接近白瓷和浅冷雾灰，表层为高透明磨砂玻璃，文字使用深石墨色。玻璃边缘优先使用白色顶边高光、浅石墨底边和非常轻的琥珀局部反光；琥珀色只服务主操作、焦点、选中态和状态点。阴影应偏冷灰、轻、短，避免让界面变脏或变黄。

亮色主题同样需要低对比背景材质。聊天画布、设置页和大面积工作区不能是纯色白底；应使用极弱的白色柔光、浅冷灰云雾、浅石墨细线、斜向白色反光和低透明度暖色反光作为底纹，让 glass surface 的半透明和毛玻璃层级可见。底纹只为材质服务，不可抢正文、代码、终端输出和按钮。Web 端可使用多层 `radial-gradient`、`linear-gradient` 和 `backdrop-filter`；React Native/Expo 端优先使用已有 `LinearGradient`、半透明背景、边缘线和阴影，不为底纹引入大图资源。

工具调用卡片、文件更新卡片和菜单组在亮色主题中也必须有厚度：外层保留 1-2px 浅雾灰厚边，内层白色/浅灰材质区向上下扩展，只留窄边表达倒角；圆角比普通大卡片更克制，避免软糖感。顶部高光不能横贯整张卡片形成突兀切割线，应是短、轻、靠左上角的方向性反光。效果图中的工具卡片要被理解为“双层材质”：外层负责投影、厚边和冷灰压暗，内层负责白瓷面、细白内描边和内容槽。

### 4.1 亮色 ImageGen 参考图拆解

白色聊天主界面参考图：

- 背景是白瓷和冷雾灰，不是纯白。画布有极弱云雾、轻微斜向反光和可被玻璃折射的细纹理。
- 普通消息卡片更像半透明白瓷片：中心偏白，边缘有双层白边，下边缘有冷灰压暗，投影短而软。
- 用户消息可以带浅琥珀底，但只应是温暖提示，不应把气泡变成米黄色块。
- 底部 composer 是最重要的浮层之一：面板需要明显厚边、内高光、冷灰底部阴影；发送按钮使用琥珀渐变、内高光、描边和小投影。

白色账户/设置参考图：

- 大分组卡片有较克制圆角、白瓷内面、冷灰外边、底部短阴影。卡片之间靠浮层高度区分，不靠深灰边框硬切。
- 开关和滑块按钮必须像凸起的玻璃件。浅色主题中禁止纯黑 thumb；active thumb 使用近白、半透明、带内反光的玻璃圆点，track 使用琥珀渐变或琥珀实色。
- 菜单分割线极细、偏冷灰，不能成为横向强切割；行内图标使用语义色，但面积要小。

白色组件材质板参考图：

- Dialog、Menu、Tool、File、Table 使用同一套白瓷玻璃语言：半透明白面、细内白边、冷灰外边、底部压暗、短高光。
- 状态 chip 不是实心色块，应使用浅色半透明底、细语义边框、小状态点和语义文字。
- Primary 按钮是唯一允许明显琥珀渐变的控件；Secondary 和 Icon Button 使用白瓷玻璃，不使用大面积灰底。
- 表格/列表可使用非常轻的灰白表头和分割线，但每个容器仍需保留玻璃边缘与浮层阴影。

推荐亮色语义：

```css
[data-theme="light"] {
  --ah-color-canvas: #f6f9fa;
  --ah-color-canvas-elevated: #eef4f6;
  --ah-color-surface: rgba(255, 255, 255, 0.62);
  --ah-color-surface-raised: rgba(255, 255, 255, 0.88);
  --ah-color-border: rgba(28, 44, 52, 0.14);
  --ah-color-border-strong: rgba(217, 144, 18, 0.36);
  --ah-color-accent: #d99012;
  --ah-color-accent-dark: #b76d00;
  --ah-color-accent-soft: rgba(217, 144, 18, 0.105);
  --ah-color-text-primary: #0e1720;
  --ah-color-text-secondary: #485866;
  --ah-color-text-muted: #75828c;
  --ah-color-success: #12834a;
  --ah-color-danger: #be332c;
}
```

亮色主题的 glass surface：

```css
.ah-glass {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(238, 246, 248, 0.52)),
    var(--ah-color-surface);
  border: 1px solid var(--ah-color-border);
  box-shadow:
    0 14px 34px rgba(62, 82, 90, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    inset 0 -1px 0 rgba(28, 44, 52, 0.08);
  backdrop-filter: blur(18px) saturate(118%);
  -webkit-backdrop-filter: blur(18px) saturate(118%);
}
```

亮色主题禁忌：

- 不要使用纯白大面板配纯黑文字，避免普通后台感。
- 不要把 amber 提升到荧光橙；浅底上优先使用 `#C98200` 或 `#A76500`。
- 不要移除玻璃层级。亮色也必须有磨砂、边线、阴影和内高光。
- 不要用米色/棕色铺满界面，AgentHub 仍然是技术产品。
- 不要让高光成为横向切割线；菜单组和工具卡片使用短高光、弱高光。
- 不要让浅色卡片完全融入背景；必须保留外层厚边、内层材质和底部暗边。
- 不要把状态 chip 做成纯色标签；浅色状态应是浅底、细边、小点、语义文字。
- 不要在浅色主题中使用纯黑开关/滑块 thumb；thumb 应是近白玻璃凸起。

## 5. 布局规则

桌面端默认结构：

1. `AppShell`：左侧 icon rail，宽 56-72px。
2. `TopBar`：高度 48-56px，包含品牌、搜索、快捷入口、通知、用户。
3. `Workspace`：主内容区，使用 12/16px grid gap。
4. `SidePanel`：右侧详情、hosts、activity，可折叠。
5. `StatusLayer`：toast、popover、command palette、modal。

移动端默认结构：

1. 顶部品牌栏 48-56px，包含 logo、页面标题和 1-2 个操作入口。
2. 内容区单列卡片，左右安全边距 16px。
3. 主操作按钮可固定在底部操作栏或关键卡片下方。
4. 底部导航 4-5 项，当前项使用琥珀色图标、文字或浅琥珀底。
5. Dialog 在移动端默认使用屏幕居中的 glass modal；不要从底部弹出，避免与输入法、底部 composer、底部导航和安全区冲突。复杂设置页优先使用单列分组。

## 6. 组件规则

### Button

Primary 按钮使用琥珀填充。暗色主题中按钮文字用近黑；亮色主题中也保持深石墨文字，避免按钮变成普通网页橙色。Secondary 使用 glass 背景和低透明琥珀/石墨边缘。Ghost 只保留弱边框或文字。

状态必须覆盖：`default`、`hover`、`pressed`、`focus`、`loading`、`disabled`。

### Card / Panel

卡片必须有标题或明确内容归属。普通卡片使用 8px 圆角，工具/状态卡片可用 10-12px 圆角，但不可过软。选中卡片使用更强琥珀描边。亮色主题中的卡片要比画布略亮，外层有浅雾灰厚边，内层有白色材质区，并使用温和冷灰阴影区分层级。

工具调用卡片和文件更新卡片使用“外层厚边 + 内层材质”的双层结构。内层灰/白区域应比旧版更向上下扩展，但仍保留一圈窄的外层边缘来表达玻璃厚度和倒角。暗色边缘偏黑，亮色边缘偏浅雾灰；两者都需要顶部微高光和底部弱暗边。

亮色工具卡片推荐关系：

- 外层背景：`rgba(232, 239, 241, 0.74)`，边框 `rgba(28, 44, 52, 0.15)`。
- 内层材质：`rgba(255, 255, 255, 0.86)`，内白边 `rgba(255, 255, 255, 0.96)`。
- 内容槽：`rgba(250, 253, 253, 0.64)`，分割线 `rgba(28, 44, 52, 0.08)`。
- 阴影：冷灰短阴影，优先表达浮起，不制造明显脏边。

### Dialog / Modal

桌面端 Dialog 默认宽 360-520px，复杂 Modal 可到 720-880px。移动端 Dialog 默认居中出现，宽度使用屏幕宽度减安全边距，内容过长时在 modal 内部滚动；不要使用 bottom sheet。危险动作必须使用红色语义和明确文案。

### Toast / Alert

Toast 最多堆叠 3 条。Success、Warning、Error、Info 使用状态色点、细边框和短文案，不使用大面积高饱和背景。

### Forms

输入框高度 36-44px。Focus 后使用琥珀边框和轻微 glow。错误态使用红色边框和错误文案，不能只改颜色。

### Status Chip

Chip 文案保持短：`Active`、`Running`、`Completed`、`Pending`、`Error`、`Offline`。亮色主题中 chip 背景应更浅，边框和文字负责表达状态。

亮色 chip 必须带一个小状态点。Running 使用浅琥珀底、琥珀细边和琥珀点；Done/Active 使用浅绿底、绿细边和绿点；Failed 使用浅红底、红细边和红点；Info 使用浅蓝底、蓝细边和蓝点。不要用大面积实心色块。

## 7. 图标与 Logo

Logo 使用六边形 hub-node 语言。图标保持线性、几何、1.5-2px 线宽。暗色主题默认灰白，active 使用琥珀；亮色主题默认石墨灰，active 使用琥珀深色。

## 8. 前端实现要求

1. 使用语义 token，不在业务组件中硬编码颜色。
2. 推荐以 `data-theme="dark"` / `data-theme="light"` 切换主题。
3. `GlassSurface` 应封装背景、border、shadow、blur、selected、disabled 状态。
4. 所有交互组件必须有 focus ring，并支持键盘访问。
5. 必须支持 `prefers-reduced-motion`。

推荐基础组件：

| 组件 | 职责 |
| --- | --- |
| `GlassSurface` | glass 背景、边框、blur、shadow、状态层级 |
| `Button` | primary、secondary、ghost、danger、icon、loading |
| `StatusChip` | 状态色、圆点、label |
| `Toast` | 通知类型、堆叠、关闭 |
| `Dialog` | 标题、正文、footer action、危险确认 |
| `PopoverMenu` | menu、context menu、tooltip |
| `Field` | input、select、error、help text |
| `SegmentedControl` | 紧凑视图切换 |
| `AppShell` | sidebar、topbar、workspace、side panel |

## 9. 检查清单

提交新界面或组件前检查：

- 是否使用 `AgentHub Amber Crystal` 语义 token。
- 暗色和亮色主题是否共享同一布局和组件结构。
- 亮色主题是否仍然保留白瓷/浅雾磨砂玻璃、细边缘高光、低对比底纹、少量琥珀强调和技术感。
- 工具调用卡片是否有外层厚边、内层材质区、克制圆角和短高光。
- 主操作是否明确，且琥珀强调没有泛滥。
- card、modal、popover、toast 是否有一致的边框、blur、shadow。
- hover、active、focus、disabled、loading 是否完整。
- 移动端是否单列可扫描，没有组件互相遮挡。
- 状态是否不仅依赖颜色。
- 是否支持 reduced motion。
