# TB IELTS Speaking Mock Examiner

## 项目概览

匿名 IELTS 口语模拟考试应用。支持 Part 1/2/3 完整流程，逐轮录音、服务端 OpenRouter 音频分析 + 双评估器评分 + 仲裁，返回中文书面反馈和可播放的 Mandarin 语音反馈。

## 核心目录

```
src/
├── app/
│   ├── api/
│   │   ├── analyse-turn/route.ts  # 单轮音频分析 (OpenRouter audio model)
│   │   ├── score/route.ts         # 双评估器评分 + 仲裁 (OpenRouter scoring model)
│   │   └── feedback-audio/route.ts # Mandarin TTS 语音反馈 (minimax/speech-2.8-hd)
│   ├── page.tsx                    # 主考试页面 (client component)
│   ├── layout.tsx                  # 根布局
│   └── globals.css                 # 全局样式 + 设计 tokens
├── lib/
│   ├── audio.ts                    # blobToMonoWav + preferredMimeType
│   ├── openrouter.ts               # OpenRouter API 封装 (chatJson + createSpeech)
│   ├── rubric.ts                   # IELTS 评分标准 + OUTPUT_CONTRACT + roundHalf
│   └── types.ts                    # 核心类型定义
public/
├── data/
│   ├── mock-tests.json             # 128 套完整测试题
│   └── examiner-audio.json         # 691 条 en-GB-SoniaNeural 考官音频映射
└── audio/examiner/                 # 691 个预生成 MP3 文件
scripts/
├── assemble_tests.py               # 题库组装
├── build_topic_bank.py             # 主题库构建
├── generate_examiner_audio.py      # 考官音频生成
├── map_topics.py                   # 主题映射
├── verify_dataset.py               # 数据集验证
└── verify_examiner_audio.py        # 音频验证
tests/
└── contracts.test.mjs              # 契约测试 (128 tests, 691 audio)
```

## 考试流程

1. **Home** → 选择测试集 + 麦克风检查
2. **Live** → Part 1 (3组问题) → Part 2 (1分钟准备+2分钟录音+结束问题) → Part 3 (3个讨论问题)
3. **Analysing** → 每轮音频并行上传 analyse-turn → 全部完成后 score 双评估
4. **Result** → 显示总分 + 四项分数 + 中文诊断 + 证据修正 + 优先方案 + 七天计划 + TTS 语音反馈

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/analyse-turn` | POST (FormData) | 上传 WAV 音频，OpenRouter audio model 返回转写+音频证据 |
| `/api/score` | POST (JSON) | 传入 analyses 数组，双评估器独立评分，>0.5 分差触发仲裁 |
| `/api/feedback-audio` | POST (JSON) | 传入中文文本，minimax TTS 返回 MP3 音频 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENROUTER_API_KEY` | OpenRouter API 密钥 |
| `OPENROUTER_AUDIO_MODEL` | 音频分析模型 (默认: mistralai/voxtral-small-24b-2507) |
| `OPENROUTER_SCORING_MODEL` | 评分模型 (默认: deepseek/deepseek-v4-flash) |

## 设计系统

- 首页：明亮白底 + 紫蓝渐变品牌卡片 + 衬线体大标题
- 考试面板：深茄子皮渐变 + 中央音频光球 + 青色脉冲波纹
- Part 2 提示卡：橙色渐变 + inset 高光
- 结果页：深色 hero + 浅色报告卡片
- 详见 `DESIGN.md`

---

# 项目上下文

### 版本技术栈

- **Framework**: Next.js 15 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **Styling**: 纯 CSS (globals.css)
- **Icons**: lucide-react

## 目录结构

```
├── public/                 # 静态资源 (128 tests + 691 MP3)
├── scripts/                # 数据构建与验证脚本
├── src/
│   ├── app/                # 页面路由与 API
│   └── lib/                # 工具库
├── tests/                  # 契约测试
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 包管理规范

**仅允许使用 pnpm** 作为包管理器。

## 开发规范

### 编码规范

- TypeScript strict 模式
- 禁止隐式 any
- 所有函数参数必须有类型标注

### Hydration 问题防范

- 使用 'use client' 配合 useEffect + useState 处理客户端动态内容
- 禁止使用 head 标签，使用 metadata API
