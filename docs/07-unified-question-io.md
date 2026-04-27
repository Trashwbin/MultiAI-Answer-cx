# 统一题目输入输出协议

这份文档定义一套统一的 AI 输入输出协议，目标是：

- 顶层匹配键统一使用 `id`
- 输出尽量短，减少模型生成负担
- 只把必要字段发给 AI
- 复合题保留父题结构，不拆成多个顶层题
- 复合题答案统一使用有序数组，按子题/空位顺序对齐

这是一份协议文档，描述的是推荐统一格式。当前代码里部分链路仍在使用 `questionNumber`，后续应逐步向这里收敛。

## 1. 设计原则

1. 顶层题目唯一标识使用 `id: string`
2. `id` 必须稳定，优先使用学习通题目的 `data/questionId`
3. `order` 只用于本地排序，不进入 prompt，不要求模型回传
4. 页面展示号如果存在重复，只用于本地 UI，不进入 AI 协议
5. 复合题不拆顶层，保留 `subQuestions`
6. 复合题答案使用 `string[]`，按顺序一一对应
7. AI 只看必要字段，不接收内部调试或展示字段

## 2. 内部模型与 AI 载荷

### 2.1 内部题目模型

内部模型可以保留排序和展示辅助字段：

```ts
type InternalQuestion = {
  id: string;
  order?: number;
  displayNumber?: string;
  type:
    | '单选题'
    | '多选题'
    | '判断题'
    | '填空题'
    | '简答题'
    | '名词解释'
    | '阅读理解'
    | '完形填空'
    | '共用选项题'
    | '选词填空'
    | '其他';
  content: string;
  options?: string[];
  blankCount?: number;
  subQuestions?: Array<{
    index: number;
    content: string;
    options?: string[];
  }>;
};
```

字段说明：

- `id`: 顶层唯一主键
- `order`: 全卷顺序，只用于本地排序
- `displayNumber`: 页面展示号，只用于本地 UI
- `content`: 父题题干。阅读理解、完形填空等可包含材料正文
- `options`: 顶层选项。适用于普通选择题和选词填空词库
- `blankCount`: 填空数量。适用于填空题和选词填空
- `subQuestions`: 复合题子题列表。顺序即答案顺序

### 2.2 发给 AI 的输入载荷

真正发给 AI 的载荷要更短，只保留必要字段：

```ts
type AIQuestion = {
  id: string;
  type:
    | '单选题'
    | '多选题'
    | '判断题'
    | '填空题'
    | '简答题'
    | '名词解释'
    | '阅读理解'
    | '完形填空'
    | '共用选项题'
    | '选词填空'
    | '其他';
  content: string;
  options?: string[];
  blankCount?: number;
  subQuestions?: Array<{
    index: number;
    content: string;
    options?: string[];
  }>;
};
```

不应发送给 AI 的字段：

- `order`
- `displayNumber`
- 本地 DOM 状态
- 本地调试字段

## 3. 顶层输出格式

### 3.1 标准模式

```ts
type AIAnswerPayload = {
  answers: Array<{
    id: string;
    answer: string | string[];
  }>;
};
```

### 3.2 解析模式

```ts
type AIAnalysisPayload = {
  answers: Array<{
    id: string;
    answer: string | string[];
    confidence?: number;
    reasoning?: string;
  }>;
};
```

输出约束：

- 标准模式只回 `id` 和 `answer`
- 解析模式在 `id` 和 `answer` 之外，可额外回 `confidence`、`reasoning`
- 不回 `order`
- 不回页面展示号
- 复合题 `answer` 统一为数组，顺序必须和 `subQuestions` 或空位顺序一致

### 3.3 解析模式字段说明

- `confidence`: 可选。推荐使用 `0.0-1.0` 浮点数
- `reasoning`: 可选。用于展示解析，不参与自动填写
- 自动填写、投票、题目匹配都应只依赖 `id` 和 `answer`
- 即使开启解析模式，也不能改变 `answer` 的数据形态

## 4. 各题型统一规则

