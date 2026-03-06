# Chat2API 层 & 认证管理需求文档

> **文档状态**: Draft  
> **模块**: API 层重构 + 引导式登录  
> **最终位置**: `MultiAI-Answer-cx/docs/03-chat2api-layer.md`  
> **参考**: `openclaw-zero-token/src/providers/`

---

## 1. 概述

将当前"打开 AI 网页 → DOM 操作"的方式，替换为"直接调用 AI 内部 HTTP API"。

### 1.1 v1 → v2 对比

```
v1: Extension → 打开 kimi.com 弹窗 → content script 找到输入框 → 粘贴 → 等渲染 → 读 DOM
v2: Extension → fetch("https://kimi.moonshot.cn/api/chat/...") → 解析 JSON/SSE 响应
```

---

## 2. Provider 抽象层

### 2.1 基类接口

```typescript
// src/providers/base-provider.ts

export abstract class BaseProvider implements AIProvider {
  abstract readonly config: ProviderConfig;
  
  /** 子类实现: 发送请求到 AI API */
  protected abstract sendRequest(
    prompt: string, 
    credentials: AuthCredentials
  ): Promise<string>;
  
  /** 子类实现: 解析响应为结构化答案 */
  protected abstract parseResponse(raw: string): QuestionAnswer[];
  
  /** 子类实现: 验证 credentials 是否仍然有效 */
  abstract checkAuth(): Promise<boolean>;
  
  /** 公共入口 */
  async query(questions: Question[], prompt: string): Promise<ProviderResponse> {
    const credentials = await tokenManager.getCredentials(this.config.id);
    if (!credentials) throw new AuthError(this.config.id);
    
    const fullPrompt = this.buildPrompt(questions, prompt);
    const startTime = Date.now();
    
    const raw = await this.sendRequest(fullPrompt, credentials);
    const answers = this.parseResponse(raw);
    
    return {
      provider: this.config.id,
      answers,
      rawResponse: raw,
      responseTime: Date.now() - startTime
    };
  }
  
  /** 构建完整 prompt (题目 + JSON 格式要求) */
  protected buildPrompt(questions: Question[], promptTemplate: string): string {
    // 将 Question[] 序列化为结构化文本 + JSON 输出要求
    // 详见 04-json-format-and-prompts.md
  }
}
```

### 2.2 Provider 注册表

```typescript
// src/providers/registry.ts

const providers: Map<string, AIProvider> = new Map();

export function registerProvider(provider: AIProvider): void {
  providers.set(provider.config.id, provider);
}

export function getProvider(id: string): AIProvider | undefined {
  return providers.get(id);
}

export function getEnabledProviders(): AIProvider[] {
  return [...providers.values()].filter(p => p.config.enabled);
}
```

---

## 3. 各 Provider 实现参考

### 3.1 DeepSeek

**参考源**: `openclaw-zero-token/src/providers/deepseek-web-client.ts`

| 项目 | 详情 |
|---|---|
| **API Endpoint** | `https://chat.deepseek.com/api/v0/chat/completion` |
| **认证** | Cookie + Bearer token |
| **特殊要求** | PoW (Proof of Work) 挑战: `/api/v0/chat/create_pow_challenge` |
| **请求格式** | `{ prompt, model_class, temperature, ... }` |
| **响应格式** | SSE (Server-Sent Events) 流式 |
| **关键 Headers** | `x-client-platform: web`, `x-client-version`, Bearer Auth |

**PoW 注意**: DeepSeek 需要解算 SHA3 哈希挑战才能发起对话。openclaw 内嵌了 WASM 解算器 (`SHA3_WASM_B64`)。需要移植此逻辑。

```typescript
// 简化的 DeepSeek Provider 结构
class DeepSeekProvider extends BaseProvider {
  config = { id: 'deepseek', domain: 'chat.deepseek.com', ... };
  
  protected async sendRequest(prompt: string, cred: AuthCredentials) {
    // 1. 创建会话: POST /api/v0/chat/create_session
    // 2. 获取 PoW 挑战: POST /api/v0/chat/create_pow_challenge
    // 3. 解算 PoW (WASM SHA3)
    // 4. 发送消息: POST /api/v0/chat/completion (带 pow_answer)
    // 5. 读取 SSE 流直到完成
  }
}
```

