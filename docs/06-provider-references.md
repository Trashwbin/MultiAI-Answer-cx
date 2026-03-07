# 06 - Provider 参考项目与实现要点

> 维护文档：记录每个 Provider 的实现来源、关键技术细节和参考的开源项目，方便后续维护和调试。

## 目录

- [DeepSeek](#deepseek)
- [Doubao (豆包)](#doubao-豆包)
- [Qwen CN (通义千问)](#qwen-cn-通义千问)
- [Kimi (月之暗面)](#kimi-月之暗面)
- [Grok](#grok)
- [ChatGPT](#chatgpt)
- [Gemini](#gemini)
- [ChatGLM (智谱清言)](#chatglm-智谱清言)
- [已移除的 Provider](#已移除的-provider)

---

## DeepSeek

**状态**: ✅ 已验证

**文件**: `src/providers/deepseek.ts`, `src/providers/deepseek-pow-wasm.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| openclaw-zero-token | 本地 `/Users/zt-user/code/pre/cx/openclaw-zero-token/` | 整体架构参考，chat2api 调用模式 |
| DeepSeek 官方 Web | `https://chat.deepseek.com` | API 端点抓包逆向 |

### 关键技术

- **WASM PoW 挑战**: 每次对话前需调用 `/api/v0/chat/create_pow_challenge` 获取挑战，使用内嵌的 WASM 模块 (`deepseek-pow-wasm.ts` 中 base64 编码) 求解
- **PoW 响应头**: `x-ds-pow-response` — base64 编码的 JSON，包含 `algorithm`, `challenge`, `salt`, `answer`, `signature`, `target_path`
- **认证**: `Bearer` token，通过 `chrome.webRequest.onSendHeaders` 从 `chat.deepseek.com/api` 请求中拦截
- **SSE 响应**: 自定义 SSE 格式，取最后一个 `choices[0].delta.content`
- **端点**: `POST https://chat.deepseek.com/api/v0/chat/completions`

---

## Doubao (豆包)

**状态**: ✅ 已验证

**文件**: `src/providers/doubao.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| openclaw-zero-token | `openclaw-zero-token/src/providers/doubao-web-client.ts:473-497` | Samantha SSE 解析格式 |

### 关键技术

- **Samantha SSE 格式**: 三层嵌套 JSON — `event_type 2001` → `event_data` → `message.content` → `{text}`
  - `event_type 2003` = 结束
  - `event_type 2005` = 错误 (限流 / 验证码)
- **Page Context 调用**: 通过 `proxyFetch('www.doubao.com', ...)` 在页面上下文中执行 fetch，绕过 Origin 校验
- **认证**: Cookie 方式，从 `www.doubao.com` 页面获取
- **端点**: `POST https://www.doubao.com/chat/api/chat` (Samantha API)

---

## Qwen CN (通义千问)

**状态**: ✅ 已验证

**文件**: `src/providers/qwen-cn.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| openclaw-zero-token | 本地参考项目 | 整体调用模式 |
| Qwen 官方 Web | `https://www.qianwen.com` | API 端点抓包逆向 |

### 关键技术

- **Page Context 调用**: 通过 `proxyFetch('www.qianwen.com', ...)` 在页面上下文中执行 fetch
- **认证**: Cookie (`token`, `cna`, `login_tongyi_ticket`)，有效期 24h，通过 `captureCookies` 获取
- **SSE 响应**: 标准 SSE，最后一个 `data:` 行包含完整响应
- **端点**: `POST https://www.qianwen.com/api/v1/chat/completions`

---

## Kimi (月之暗面)

**状态**: ✅ 已验证

**文件**: `src/providers/kimi.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| LLM-Red-Team/kimi-free-api | `https://github.com/LLM-Red-Team/kimi-free-api` | API 格式参考 |
| xiaoY233/Chat2API | `https://github.com/xiaoY233/Chat2API` | chat_id / tools / parent_id 字段 |

### 关键技术

- **Connect RPC 协议**: Kimi 使用 Connect Protocol (类 gRPC-Web)，非标准 REST
- **Page Context 执行**: `chrome.scripting.executeScript({ world: 'MAIN' })` 在 kimi.moonshot.cn 页面内执行
- **模型场景**: `SCENARIO_K2D5` = K2.5 模型 (当前生产环境)
- **必填字段**: `chat_id` (需先创建)、`tools` (空数组)、`parent_id`
- **认证**: `kimi-auth` cookie 中的 Bearer token
- **端点**: `POST https://kimi.moonshot.cn/api/chat/[chat_id]/completion` (Connect RPC)

---

## Grok

**状态**: ✅ 已验证

**文件**: `src/providers/grok.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| grok2api | `https://github.com/rk0cc/grok2api` | 请求头格式、statsig-id 生成、对话端点 |
| openclaw-zero-token | `openclaw-zero-token/src/providers/grok-web-client-browser.ts` | DOM 交互逻辑（行 120-178 发送, 行 200-236 接收）|

### 关键技术

- **Anti-bot 请求头**:
  - `x-statsig-id`: base64 编码的伪造 TypeError 消息作为指纹 — `btoa("e:TypeError: Cannot read properties of null (reading 'children[\"${rand}\"]')")`
  - `x-xai-request-id`: `crypto.randomUUID()`
- **Page Context 执行**: 在 grok.com 页面内执行 fetch，发送 NDJSON 流式响应
- **双重降级策略**:
  1. 优先: API 调用 (`/rest/app-chat/conversations/new`)
  2. 降级: DOM 模拟 (输入文本 → 点击发送 → 轮询响应)
  - 如果 API 返回 403 (anti-bot)，自动切换到 DOM 模式
- **NDJSON 响应**: 每行一个 JSON 对象，取 `result.response.modelResponse.generationChunk.output` 拼接
- **端点**: `POST https://grok.com/rest/app-chat/conversations/new`

---

## ChatGPT

**状态**: 🔧 待复测 (DOM poll 已修复)

**文件**: `src/providers/chatgpt.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| openclaw-zero-token | 本地参考项目 | SSE 解析、对话流程 |
| ChatALL | `https://github.com/sunner/ChatALL` | ChatGPTBot 认证和会话管理 |
| ChatGPT 官方 Web | `https://chatgpt.com` | Sentinel 机制抓包 |

### 关键技术

- **Sentinel Token**: 每次对话前需调用 `/backend-api/sentinel/chat-requirements` 获取 sentinel token
- **请求头**: `openai-sentinel-chat-requirements-token` — sentinel 返回的 token
- **Page Context 执行**: 在 chatgpt.com 页面内执行全流程 (session → sentinel → conversation)
- **双重降级策略**:
  1. 优先: API 调用 (`/backend-api/conversation`) + SSE 解析
  2. 降级: DOM 模拟 (输入 → 发送 → 轮询结果)
- **SSE 响应**: `data:` 行中 `message.content.parts[0]` 拼接
- **认证**: Session-based，通过 `chatgptAuthProbe` 探测 `/backend-api/me`
- **端点**: `POST https://chatgpt.com/backend-api/conversation`

---

## Gemini

**状态**: 🔧 待复测 (DOM 用户输入过滤已修复)

**文件**: `src/providers/gemini.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| openclaw-zero-token | 本地参考项目 | DOM 交互模式参考 |
| Gemini 官方 Web | `https://gemini.google.com` | DOM 结构逆向 |

### 关键技术

- **纯 DOM 模式**: Gemini 无公开的 chat2api 端点可用，完全通过 DOM 模拟
  - 输入: `contenteditable` 区域 + `input` 事件
  - 发送: 查找 `[aria-label]` 发送按钮并 click
  - 接收: 轮询 `message-content` 元素，过滤掉用户自己的输入
- **Page Context 执行**: `chrome.scripting.executeScript({ world: 'MAIN' })` 在 gemini.google.com 执行
- **用户输入过滤**: 响应轮询时需排除与发送内容相同的 DOM 节点，避免将用户问题当作 AI 回答
- **认证**: Google 登录态 Cookie，通过 `geminiAuthProbe` 检测页面登录状态
- **端点**: N/A (纯 DOM 操作)

---

## ChatGLM (智谱清言)

**状态**: 🔧 Token Refresh 已修复，待复测

**文件**: `src/providers/chatglm.ts`

### 参考项目

| 项目 | 地址 | 用途 |
|------|------|------|
| LLM-Red-Team/glm-free-api | `https://github.com/LLM-Red-Team/glm-free-api` | 对话端点、SSE 格式（服务端代理，使用 `/backend-api/v1/user/refresh`，无 sign，响应 `result.accessToken` camelCase）|
| xiaoY233/GLM-Free-API | `https://github.com/xiaoY233/GLM-Free-API` | fork 版本，使用 `/user-api/user/refresh` + sign headers |
| xiaoY233/Chat2API | `https://github.com/xiaoY233/Chat2API` | Token refresh 端点 + sign v2，使用 `/user-api/user/refresh`，响应 `result.access_token` (snake_case) |

### 关键技术

- **Sign 算法**: 时间戳数位操作 + MD5
  ```
  secret = '8a1317a7468aa3ad86e997d08f3f31cb'
  sign = md5(`${timestamp}-${nonce}-${secret}`)
  ```
  其中 `timestamp` 的各位数字经过映射变换 (0→4, 1→7, 2→5, 3→1, 4→0, 5→9, 6→2, 7→8, 8→3, 9→6)
- **Token Refresh**:
  - 端点: `POST https://chatglm.cn/chatglm/user-api/user/refresh`
  - `X-Device-Id` 和 `X-Request-Id` 需去除连字符 (`.replace(/-/g, '')`)
  - 额外必填头: `X-App-Version: '0.0.1'`, `X-App-Fr: 'browser_extension'`, `X-Lang: 'zh'`
  - 响应: `result.access_token` (snake_case)
- **SSE 响应特点**: 累积文本 (每条 SSE 包含到目前为止的完整文本)，而非增量 delta
- **认证**: `refresh_token` cookie + access_token refresh 机制
- **对话端点**: `POST https://chatglm.cn/chatglm/backend-api/assistant/stream`

### ⚠️ 注意事项

三个参考项目在 refresh 端点和响应格式上存在差异：

| 项目 | Refresh 端点 | Sign | 响应字段 |
|------|-------------|------|---------|
| LLM-Red-Team/glm-free-api | `/backend-api/v1/user/refresh` | 无 | `result.accessToken` (camelCase) |
| xiaoY233/GLM-Free-API | `/user-api/user/refresh` | 有 | 未确认 |
| xiaoY233/Chat2API | `/user-api/user/refresh` | 有 (v2) | `result.access_token` (snake_case) |

当前实现采用 xiaoY233/Chat2API 方案 (`/user-api/user/refresh` + sign + `result.access_token`)。

---

## 已移除的 Provider

### Claude

- **移除原因**: 代码编写完成但从未经过实际测试
- **移除时间**: 2026-03-07
- **参考项目**: N/A
- **历史文件**: `src/providers/claude.ts` (已删除)

### Qwen International (通义千问国际版)

- **移除原因**: API 不兼容 — 非 v2 端点 504 超时，v2 端点 `chat_id` 校验失败
- **移除时间**: 2026-03-07
- **曾参考的项目**:

| 项目 | 地址 | 说明 |
|------|------|------|
| BlueSkyXN/AI2API | `https://github.com/BlueSkyXN/AI2API` | Qwen Chat2API 格式 |
| highkay/qwenchat2api | `https://github.com/highkay/qwenchat2api` | 端点和认证方式 |
| xiaoY233/Chat2API | `https://github.com/xiaoY233/Chat2API` | 通用 Chat2API 格式 |
| Rfym21/Qwen2API | `https://github.com/Rfym21/Qwen2API` | v2 端点格式 |
| iptag/cloudflare-worker-usage | (Cloudflare Worker) | Worker 代理方案 |

- **失败记录**: 5 种 token 获取策略均已实现成功 (cookies, partitionKey, get(), webRequest, executeScript localStorage)，但 API 调用始终失败。非 v2 端点 `/api/chat/completions` 返回 504，v2 端点 `/api/v2/chat/completions` 无论 `chat_id` 放在 URL、body 还是两者兼有均返回校验错误。

---

## 通用基础设施

### proxyFetch (Page Context Proxy)

**文件**: `src/utils/page-proxy.ts`

通过 `chrome.scripting.executeScript({ world: 'MAIN' })` 在目标页面上下文中执行 fetch，解决 Chrome Extension Service Worker 的 Origin 限制问题。

**使用方**: Doubao, Qwen CN

### 认证体系

**文件**: `src/auth/cookie-capture.ts`, `src/auth/auth-content.ts`, `src/auth/token-manager.ts`

- **Cookie 捕获**: `chrome.cookies.getAll()` (URL + domain 双查)
- **Bearer 拦截**: `chrome.webRequest.onSendHeaders` 从 API 请求中提取 Authorization header
- **localStorage 读取**: content script 注入 + `chrome.scripting.executeScript` 直接读取
- **Token 存储**: `chrome.storage.local` 统一管理，TTL 过期机制
