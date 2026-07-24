# Dark Glass Visual Refresh And Asset Audit

## 目标

这轮视觉刷新把 AgentHub 暗色主题从灰色面板加琥珀线条，收敛到更深的石墨玻璃系统：深色画布、半透明浮层、白色方向性边缘高光、局部暖色反射，以及只在主操作/选中/焦点中使用的琥珀强调。

亮色主题同步保留玻璃感：暖白画布、白色内高光、轻暖阴影和较低透明度的琥珀边缘。两个主题共享同一套组件结构。

## 参考

- CSS `backdrop-filter` 的可用思路是背景模糊/饱和度变化，但原生端不能完全依赖 Web 滤镜，因此实现上转成 token、渐变、边缘线和 elevation。
- SVG `feDisplacementMap` 可做真实折射/扭曲，但跨 React Native/Android/iOS 成本高，本轮只作为视觉参考，不放进核心运行时。
- Expo 官方 app size 文档建议用导出产物和平台分析器看真实体积；本轮先做 Web `expo export --dump-assetmap` 验证，Android/iOS 包体在后续原生构建时继续对比。

## ImageGen 参考提示词

参考图保存于 `docs/assets/agenthub-1.0/dark-glass-material-reference.png`。

```text
Use case: ui-mockup
Asset type: visual reference board for a production React Native app dark theme
Primary request: Create a polished material study for an AgentHub-style developer chat app using refined dark graphite frosted glass panels, realistic beveled glass edges, subtle white rim highlights, tiny changing highlight points along 1px borders, soft internal reflections, clear readable text placeholders, restrained amber accent only on primary actions and selected states.
Scene/backdrop: dark graphite app canvas, no neon tubes, no colorful glowing background, no marketing hero layout.
Subject: mobile chat screen cards, centered modal/dialog glass panel, compact sidebar/list row, composer input, primary send button.
Style/medium: high-end UI concept mockup, realistic glass material study, crisp product design reference.
Composition/framing: one sheet with 4 close-up component crops plus one small full-screen overview; focus on border treatments and surface layering.
Lighting/mood: soft studio light from upper left, subtle grazing highlights on top/left edges, gentle dark falloff on lower/right edges, quiet professional mood.
Color palette: near-black graphite, charcoal, translucent smoke glass, warm white edge highlights, restrained amber gold accent.
Materials/textures: frosted glass, polished beveled edge, slight thickness, very subtle blur/refraction impression, clean typography.
Constraints: no readable product copy except simple placeholders; no neon sign look; no purple gradients; no decorative blobs; no oversized hero; keep it utilitarian and dense like a developer tool.
Avoid: cyberpunk, dirty gray panels, heavy yellow outlines, strong drop shadows, stock illustration, watermark, logo text errors.
```

## 本轮实现范围

- 暗色 token 改为更深的 graphite 层级，普通边框改为低透明白色玻璃边缘。
- 新增 `glass.edgeBright`、`glass.edgeMuted`、`glass.edgeWarm`、`glass.reflection`，用于跨端表达玻璃厚度。
- `GlassSurface` 增加轻量方向性高光、底部暗边、左边缘和 floating tone；floating 外边缘在暗色下改为中性白边，暖色只保留为低透明局部反光。
- Composer、ActionMenu、Command Palette、默认居中 Modal、聊天头部、新会话配置面板、内联 picker、输入 dock 和消息/工具 surface 接入新玻璃语义。
- 同步 `theme.light.json`、`theme.dark.json` 和相关视觉测试。

## 资源审计结论

静态引用和 Web 导出资产图都未发现以下资源进入当前运行时：

- `packages/agenthub-app/sources/assets/images/brutalist`：420 张，约 1.7 MB。
- `packages/agenthub-app/sources/assets/images/gradients`：100 张，约 780 KB。
- `packages/agenthub-app/assets/images/emoji`：80 张，约 324 KB。
- `packages/agenthub-app/sources/assets/animations`：6 个 Lottie JSON，约 1.4 MB。

本轮已删除以上 606 个无引用文件，减少仓库资源体积约 4.2 MB。Web export 结果显示它们原本没有进入 Web bundle，因此这次主要降低仓库体积和未来误打包风险；Android/iOS 真实包体收益需要在下一次 native 构建后用 APK/IPA 产物继续验证。

Web export 真实大头：

- `canvaskit.wasm` 约 8.0 MB。
- Web 主 JS/chunk 约 13 MB。
- `@expo/vector-icons` 字体，最大 `MaterialCommunityIcons` 约 1.3 MB。
- 品牌图：`agenthub-logotype-light` 约 799 KB，`agenthub-logo-light/dark` 与 settings banner 仍有压缩空间。

## 后续建议

- 下一轮资源优化优先处理品牌 PNG 尺寸和格式，而不是继续盲删未引用目录。
- Web bundle 大头更可能来自 Mermaid/语法高亮/图标字体/Skia CanvasKit，需要单独做按需加载或平台拆分评估。
- 原生端包体应以 `android:apk:arm64` 产物和 APK Analyzer 为准，不用 Web export 推断最终 APK 体积。
