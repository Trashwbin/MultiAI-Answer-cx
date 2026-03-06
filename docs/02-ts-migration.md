# TypeScript 迁移需求文档

> **文档状态**: Draft  
> **模块**: TypeScript 迁移  
> **最终位置**: `MultiAI-Answer-cx/docs/02-ts-migration.md`

---

## 1. 迁移目标

将现有全部 JavaScript 代码重写为 TypeScript，引入构建工具链，建立类型安全的代码基础。

---

## 2. 当前代码清单

### 2.1 需要重写的文件

| 文件 | 行数 | 模块 | 迁移优先级 |
|---|---|---|---|
| `src/config/config.js` | 249 | 配置 | P0 (基础) |
| `src/background/background.js` | 704 | Service Worker | P0 (核心) |
| `src/content/main.js` | 477 | 内容脚本入口 | P0 (核心) |
| `src/content/question/questionExtractor.js` | 359 | 题目提取 | P1 |
| `src/content/question/handlers/answerHandler.js` | 1618+ | 答案处理 | P1 (最大文件) |
| `src/content/question/handlers/questionHandlers.js` | 469 | 题型处理器 | P1 |
| `src/content/question/handlers/answerFormatter.js` | 37 | 答案格式化 | P2 (小) |
| `src/content/question/handlers/autoFill.js` | 603 | 自动填写 | P1 |
| `src/content/question/handlers/questionToImage.js` | ? | 截图 | P2 |
| `src/content/question/previewModal.js` | ? | 预览模态框 | P1 |
| `src/content/ai/aiConfigModal.js` | ? | AI配置模态框 | P1 |
| `src/content/ai/debugPanel.js` | ? | 调试面板 | P2 |
| `src/content/utils/notification.js` | ? | 通知 | P2 |
| `src/popup/popup.js` | ? | 弹出菜单 | P1 |
| 9x `src/content/ai/*-content.js` | ~200/个 | AI内容脚本 | **删除** (被 providers/ 替代) |

### 2.2 迁移后不再需要的文件

以下文件在 v2 中将被 **完全删除**（被 chat2api 替代）：

- `src/content/ai/kimi-content.js`
- `src/content/ai/deepseek-content.js`
- `src/content/ai/tongyi-content.js`
- `src/content/ai/chatglm-content.js`
- `src/content/ai/chatgpt-content.js`
- `src/content/ai/gemini-content.js`
- `src/content/ai/yiyan-content.js`
- `src/content/ai/xinghuo-content.js`
- `src/content/ai/doubao-content.js`
- `src/content/ai/debugPanel.js` (合并到开发工具)

---

## 3. TypeScript 配置

### 3.1 tsconfig.json 要求

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["chrome"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**关键要求:**
- `strict: true` — 全量严格模式，不允许 `any`
- `noUncheckedIndexedAccess: true` — 数组/对象索引返回 `| undefined`
- `types: ["chrome"]` — Chrome Extension API 类型 (`@types/chrome`)

### 3.2 构建工具

**推荐**: `tsup` (简单) 或 `Vite` + `@crxjs/vite-plugin` (功能丰富)

构建要求:
- 输出多个 entry point: background, content-script, popup, auth-content
- 支持 Chrome Extension MV3 的 Service Worker 格式
- 内联或 bundle 所有依赖 (Extension 不支持 node_modules)
- 生成 source maps (开发模式)

### 3.3 依赖

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "@types/chrome": "latest",
    "tsup": "latest"
  }
}
```

---

## 4. 类型系统设计

### 4.1 核心类型 (`src/types/question.ts`)

```typescript
/** 题型枚举 */
export enum QuestionType {
  SingleChoice = 'single_choice',
  MultipleChoice = 'multiple_choice',
  FillBlank = 'fill_blank',
  TrueFalse = 'true_false',
  ShortAnswer = 'short_answer',
  TermDefinition = 'term_definition',
  Essay = 'essay',
  Other = 'other'
}

/** 选项 */
export interface QuestionOption {
  label: string;    // "A", "B", "C", "D"
  content: string;  // 选项文本
}

