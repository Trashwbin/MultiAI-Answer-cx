# MultiAI-Answer-cx v2 架构设计文档

> **文档状态**: Draft  
> **模块**: 整体架构  
> **最终位置**: `MultiAI-Answer-cx/docs/01-architecture-overview.md`

---

## 1. 项目概述

MultiAI-Answer-cx 是一个 Chrome Extension (MV3)，用于在学习通 (Chaoxing) 平台上自动提取题目、调用多个 AI 服务获取答案、通过投票机制选择最佳答案并自动填写。

### 1.1 v1 架构 (当前)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Chrome Extension (MV3)                           │
│                                                                         │
│  Content Scripts (学习通)          Content Scripts (AI 网站 x9)          │
│  ┌──────────────────────┐        ┌──────────────────────────────┐      │
│  │ questionExtractor.js │        │ kimi-content.js              │      │
│  │ answerHandler.js     │        │ deepseek-content.js          │      │
│  │ autoFill.js          │  MSG   │ tongyi-content.js            │      │
│  │ main.js              │◄─────►│ chatglm-content.js           │      │
│  └──────────────────────┘        │ chatgpt-content.js           │      │
│             │                    │ gemini-content.js            │      │
│             │                    │ yiyan-content.js             │      │
│  Service Worker                  │ xinghuo-content.js           │      │
│  ┌──────────────────────┐        │ doubao-content.js            │      │
│  │ background.js        │        └──────────────────────────────┘      │
│  │ - 窗口管理 (9个!)    │               ▲                              │
│  │ - 消息路由           │               │                              │
│  │ - 标签页切换         │               │ DOM 操作                     │
│  └──────────────────────┘               ▼                              │
│                                  ┌──────────────────────────────┐      │
│                                  │ AI 网站弹窗 (9个独立窗口)    │      │
│                                  │ - 打开 kimi.com              │      │
│                                  │ - 注入 JS 操作输入框         │      │
│                                  │ - 监听 DOM 获取答案          │      │
│                                  └──────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

**v1 核心问题:**
- 9个 AI content script + 9个弹窗 = 极高复杂度
- DOM 操作脆弱，AI 网站改版即失效
- 纯文本正则解析，简答题投票完全无效
- 无法利用 AI 的结构化输出能力

### 1.2 v2 架构 (目标)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Chrome Extension (MV3)                           │
│                                                                         │
│  Content Script (仅学习通)         Service Worker (Background)           │
│  ┌──────────────────────┐        ┌──────────────────────────────┐      │
│  │ question-extractor/  │        │ core/                        │      │
│  │   └─ extractor.ts    │  MSG   │   ├─ orchestrator.ts         │      │
│  │ answer-panel/        │◄─────►│   ├─ answer-aggregator.ts    │      │
│  │   ├─ panel.ts        │        │   └─ voting.ts              │      │
│  │   ├─ editors/        │        │                              │      │
│  │   └─ auto-fill.ts    │        │ providers/      (chat2api)   │      │
│  │ ui/                  │        │   ├─ base-provider.ts        │      │
│  │   └─ notification.ts │        │   ├─ deepseek.ts            │      │
│  └──────────────────────┘        │   ├─ kimi.ts                │      │
│                                  │   ├─ claude.ts              │      │
│  Popup / Options                 │   ├─ chatgpt.ts             │      │
│  ┌──────────────────────┐        │   └─ ... (12+ providers)    │      │
│  │ settings/            │        │                              │      │
│  │   ├─ ai-config.ts    │        │ auth/                        │      │
│  │   ├─ auth-status.ts  │        │   ├─ token-manager.ts       │      │
│  │   └─ prompt-editor.ts│        │   ├─ cookie-capture.ts      │      │
│  └──────────────────────┘        │   └─ guided-login.ts        │      │
│                                  │                              │      │
│  Auth Capture (轻量)             │ types/                       │      │
│  ┌──────────────────────┐        │   ├─ question.ts            │      │
│  │ auth-content.ts      │        │   ├─ answer.ts              │      │
│  │ (注入 AI 登录页,     │        │   └─ provider.ts            │      │
│  │  仅检测登录状态)     │        └──────────────────────────────┘      │
│  └──────────────────────┘                    │                         │
│                                              │ HTTP fetch()            │
│                                              ▼                         │
│                                  ┌──────────────────────────────┐      │
│                                  │ AI HTTP APIs (直接调用)       │      │
│                                  │ - chat.deepseek.com/api/v0/  │      │
│                                  │ - kimi.moonshot.cn/api/      │      │
│                                  │ - claude.ai/api/             │      │
│                                  │ - ... (无需打开网页!)        │      │
│                                  └──────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