### 3.2 Kimi

**参考源**: `openclaw-zero-token/src/providers/kimi-web-client-browser.ts`

| 项目 | 详情 |
|---|---|
| **API Endpoint** | `https://kimi.moonshot.cn/api/chat/...` |
| **认证** | Cookie (含 access_token) |
| **请求格式** | 标准 chat completion |
| **响应格式** | SSE 流式 |

### 3.3 Claude

**参考源**: `openclaw-zero-token/src/providers/claude-web-client.ts`

| 项目 | 详情 |
|---|---|
| **API Endpoint** | `https://claude.ai/api/organizations/{org}/chat_conversations/{id}/completion` |
| **认证** | Cookie + Organization ID |
| **特殊要求** | 需要先获取 org ID, 创建 conversation |
| **响应格式** | SSE 流式 |

### 3.4 ChatGPT

**参考源**: `openclaw-zero-token/src/providers/chatgpt-web-client-browser.ts`

| 项目 | 详情 |
|---|---|
| **API Endpoint** | `https://chatgpt.com/backend-api/conversation` |
| **认证** | Cookie + Session token |
| **响应格式** | SSE 流式 |

### 3.5 其他 Provider

| Provider | 参考文件 | 关键差异 |
|---|---|---|
| Gemini | `gemini-web-client-browser.ts` | Google OAuth, 特殊 API 格式 |
| Doubao | `doubao-web-client-browser.ts` | 标准 cookie auth |
| Grok | `grok-web-client-browser.ts` | X/Twitter 认证关联 |
| Qwen | `qwen-web-client-browser.ts` | 国内版/国际版两个域名 |
| ChatGLM | `glm-web-client-browser.ts` | 标准 cookie auth |
| Manus | `manus-api-client.ts` | **唯一的 API Key 方式** (非 web auth) |

---

## 4. 认证管理 (Auth)

### 4.1 引导式登录流程

```
用户点击 "连接 DeepSeek"
     │
     ▼
chrome.tabs.create({ url: "https://chat.deepseek.com" })
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Auth Content Script (注入 AI 登录页)                │
│                                                      │
│  方式 1: chrome.cookies API                          │
│  - 定时检查 cookie 是否包含关键字段                    │
│  - DeepSeek: ds_session_id, d_id                     │
│  - Kimi: access_token                                │
│  - Claude: __cf_bm, sessionKey                       │
│                                                      │
│  方式 2: chrome.webRequest (备选)                     │
│  - 监听 AI 域名的 API 请求                            │
│  - 提取 Authorization: Bearer xxx                    │
│                                                      │
│  方式 3: Content Script DOM 检测 (备选)               │
│  - 监测页面状态变化 (如出现用户头像)                    │
│  - 读取 localStorage/sessionStorage                   │
└─────────────────────────────────────────────────────┘
     │
     │ 检测到登录成功
     ▼
chrome.storage.local.set({
  'auth:deepseek': {
    cookie: "ds_session_id=xxx; d_id=yyy; ...",
    bearer: "eyJhbGci...",
    userAgent: "Mozilla/5.0...",
    capturedAt: 1709712000000,
    expiresAt: 1710316800000    // 估算过期时间
  }
})
     │
     ▼
关闭标签页, 显示 "DeepSeek 已连接 ✓"
```

### 4.2 Token Manager

```typescript
// src/auth/token-manager.ts

export class TokenManager {
  /** 获取 credentials, 如果过期返回 null */
  async getCredentials(providerId: string): Promise<AuthCredentials | null>;
  
  /** 保存 credentials */
  async saveCredentials(providerId: string, cred: AuthCredentials): Promise<void>;
  
  /** 检查 token 是否仍然有效 (发起轻量请求验证) */
  async validateCredentials(providerId: string): Promise<boolean>;
  
  /** 获取所有 provider 的认证状态 */
  async getAuthStatusAll(): Promise<Map<string, AuthStatus>>;
  
  /** 清除某个 provider 的凭据 */
  async clearCredentials(providerId: string): Promise<void>;
  
  /** 自动刷新 cookie (对于支持 refresh 的 provider) */
  async refreshIfNeeded(providerId: string): Promise<boolean>;
}

export interface AuthStatus {
  providerId: string;
  connected: boolean;
  lastValidated?: number;
  expiresAt?: number;
  error?: string;
}
```

