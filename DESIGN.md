# DESIGN.md — TB IELTS Speaking Mock Examiner

## 品牌与视觉方向

### 气质与意象
深夜录音棚——一间被柔和青色氛围灯包裹的专业语音实验室。深色茄子皮（aubergine）的隔音墙面从四面八方固定住视线，中央悬浮着一颗呼吸般的音频光球，脉动随声波起伏。Part 2 的提示卡像一张橙色霓虹便签贴在调音台上。整体感受：沉浸、专注、高端、安静中带着能量。

### 配色方案
| Token | 值 | 意象 |
|-------|-----|------|
| `--bg-surround` | `oklch(0.18 0.04 195)` | 深邃青黑——录音棚外间 |
| `--bg-panel` | `oklch(0.22 0.06 320)` | 深茄子皮——固定 100dvh 考试面板 |
| `--bg-panel-elevated` | `oklch(0.27 0.06 320)` | 略亮茄子——卡片/浮层 |
| `--cyan-glow` | `oklch(0.78 0.14 195)` |  luminous cyan——光球/录音指示 |
| `--cyan-glow-dim` | `oklch(0.55 0.10 195)` | 暗青——hover/secondary |
| `--orange-cue` | `oklch(0.72 0.18 55)` | 橙色——Part 2 提示卡 |
| `--orange-cue-dim` | `oklch(0.58 0.14 55)` | 暗橙——cue card 次要 |
| `--text-primary` | `oklch(0.93 0.01 195)` | 冷白——主文字 |
| `--text-secondary` | `oklch(0.70 0.02 195)` | 灰蓝——辅助文字 |
| `--text-on-orange` | `oklch(0.20 0.06 55)` | 深棕——橙色卡上文字 |
| `--band-high` | `oklch(0.72 0.16 155)` | 翠绿——高分段 |
| `--band-mid` | `oklch(0.72 0.14 85)` | 琥珀——中段 |
| `--band-low` | `oklch(0.65 0.18 25)` | 珊瑚红——低分段 |

### 字体排版
- 英文标题：`Inter` (Google Fonts, 400/500/600/700)
- 中文正文：`Noto Sans SC` (Google Fonts, 400/500/700)
- 等宽数据（分数/计时）：`JetBrains Mono`
- 排版节奏：标题 2xl~4xl，正文 base，辅助 text-sm，caption text-xs

### 动效与交互
- 音频光球：CSS 呼吸动画 `scale(1) ↔ scale(1.08)` + box-shadow 脉动，周期 2s ease-in-out
- 录音中：光球加速脉动 + 外环扩散波纹
- 页面过渡：`opacity + translateY(8px)` 0.3s ease-out
- 按钮 hover：`box-shadow: 0 0 20px var(--cyan-glow)` 发光
- Part 2 卡片入场：从底部滑入 + 轻微旋转 `rotateX(-2deg)`

### 设计禁忌
- 不要用纯白背景或浅色主题
- 不要用圆角超过 16px 的卡片（保持克制）
- 不要用花哨渐变——只用 cyan glow 和 orange accent
- 不要使用 emoji 作为 UI 元素
- 不要在任何考试界面元素上使用动画超过 300ms