| 题型 | 输入关键字段 | `answer` 形态 | 示例 |
| --- | --- | --- | --- |
| 单选题 | `content`, `options` | `string` | `"D"` |
| 多选题 | `content`, `options` | `string[]` | `["A", "B", "D"]` |
| 判断题 | `content` | `string` | `"正确"` / `"错误"` |
| 填空题 | `content`, `blankCount` | `string[]` | `["成功", "未找到", "服务器内部错误"]` |
| 简答题 | `content` | `string` | `"1. ...\n2. ..."` |
| 名词解释 | `content` | `string` | `"指 ..."` |
| 阅读理解 | `content`, `subQuestions` | `string[]` | `["C", "A", "A"]` |
| 完形填空 | `content`, `subQuestions` | `string[]` | `["B", "B", "C", "D"]` |
| 共用选项题 | `content`, `subQuestions` | `string[]` | `["D", "E", "A"]` |
| 选词填空 | `content`, `options`, `blankCount` | `string[]` | `["D", "B", "C", "H"]` |
| 其他 | `content` | `string` | `"..."` |

## 5. 各题型输入输出示例

### 5.1 单选题

输入：

```json
{
  "id": "885399949",
  "type": "单选题",
  "content": "关于HTTP协议的描述，正确的是( )",
  "options": [
    "A. HTTP只支持GET和POST两种请求方法",
    "B. HTTP默认使用443端口进行通信",
    "C. HTTP是一种面向连接的传输层协议",
    "D. HTTP是无状态的应用层协议"
  ]
}
```

输出：

```json
{
  "id": "885399949",
  "answer": "D"
}
```

### 5.2 多选题

输入：

```json
{
  "id": "885399953",
  "type": "多选题",
  "content": "以下属于面向对象设计SOLID原则的有?",
  "options": [
    "A. 单一职责原则(SRP)",
    "B. 依赖倒置原则(DIP)",
    "C. 开放封闭原则(OCP)",
    "D. 最小权限原则(PoLP)"
  ]
}
```

输出：

```json
{
  "id": "885399953",
  "answer": ["A", "B", "C"]
}
```

### 5.3 判断题

输入：

```json
{
  "id": "885399959",
  "type": "判断题",
  "content": "在IPv4协议中，一个IP地址由64位二进制数组成。"
}
```

输出：

```json
{
  "id": "885399959",
  "answer": "错误"
}
```

### 5.4 填空题

输入：

```json
{
  "id": "885399956",
  "type": "填空题",
  "content": "HTTP协议中常见的状态码:200表示____，404表示____，500表示____。",
  "blankCount": 3
}
```

输出：

```json
{
  "id": "885399956",
  "answer": ["成功", "未找到", "服务器内部错误"]
}
```

### 5.5 简答题

输入：

```json
{
  "id": "885399962",
  "type": "简答题",
  "content": "简述HTTP与HTTPS协议的主要区别。"
}
```

输出：

```json
{
  "id": "885399962",
  "answer": "1. HTTPS 在 HTTP 基础上加入 TLS/SSL 加密。\n2. HTTP 默认端口是 80，HTTPS 默认端口是 443。\n3. HTTPS 需要证书，可验证服务器身份。\n4. HTTPS 能更好保护传输过程中的机密性和完整性。"
}
```

### 5.6 名词解释

输入：

```json
{
  "id": "885399967",
  "type": "名词解释",
  "content": "关系型数据库(RDBMS)"
}
```

输出：

```json
{
  "id": "885399967",
  "answer": "关系型数据库是基于关系模型组织数据的数据库系统，通常以二维表形式存储数据，并通过主键、外键和 SQL 进行数据管理与查询。"
}
```

### 5.7 阅读理解

输入：

```json
{
  "id": "885399973",
  "type": "阅读理解",
  "content": "Artificial intelligence (AI) has made remarkable progress in recent years...",
  "subQuestions": [
    {
      "index": 1,
      "content": "What architecture do modern large language models primarily rely on?",
      "options": [
        "A. Convolutional Neural Networks",
        "B. Recurrent Neural Networks",
        "C. Transformer architecture"
      ]
    },
    {
      "index": 2,
      "content": "According to the passage, what is a limitation of current AI language models?",
      "options": [
        "A. They recognize patterns rather than truly understanding language",
        "B. They cannot generate fluent text",
        "C. They require very small datasets for training"
      ]
    }
  ]
}
```

输出：

```json
{
  "id": "885399973",
  "answer": ["C", "A"]
}
```

