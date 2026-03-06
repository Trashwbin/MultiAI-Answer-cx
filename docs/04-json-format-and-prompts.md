# JSON 输入输出格式 & 提示词优化需求文档

> **文档状态**: Draft  
> **模块**: JSON I/O 设计 + Prompt Engineering  
> **最终位置**: `MultiAI-Answer-cx/docs/04-json-format-and-prompts.md`

---

## 1. 概述

### 1.1 当前问题

v1 使用纯文本 + 正则解析：

```
# v1 提示词要求 AI 输出:
问题1答案:
A

问题2答案:
第1空：xxx
第2空：xxx

# v1 解析逻辑 (正则):
/问题\s*(\d+)\s*答案[:：]([^问]*?)(?=问题\s*\d+\s*答案[:：]|$)/gs
```

**核心问题:**
- AI 输出格式不稳定，微小变化就会解析失败
- 解析后全部是 string，没有类型信息
- 简答题的答案是自由文本，多个 AI 之间无法对比
- 解析 (答案) 和答案本体混在一起

### 1.2 v2 目标

- AI 以 **JSON 格式** 返回答案
- 容错解析器处理格式偏差
- 结构化数据使投票和对比成为可能

---

## 2. JSON Schema 设计

### 2.1 输入格式 (发给 AI 的题目)

```typescript
/** 发送给 AI 的请求结构 */
interface AIRequestPayload {
  questions: AIQuestion[];
  responseFormat: 'json';
  language: 'zh-CN';
}

interface AIQuestion {
  id: number;                    // 题号
  type: string;                  // "单选题", "多选题", "填空题", "判断题", "简答题", "名词解释"
  content: string;               // 题目内容
  options?: string[];            // 选项 (选择题)
  blankCount?: number;           // 空的数量 (填空题)
}
```

**Prompt 中的题目序列化格式:**

```
题目列表 (JSON):
[
  {
    "id": 1,
    "type": "单选题",
    "content": "以下哪个是面向对象编程的特征？",
    "options": ["A. 封装", "B. 递归", "C. 排序", "D. 遍历"]
  },
  {
    "id": 2,
    "type": "填空题",
    "content": "HTTP 协议默认使用____端口",
    "blankCount": 1
  },
  {
    "id": 3,
    "type": "简答题",
    "content": "简述 TCP 三次握手的过程"
  }
]
```

### 2.2 输出格式 (AI 返回的答案)

```typescript
/** AI 应返回的 JSON 结构 */
interface AIResponseSchema {
  answers: AIAnswer[];
}

interface AIAnswer {
  id: number;                    // 对应题号
  answer: string | string[];     // 答案内容
  confidence?: number;           // 0-100, 置信度 (可选)
  analysis?: string;             // 解析 (可选, 解析模式时返回)
}
```

**各题型的 `answer` 字段约定:**

| 题型 | answer 格式 | 示例 |
|---|---|---|
| 单选题 | `string` (单个选项字母) | `"A"` |
| 多选题 | `string[]` (选项字母数组) | `["A", "B", "C"]` |
| 判断题 | `string` ("对" 或 "错") | `"对"` |
| 填空题 | `string[]` (按空排列) | `["80", "TCP"]` |
| 简答题 | `string` (答案文本) | `"TCP 三次握手..."` |
| 名词解释 | `string` (解释文本) | `"面向对象编程是..."` |

**完整 JSON 响应示例:**

```json
{
  "answers": [
    {
      "id": 1,
      "answer": "A",
      "confidence": 95,
      "analysis": "封装是面向对象编程的三大特征之一"
    },
    {
      "id": 2,
      "answer": ["80"],
      "confidence": 99
    },
    {
      "id": 3,
      "answer": "TCP三次握手过程：\n1. 客户端发送SYN包...\n2. 服务器回复SYN+ACK...\n3. 客户端发送ACK确认...",
      "confidence": 90,
      "analysis": "TCP三次握手确保双方通信能力..."
    }
  ]
}
```

---