/** 题目 */
export interface Question {
  id: string;                    // 学习通题目 ID
  number: number;                // 全局题号
  type: QuestionType;            // 标准题型
  content: string;               // 题目文本
  options: QuestionOption[];     // 选项 (选择题)
  blankCount: number;            // 填空数量 (填空题)
  rawHtml?: string;              // 原始 HTML (调试用)
}
```

### 4.2 答案类型 (`src/types/answer.ts`)

```typescript
/** 单题答案 */
export interface QuestionAnswer {
  questionNumber: number;
  questionType: QuestionType;
  answer: string | string[];     // 选择题: "A" | 填空题: ["答案1", "答案2"]
  confidence?: number;           // 0-1, AI 自报置信度
  analysis?: string;             // 解析文本
}

/** 单个 AI 的完整响应 */
export interface ProviderResponse {
  provider: string;              // "deepseek", "kimi", ...
  answers: QuestionAnswer[];     // 所有题目的答案
  rawResponse?: string;          // 原始响应 (调试用)
  responseTime: number;          // 响应时间 (ms)
  error?: string;                // 错误信息
}

/** 最终答案 (投票后) */
export interface FinalAnswer {
  questionNumber: number;
  questionType: QuestionType;
  answer: string | string[];
  sources: {                     // 投票来源
    provider: string;
    answer: string | string[];
    weight: number;
  }[];
  consensusLevel: 'unanimous' | 'majority' | 'weighted' | 'fallback';
}
```

### 4.3 Provider 类型 (`src/types/provider.ts`)

```typescript
/** Provider 认证凭据 */
export interface AuthCredentials {
  cookie: string;
  bearer?: string;
  userAgent?: string;
  expiresAt?: number;            // 过期时间戳
}

/** Provider 配置 */
export interface ProviderConfig {
  id: string;                    // "deepseek", "kimi", ...
  name: string;                  // 显示名称
  domain: string;                // "chat.deepseek.com"
  color: string;                 // UI 颜色
  weight: number;                // 投票权重
  enabled: boolean;              // 是否启用
}

/** Provider 接口 — 所有 AI 必须实现 */
export interface AIProvider {
  readonly config: ProviderConfig;
  
  /** 检查认证是否有效 */
  checkAuth(): Promise<boolean>;
  
  /** 查询 AI */
  query(questions: Question[], prompt: string): Promise<ProviderResponse>;
}
```

---

## 5. 迁移策略

### 5.1 迁移顺序

```
Phase 1: 基础设施
├── package.json + tsconfig.json + 构建配置
├── src/types/ (所有类型定义)
└── src/config/ (配置 → TypeScript)

Phase 2: 核心模块 (全新编写)
├── src/providers/base-provider.ts
├── src/auth/ (token 管理, cookie 捕获)
├── src/core/ (编排器, 聚合器, 投票)
└── src/background/index.ts

Phase 3: 前端迁移 (重写)
├── src/content/extractor/ (从 questionExtractor.js 迁移)
├── src/content/panel/ (从 answerHandler.js 拆分)
├── src/content/editors/ (从 questionHandlers.js 迁移)
├── src/content/auto-fill/ (从 autoFill.js 迁移)
└── src/content/main.ts

Phase 4: UI 迁移
├── src/popup/ (从 popup.js 迁移)
└── manifest.json 更新
```

### 5.2 关键迁移规则

1. **禁止 `any`** — 使用 `unknown` + type guard 替代
2. **禁止 `window.*` 全局变量** — 使用模块 import/export
3. **禁止 DOM innerHTML 拼接** — 使用 `document.createElement` 或模板
4. **所有 API 类型化** — chrome.runtime.sendMessage 使用泛型消息类型
5. **错误处理类型化** — 自定义 Error 子类，不使用裸 string

### 5.3 消息类型系统

```typescript
/** Extension 内部消息 — 替代现有的裸 string type */
type ExtensionMessage =
  | { type: 'QUERY_AI'; payload: { questions: Question[]; providers: string[] } }
  | { type: 'AI_RESPONSE'; payload: ProviderResponse }
  | { type: 'SHOW_ANSWERS'; payload: FinalAnswer[] }
  | { type: 'AUTH_STATUS'; payload: { provider: string; valid: boolean } }
  | { type: 'START_GUIDED_LOGIN'; payload: { provider: string } }
  | { type: 'LOGIN_COMPLETE'; payload: { provider: string; credentials: AuthCredentials } };
```
