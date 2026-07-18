# DESIGN.md — TB IELTS Speaking Mock Examiner

## 品牌与视觉方向

### 气质与意象
深夜录音棚——柔和青色氛围灯包裹的专业语音实验室。深茄子皮（aubergine）隔音墙面固定视线，中央悬浮呼吸般的音频光球，脉动随声波起伏。Part 2 提示卡像橙色霓虹便签贴在调音台上。首页则是明亮白底+紫蓝渐变品牌卡片，形成"准备→沉浸"的视觉对比。

### 配色方案
| Token | 值 | 意象 |
|-------|-----|------|
| `--ink` | `#171127` | 深墨——主文字 |
| `--aubergine` | `#21143a` | 深茄子——考试面板 |
| `--aubergine-2` | `#2d1b4d` | 略亮茄子——面板渐变 |
| `--violet` | `#7658ff` | 品牌紫——按钮/强调 |
| `--cyan` | `#7ce7ff` | 亮青——光球/高分 |
| `--blue` | `#3e9dff` | 品牌蓝——辅助 |
| `--orange` | `#f3a04a` | 橙色——Part 2 提示卡 |
| `--paper` | `#f7f6fb` | 浅灰白——背景 |
| `--muted` | `#777286` | 灰——辅助文字 |
| `--success` | `#2dba7d` | 翠绿——正面证据 |
| `--danger` | `#e85c74` | 珊瑚红——限制证据 |

### 字体排版
- 标题：`Iowan Old Style`, `Baskerville`, Georgia, serif（编辑体衬线）
- 正文：`Avenir Next`, Avenir, `Helvetica Neue`, sans-serif
- 排版节奏：标题 clamp(52px, 6.1vw, 90px)，正文 clamp(15px, 1.5vw, 19px)

### 动效与交互
- 音频光球：CSS pulse 动画 2.8s ease-out infinite，scale(0.8)→scale(1.35) + opacity 渐隐
- 声波条：wave 动画 1.15s ease-in-out infinite，scaleY(0.35)↔scaleY(1)
- 分析光球：三根竖条交错动画
- 按钮 hover：translateY(-1px) + box-shadow 增强
- Part 2 卡片：橙色渐变 + inset 高光

### 设计禁忌
- 不要用纯黑背景——用深茄子皮渐变
- 不要用 sans-serif 做标题——用衬线体 Iowan/Baskerville
- 不要用超过 34px 的圆角（保持克制）
- 不要用 emoji 作为 UI 元素
- 不要在考试面板使用白色背景