## 3. 提示词设计

### 3.1 系统提示词 (System Prompt)

```
你是一个精准的考试答题助手。你的任务是根据给定的题目列表，以 JSON 格式返回答案。

## 输出要求

你必须严格返回以下 JSON 格式，不要添加任何其他文字、注释或 markdown 标记：

```json
{
  "answers": [
    {
      "id": <题号>,
      "answer": <答案>,
      "confidence": <0-100的置信度>
    }
  ]
}
```

## 答案格式规则

- **单选题**: answer 为单个大写字母，如 "A"
- **多选题**: answer 为字母数组，如 ["A", "B", "C"]，按字母顺序排列
- **判断题**: answer 为 "对" 或 "错"
- **填空题**: answer 为字符串数组，按空的顺序，如 ["答案1", "答案2"]
- **简答题**: answer 为完整答案文本字符串
- **名词解释**: answer 为解释文本字符串

## 关键约束

1. 必须回答所有题目，不要遗漏
2. 选择题只给字母，不要附带选项内容
3. 多选题答案按字母顺序排列
4. 填空题答案数量必须与空的数量一致
5. 简答题分点回答，使用换行符分隔
6. 所有答案用中文，除非题目明确要求其他语言
7. confidence 为你对答案的把握程度 (0-100)
```

### 3.2 解析模式提示词 (追加)

```
## 额外要求 (解析模式)

在每个答案中增加 analysis 字段，包含：
- 选择该答案的理由
- 排除其他选项的原因 (选择题)
- 相关知识点
- 易错点提醒

示例:
{
  "id": 1,
  "answer": "A",
  "confidence": 95,
  "analysis": "封装是面向对象三大特征之一（封装、继承、多态）。B选项递归是编程技巧，C选项排序是算法，D选项遍历是数据操作，均不属于OOP特征。"
}
```

### 3.3 提示词工程要点

| 策略 | 说明 |
|---|---|
| **JSON-only 输出** | 明确要求"不要添加任何 markdown 标记或额外文字" |
| **Few-shot 示例** | 在 prompt 中包含 1-2 个完整的输入输出示例 |
| **类型约束** | 明确每种题型的 answer 数据类型 |
| **数量约束** | 填空题强调"答案数量必须与空的数量一致" |
| **置信度** | 引入 confidence 字段，为投票算法提供权重信号 |
| **降噪** | 不要求解析时明确"仅在要求时返回 analysis" |

---

## 4. 容错 JSON 解析器

AI 不总是返回完美的 JSON。需要一个健壮的解析器：

### 4.1 常见异常及处理

```typescript
// src/core/json-parser.ts

export function parseAIResponse(raw: string): AIResponseSchema {
  // 尝试 1: 直接 JSON.parse
  try {
    return JSON.parse(raw);
  } catch {}
  
  // 尝试 2: 提取 JSON block (AI 可能包裹在 ```json ... ```)
  const jsonBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock[1].trim());
    } catch {}
  }
  
  // 尝试 3: 找到第一个 { 和最后一个 } 之间的内容
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  
  // 尝试 4: 修复常见 JSON 错误
  //   - 尾随逗号: ,] → ]  ,} → }
  //   - 单引号: ' → "
  //   - 未转义换行: \n in string → \\n
  const fixed = fixCommonJsonErrors(raw);
  try {
    return JSON.parse(fixed);
  } catch {}
  
  // 尝试 5: 回退到正则解析 (兼容 v1 格式)
  return fallbackRegexParse(raw);
}
```

### 4.2 常见 JSON 错误修复

| 错误类型 | 示例 | 修复 |
|---|---|---|
| Markdown 包裹 | ` ```json {...} ``` ` | 提取 JSON block |
| 尾随逗号 | `[1, 2, 3,]` | 移除尾随逗号 |
| 单引号 | `{'a': 'b'}` | 替换为双引号 |
| 未转义换行 | `"line1\nline2"` (实际换行) | 替换为 `\\n` |
| 注释 | `// comment` 或 `/* */` | 移除 |
| 前后缀文字 | `Here is the answer: {...}` | 提取 JSON 部分 |
| 截断 | `{"answers": [{"id": 1` | 尝试补全 |