### 4.3 各 Provider 的认证检测信号

| Provider | Cookie 关键字段 | Bearer 捕获方式 | 过期策略 |
|---|---|---|---|
| DeepSeek | `ds_session_id`, `d_id` | 拦截 `/api/v0/` 请求头 | ~7天, 需 PoW |
| Kimi | `access_token` | cookie 内含 | ~24h, 可能自动刷新 |
| Claude | `sessionKey`, `__cf_bm` | 拦截 `/api/` 请求头 | ~30天 |
| ChatGPT | `__Secure-next-auth.session-token` | cookie 内含 | ~30天 |
| Doubao | 待研究 | cookie | 待研究 |
| Gemini | Google 登录 cookie | cookie | 较长 |
| Grok | X 登录 cookie | cookie | 待研究 |
| Qwen | 待研究 | cookie | 待研究 |
| ChatGLM | 待研究 | cookie | 待研究 |

> **注**: 具体字段和过期策略需要在实现时逐个验证，openclaw 的 `*-auth.ts` 是最佳参考。

### 4.4 权限要求 (manifest.json 更新)

```jsonc
{
  "permissions": [
    "tabs",
    "storage",
    "cookies",           // 新增: 读取 AI 网站 cookie
    "webRequest"         // 新增: 拦截 API 请求捕获 bearer
  ],
  "host_permissions": [
    "https://*.chaoxing.com/*",
    // AI 域名 — 保留现有 + 新增
    "https://chat.deepseek.com/*",
    "https://*.kimi.com/*",
    "https://*.moonshot.cn/*",        // Kimi API 域名
    "https://claude.ai/*",            // 新增
    "https://chatgpt.com/*",
    "https://gemini.google.com/*",
    "https://*.doubao.com/*",
    "https://grok.com/*",             // 新增
    "https://chat.qwen.ai/*",         // 新增 (国际版)
    "https://qianwen.com/*",          // 新增 (国内版)
    "https://chatglm.cn/*",
    "https://chat.z.ai/*"             // 新增 (GLM 国际版)
  ]
}
```

---

## 5. 编排器 (Orchestrator)

```typescript
// src/core/orchestrator.ts

export class Orchestrator {
  /**
   * 并行查询所有启用的 AI Provider
   * 
   * 1. 获取所有启用的 providers
   * 2. 过滤掉 auth 失效的
   * 3. 并行发起请求 (Promise.allSettled)
   * 4. 收集成功的响应
   * 5. 交给 answer-aggregator 处理
   */
  async queryAll(
    questions: Question[],
    prompt: string
  ): Promise<{
    responses: ProviderResponse[];
    errors: { provider: string; error: string }[];
    finalAnswers: FinalAnswer[];
  }>;
}
```

**关键设计决策:**
- 使用 `Promise.allSettled` 而非 `Promise.all` — 一个 AI 失败不影响其他
- 无超时限制的 Provider 使用独立 `AbortController` 控制
- 全部完成后一次性返回 (非流式)，与 JSON 解析策略一致

---

## 6. Service Worker 生命周期管理

MV3 Service Worker 在 30 秒无活动后会休眠。对于可能耗时较长的 AI 查询：

**方案**: 使用 `chrome.alarms` 或端口 keep-alive

```typescript
// 在 AI 查询期间保持 Service Worker 活跃
let keepAlivePort: chrome.runtime.Port | null = null;

function startKeepAlive() {
  // Content script 打开一个长连接端口
  keepAlivePort = chrome.runtime.connect({ name: 'keep-alive' });
}

function stopKeepAlive() {
  keepAlivePort?.disconnect();
  keepAlivePort = null;
}
```

---

## 7. 错误处理

| 错误类型 | 处理方式 |
|---|---|
| Auth 过期 | 提示用户重新登录该 Provider |
| 网络错误 | 重试 1 次，仍失败则标记该 Provider 为 error |
| PoW 失败 (DeepSeek) | 重试解算 |
| 限流 (429) | 延迟重试，显示"该 AI 繁忙" |
| 响应解析失败 | 记录原始响应，标记该 Provider 答案为 null |
| Service Worker 休眠 | keep-alive 机制防止 |
