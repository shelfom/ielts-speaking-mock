# TB IELTS Speaking Mock Examiner

## 项目概览

匿名 IELTS 口语模拟考试应用。支持 Part 1/2/3 完整流程，逐轮录音、服务端 AI 评分（FC/LR/GRA/P 四项 + 总分），返回中文书面反馈和可播放的语音反馈。

## 核心目录

```
src/
├── app/
│   ├── api/
│   │   ├── asr/route.ts        # 语音识别 (ASR) - coze-coding-dev-sdk ASRClient
│   │   ├── score/route.ts      # AI 评分 - coze-coding-dev-sdk LLMClient (doubao-seed-2-0-pro)
│   │   └── tts/route.ts        # 语音合成 (TTS) - coze-coding-dev-sdk TTSClient
│   ├── page.tsx                 # 主考试页面 (client component)
│   ├── layout.tsx               # 根布局
│   └── globals.css              # 全局样式 + 设计 tokens
├── components/exam/
│   ├── audio-orb.tsx            # 中央音频光球组件
│   ├── cue-card.tsx             # Part 2 橙色提示卡
│   └── results-panel.tsx        # 成绩反馈面板
├── hooks/
│   └── use-audio-recorder.ts    # 浏览器录音 hook
└── lib/
    ├── types.ts                 # 核心类型定义
    ├── question-bank.ts         # 题库 (placeholder, 待替换 128 套)
    └── utils.ts                 # cn() 工具
```

## 考试流程

1. **Idle** → 点击 Start Mock Test
2. **Part 1** → 3 个短问题，每个录音 → ASR 转写
3. **Part 2** → 1 分钟准备 + 1-2 分钟录音 → ASR 转写
4. **Part 3** → 3 个讨论问题，每个录音 → ASR 转写
5. **Scoring** → 所有转写文本发送到 LLM 评分
6. **Results** → 显示分数 + 中文书面反馈 + TTS 语音反馈

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/asr` | POST (FormData) | 上传音频文件，返回转写文本 |
| `/api/score` | POST (JSON) | 传入转写文本数组，返回 IELTS 评分 |
| `/api/tts` | POST (JSON) | 传入中文文本，返回 TTS 音频 URI |

## 设计系统

- 深色音频优先 UI：深青黑背景 + 茄子皮面板
- 中央音频光球：luminous cyan 呼吸/录音动画
- Part 2 提示卡：橙色霓虹风格
- 分数颜色：>=7 翠绿，>=5.5 琥珀，<5.5 珊瑚红
- 详见 `DESIGN.md`

---

# 项目上下文

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
│   ├── build.sh            # 构建脚本
│   ├── dev.sh              # 开发环境启动脚本
│   ├── prepare.sh          # 预处理脚本
│   └── start.sh            # 生产环境启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── lib/                # 工具库
│   │   └── utils.ts        # 通用工具函数 (cn)
│   └── server.ts           # 自定义服务端入口
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

- 项目文件（如 app 目录、pages 目录、components 等）默认初始化到 `src/` 目录下。

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。

### next.config 配置规范

- 配置的路径不要写死绝对路径，必须使用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。

### Hydration 问题防范

1. 严禁在 JSX 渲染逻辑中直接使用 typeof window、Date.now()、Math.random() 等动态数据。**必须使用 'use client' 并配合 useEffect + useState 确保动态内容仅在客户端挂载后渲染**；同时严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）。
2. **禁止使用 head 标签**，优先使用 metadata，详见文档：https://nextjs.org/docs/app/api-reference/functions/generate-metadata
   1. 三方 CSS、字体等资源可在 `globals.css` 中顶部通过 `@import` 引入或使用 next/font
   2. preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入
   3. json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld

## UI 设计与组件规范 (UI & Styling Standards)

- 模板默认预装核心组件库 `shadcn/ui`，位于`src/components/ui/`目录下
- Next.js 项目**必须默认**采用 shadcn/ui 组件、风格和规范，**除非用户指定用其他的组件和规范。**