### 4.3 v1 格式回退

当 JSON 解析完全失败时，回退到 v1 的正则解析作为最后手段：

```typescript
function fallbackRegexParse(raw: string): AIResponseSchema {
  const regex = /问题\s*(\d+)\s*答案[:：]([^问]*?)(?=问题\s*\d+\s*答案[:：]|$)/gs;
  const answers: AIAnswer[] = [];
  let match;
  
  while ((match = regex.exec(raw)) !== null) {
    answers.push({
      id: parseInt(match[1]),
      answer: match[2].trim(),
      confidence: 0  // 回退解析，置信度为 0
    });
  }
  
  return { answers };
}
```

---

## 5. 提示词配置系统

### 5.1 用户可配置的提示词模板

```typescript
// src/config/prompts.ts

export interface PromptConfig {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;          // 系统提示词 (不可编辑核心部分)
  userPrefix: string;            // 用户可编辑的前缀
  requireAnalysis: boolean;      // 是否要求解析
  requireConfidence: boolean;    // 是否要求置信度
}

export const DEFAULT_PROMPTS: PromptConfig[] = [
  {
    id: 'standard',
    label: '标准模式',
    description: '返回答案和置信度，适合快速答题',
    systemPrompt: SYSTEM_PROMPT_STANDARD,
    userPrefix: '',
    requireAnalysis: false,
    requireConfidence: true,
  },
  {
    id: 'analysis',
    label: '解析模式',
    description: '返回答案+详细解析，适合学习理解',
    systemPrompt: SYSTEM_PROMPT_WITH_ANALYSIS,
    userPrefix: '',
    requireAnalysis: true,
    requireConfidence: true,
  },
  {
    id: 'custom',
    label: '自定义模式',
    description: '使用自定义提示词',
    systemPrompt: '',
    userPrefix: '',
    requireAnalysis: false,
    requireConfidence: false,
  }
];
```

### 5.2 提示词优化效果预期

| 指标 | v1 (正则解析) | v2 (JSON 解析) | 提升 |
|---|---|---|---|
| **选择题解析成功率** | ~85% | ~99% | +14% |
| **填空题解析成功率** | ~60% | ~95% | +35% |
| **简答题结构化率** | 0% | ~90% | 全新能力 |
| **置信度信息** | 无 | 有 (0-100) | 全新能力 |
| **跨 AI 答案对比** | 仅字符串相等 | 结构化对比 | 质变 |

---

## 6. Provider 特定注意事项

### 6.1 不同 AI 的 JSON 输出能力

| AI | JSON 输出能力 | 注意事项 |
|---|---|---|
| DeepSeek | 强 | 较好地遵循 JSON 格式指令 |
| Claude | 强 | 出色的格式遵循能力 |
| ChatGPT | 强 | 原生支持 JSON mode |
| Gemini | 强 | 支持 structured output |
| Kimi | 中 | 偶尔添加 markdown 包裹 |
| 通义千问 | 中 | 需要明确的 few-shot 示例 |
| 智谱清言 | 中 | 格式基本可靠 |
| 豆包 | 中 | 需要强调"仅返回 JSON" |
| Grok | 中-强 | 基本可靠 |

### 6.2 Provider 特定 Prompt 调整

某些 AI 可能需要 provider-specific 的 prompt 微调：

```typescript
abstract class BaseProvider {
  /** 子类可覆盖，添加 provider-specific 的 prompt 调整 */
  protected adjustPrompt(basePrompt: string): string {
    return basePrompt;  // 默认不调整
  }
}

class DoubaoProvider extends BaseProvider {
  protected adjustPrompt(basePrompt: string): string {
    // 豆包需要更强调 JSON-only
    return basePrompt + '\n\n重要：你的回复中只能包含 JSON，不能有任何其他文字。';
  }
}
```