**v2 核心优势:**
- 零弹窗 — 所有 AI 调用通过 HTTP API，不打开网页
- 结构化 I/O — JSON 请求/响应，解析准确率大幅提升
- TypeScript — 类型安全，可维护性强
- 统一 Provider 接口 — 新增 AI 只需实现一个接口
- 引导式登录 — 一次配置，自动维护 token

---

## 2. 技术栈

| 层次 | v1 (当前) | v2 (目标) |
|---|---|---|
| **语言** | JavaScript (ES6) | TypeScript 5.x |
| **构建** | 无 (裸 JS 直接加载) | Vite/tsup + Chrome Extension 构建 |
| **AI 调用** | DOM 操作 (content script) | HTTP API 直调 (Service Worker fetch) |
| **答案格式** | 纯文本 + 正则解析 | JSON Schema + 容错解析器 |
| **认证** | 浏览器窗口 cookie 共享 | chrome.cookies + webRequest 捕获 |
| **状态管理** | window 全局变量 | chrome.storage + TypeScript 模块 |
| **类型系统** | 无 | 全量 TypeScript 类型定义 |

---

## 3. 模块划分

### 3.1 核心模块

| 模块 | 目录 | 职责 |
|---|---|---|
| **types** | `src/types/` | 所有 TypeScript 类型定义 |
| **config** | `src/config/` | AI 配置、题型配置、提示词配置 |
| **providers** | `src/providers/` | 各 AI 的 chat2api 客户端实现 |
| **auth** | `src/auth/` | Token 管理、Cookie 捕获、引导式登录 |
| **core** | `src/core/` | 编排器、答案聚合器、投票逻辑 |

### 3.2 前端模块 (Content Script)

| 模块 | 目录 | 职责 |
|---|---|---|
| **extractor** | `src/content/extractor/` | 题目提取 (学习通 DOM → Question[]) |
| **panel** | `src/content/panel/` | 答案展示面板 UI |
| **editors** | `src/content/editors/` | 各题型的答案编辑器 |
| **auto-fill** | `src/content/auto-fill/` | 自动填写到学习通 |

### 3.3 UI 模块

| 模块 | 目录 | 职责 |
|---|---|---|
| **popup** | `src/popup/` | Extension 弹出菜单 |
| **options** | `src/options/` | 设置页 (AI 配置、Auth 状态、提示词) |

---

## 4. 数据流

```
[学习通页面]
     │
     │ 1. Content Script 提取题目
     ▼
┌─────────────┐
│ Question[]  │  ── 标准化 JSON ──►  Service Worker
│ (结构化)    │                          │
└─────────────┘                          │
                                         │ 2. Orchestrator 并行调用 N 个 Provider
                                         ▼
                               ┌──────────────────┐
                               │ Provider.query()  │  ×N (并行)
                               │                   │
                               │ - 构建 prompt     │
                               │ - 附加 JSON 格式  │
                               │ - HTTP fetch()    │
                               │ - 解析 JSON 响应  │
                               └──────────────────┘
                                         │
                                         │ 3. 收集全部响应
                                         ▼
                               ┌──────────────────┐
                               │ AnswerResult[]    │  ── 聚合 ──►  voting.ts
                               │ (每个 AI 的答案)  │                   │
                               └──────────────────┘                   │
                                                                      │ 4. 投票选出最终答案
                                                                      ▼
                                                            ┌──────────────────┐
                                                            │ FinalAnswer[]    │
                                                            │ (每题的最终答案)  │
                                                            └──────────────────┘
                                                                      │
                                         5. 发送到 Content Script      │
                                                                      ▼
                                                            ┌──────────────────┐
                                                            │ 答案面板展示      │
                                                            │ + 可编辑         │
                                                            │ + 自动填写       │
                                                            └──────────────────┘
```

---

## 5. AI Provider 列表 (v2 目标)