说明：数组第 1 项对应 `subQuestions[0]`，第 2 项对应 `subQuestions[1]`。

### 5.8 完形填空

输入：

```json
{
  "id": "885399975",
  "type": "完形填空",
  "content": "Software development has evolved significantly over the past few decades...",
  "subQuestions": [
    {
      "index": 1,
      "content": "第1空",
      "options": ["A. natural", "B. low-level", "C. high-level", "D. machine"]
    },
    {
      "index": 2,
      "content": "第2空",
      "options": ["A. low-level", "B. high-level", "C. scripting", "D. markup"]
    }
  ]
}
```

输出：

```json
{
  "id": "885399975",
  "answer": ["B", "B"]
}
```

### 5.9 共用选项题

输入：

```json
{
  "id": "885399964",
  "type": "共用选项题",
  "content": "共用选项: A. HTTP B. FTP C. SMTP D. DNS E. SSH F. DHCP",
  "subQuestions": [
    {
      "index": 1,
      "content": "用于将域名解析为对应IP地址的协议是( )"
    },
    {
      "index": 2,
      "content": "用于安全远程登录和管理服务器的协议是"
    }
  ]
}
```

输出：

```json
{
  "id": "885399964",
  "answer": ["D", "E"]
}
```

### 5.10 选词填空

输入：

```json
{
  "id": "885399970",
  "type": "选词填空",
  "content": "Cloud computing has fundamentally changed how businesses manage their IT infrastructure...",
  "options": [
    "A. scalability",
    "B. demand",
    "C. exclusive",
    "D. servers",
    "E. abstraction",
    "F. investment",
    "G. accessible",
    "H. flexibility"
  ],
  "blankCount": 6
}
```

输出：

```json
{
  "id": "885399970",
  "answer": ["D", "B", "C", "H", "A", "F"]
}
```

说明：数组顺序必须严格对应第 1 空到第 N 空。

## 6. 推荐 Prompt 约束

### 6.1 标准模式最小约束

```text
你是一个精准的考试答题助手。请根据题目列表返回 JSON。

只输出以下格式：
{
  "answers": [
    {
      "id": "题目ID",
      "answer": "答案"
    }
  ]
}

要求：
1. 必须回答所有题目
2. 顶层匹配键必须使用 id，不要使用其他题号
3. 多选题 answer 为字母数组，按字母顺序排列
4. 填空题 answer 为字符串数组，按空位顺序排列
5. 阅读理解、完形填空、共用选项题、选词填空的 answer 为数组，按子题/空位顺序排列
6. 判断题 answer 统一使用 “正确” 或 “错误”
7. 不要回传 order、displayNumber 或其他内部字段
8. 只输出 JSON，不要输出解释或 markdown
```

### 6.2 解析模式最小约束

```text
你是一个精准的考试答题助手。请根据题目列表返回 JSON。

只输出以下格式：
{
  "answers": [
    {
      "id": "题目ID",
      "answer": "答案",
      "confidence": 0.0,
      "reasoning": "解析"
    }
  ]
}

要求：
1. 必须回答所有题目
2. 顶层匹配键必须使用 id，不要使用其他题号
3. 多选题 answer 为字母数组，按字母顺序排列
4. 填空题 answer 为字符串数组，按空位顺序排列
5. 阅读理解、完形填空、共用选项题、选词填空的 answer 为数组，按子题/空位顺序排列
6. 判断题 answer 统一使用 “正确” 或 “错误”
7. confidence 推荐使用 0.0-1.0
8. reasoning 只用于展示解析，不能改变 answer 的结构
9. 不要回传 order、displayNumber 或其他内部字段
10. 只输出 JSON，不要输出解释或 markdown
```

## 7. 最终结论

统一协议建议如下：

- 顶层输入主键：`id`
- 顶层输出主键：`id`
- 排序参考字段：`order`，仅内部使用，不进入 prompt
- 页面展示字段：`displayNumber`，仅 UI 使用，不进入 prompt
- 复合题结构：保留 `subQuestions`
- 复合题输出：统一为有序 `string[]`

如果后续代码要继续收口，建议优先做的是：

1. `prompts.ts` 改为 `id` 协议
2. `json-parser.ts` 优先解析 `id`
3. 聚合与自动填写改为按 `id` 匹配
4. `order` 只做排序，不参与匹配