| Provider | 域名 | 来源 | 认证方式 |
|---|---|---|---|
| DeepSeek | chat.deepseek.com | openclaw ✅ | Cookie + Bearer |
| Claude | claude.ai | openclaw ✅ | Cookie + Organization |
| ChatGPT | chatgpt.com | openclaw ✅ | Cookie + Session |
| Gemini | gemini.google.com | openclaw ✅ | Cookie |
| Doubao (豆包) | doubao.com | openclaw ✅ | Cookie |
| Kimi | kimi.com | openclaw ✅ | Cookie + access_token |
| Grok | grok.com | openclaw ✅ | Cookie |
| Qwen (通义) | chat.qwen.ai / qianwen.com | openclaw ✅ | Cookie |
| ChatGLM (智谱) | chatglm.cn | openclaw ✅ | Cookie |
| Manus | manus.im | openclaw ✅ | API Key |

> 参考: `openclaw-zero-token/src/providers/` 已实现的 auth + client

---

## 6. 与 openclaw-zero-token 的关系

本项目 **不是** openclaw 的 fork，而是 **参考其 provider 实现模式**：

| 借鉴内容 | openclaw 位置 | 本项目应用 |
|---|---|---|
| Auth 捕获逻辑 | `src/providers/*-auth.ts` | `src/auth/` 模块 (改用 chrome.cookies API) |
| HTTP API 客户端 | `src/providers/*-client.ts` | `src/providers/` 模块 (直接 fetch) |
| API endpoint 和参数 | `*-client-browser.ts` | 参考请求格式和 headers |
| PoW 挑战 (DeepSeek) | `deepseek-web-client.ts` | 需要移植 PoW 解算 |

**不借鉴的部分**: Gateway server, 配置系统, 多 agent, 插件系统 — 这些超出 Chrome Extension 的范围。

---

## 7. 构建与部署

### 7.1 构建工具链

```
TypeScript (.ts)
     │
     ├─ tsup / Vite ──► dist/background.js (Service Worker)
     ├─ tsup / Vite ──► dist/content.js    (Content Script, 学习通)
     ├─ tsup / Vite ──► dist/auth.js       (Content Script, AI 登录页)
     └─ tsup / Vite ──► dist/popup.js      (Popup UI)
                              │
                              ▼
                        manifest.json (生成)
                              │
                              ▼
                        dist/ (可安装的 Extension)
```

### 7.2 项目目录结构 (v2)

```
MultiAI-Answer-cx/
├── src/
│   ├── types/                    # TypeScript 类型
│   │   ├── question.ts           # Question, QuestionType, Option
│   │   ├── answer.ts             # Answer, AnswerResult, FinalAnswer
│   │   ├── provider.ts           # Provider, ProviderConfig, AuthCredentials
│   │   └── config.ts             # AppConfig, PromptConfig
│   │
│   ├── config/                   # 配置
│   │   ├── ai-config.ts          # AI 提供商配置
│   │   ├── question-types.ts     # 题型常量
│   │   └── prompts.ts            # 提示词模板
│   │
│   ├── providers/                # AI Provider 实现 (chat2api)
│   │   ├── base-provider.ts      # 抽象基类
│   │   ├── deepseek.ts
│   │   ├── kimi.ts
│   │   ├── claude.ts
│   │   ├── chatgpt.ts
│   │   ├── gemini.ts
│   │   ├── doubao.ts
│   │   ├── grok.ts
│   │   ├── qwen.ts
│   │   ├── chatglm.ts
│   │   └── manus.ts
│   │
│   ├── auth/                     # 认证管理
│   │   ├── token-manager.ts      # Token 存储、过期检查、刷新
│   │   ├── cookie-capture.ts     # chrome.cookies API 封装
│   │   ├── request-interceptor.ts # webRequest 拦截 bearer
│   │   └── guided-login.ts       # 引导式登录流程
│   │
│   ├── core/                     # 核心业务逻辑
│   │   ├── orchestrator.ts       # 并行调用编排
│   │   ├── answer-aggregator.ts  # 答案收集和聚合
│   │   ├── voting.ts             # 投票/共识算法
│   │   └── json-parser.ts        # JSON 容错解析
│   │
│   ├── content/                  # Content Script (学习通)
│   │   ├── extractor/            # 题目提取
│   │   ├── panel/                # 答案面板 UI
│   │   ├── editors/              # 题型编辑器
│   │   ├── auto-fill/            # 自动填写
│   │   └── main.ts               # 入口
│   │
│   ├── popup/                    # Popup UI
│   ├── options/                  # 设置页
│   │
│   └── background/               # Service Worker 入口
│       └── index.ts
│
├── manifest.json
├── tsconfig.json
├── vite.config.ts / tsup.config.ts
├── package.json
└── docs/                         # 需求文档 (本文档等)
```
