import type { Question } from '../types/question';

export interface PromptConfig {
  id: string;
  label: string;
  description: string;
  requireAnalysis: boolean;
  requireConfidence: boolean;
}

const ANSWER_RULES = `答案格式规则：

- 单选题: answer 为单个大写字母，如 "A"
- 多选题: answer 为字母数组，按字母顺序排列，如 ["A", "C"]
- 判断题: answer 为 "正确" 或 "错误"
- 填空题: answer 为字符串数组，按空的顺序排列，如 ["答案1", "答案2"]
- 选词填空: answer 为字母数组，按空的顺序排列（从第1空到最后一空），如 ["A", "C", "D"]，每个字母对应词库中的选项
- 简答题: answer 为完整答案文本字符串
- 名词解释: answer 为解释文本字符串`;

const SYSTEM_PROMPT_FAST = `你是一个精准的考试答题助手。你的任务是根据给定的题目列表，以 JSON 格式返回答案。

你必须严格返回以下 JSON 格式，不要添加任何其他文字、注释或 markdown 标记：

{
  "answers": [
    {
      "questionNumber": "题号",
      "answer": "答案"
    }
  ]
}

${ANSWER_RULES}

关键约束：

1. 必须回答所有题目，不要遗漏
2. 选择题只给字母，不要附带选项内容
3. 多选题答案按字母顺序排列
4. 填空题答案数量必须与空的数量一致
5. 选词填空答案按空的顺序排列（不要按字母排序），数量必须与空的数量一致
6. 简答题分点回答，使用换行符分隔
7. 所有答案用中文，除非题目明确要求其他语言
8. 不要输出推理过程，直接给答案
9. 只输出 JSON，不要输出任何 markdown 标记或额外文字`;

const SYSTEM_PROMPT_ANALYSIS = `你是一个精准的考试答题助手。你的任务是根据给定的题目列表，以 JSON 格式返回答案。

你必须严格返回以下 JSON 格式，不要添加任何其他文字、注释或 markdown 标记：

{
  "answers": [
    {
      "questionNumber": "题号",
      "answer": "答案",
      "confidence": 0.0-1.0,
      "reasoning": "推理过程"
    }
  ]
}

${ANSWER_RULES}

关键约束：

1. 必须回答所有题目，不要遗漏
2. 选择题只给字母，不要附带选项内容
3. 多选题答案按字母顺序排列
4. 填空题答案数量必须与空的数量一致
5. 选词填空答案按空的顺序排列（不要按字母排序），数量必须与空的数量一致
6. 简答题分点回答，使用换行符分隔
7. 所有答案用中文，除非题目明确要求其他语言
8. confidence 为你对答案的把握程度 (0.0-1.0)
9. 只输出 JSON，不要输出任何 markdown 标记或额外文字

额外要求 (解析模式)：

在 reasoning 字段中提供详细解析，包含：
- 选择该答案的理由
- 排除其他选项的原因 (选择题)
- 相关知识点
- 易错点提醒`;

const FEW_SHOT_FAST = `
示例输入：
[
  {"id": 1, "type": "单选题", "content": "以下哪个是面向对象编程的特征？", "options": ["A. 封装", "B. 递归", "C. 排序", "D. 遍历"]},
  {"id": 2, "type": "多选题", "content": "以下哪些是 HTTP 请求方法？", "options": ["A. GET", "B. POST", "C. SELECT", "D. DELETE"]},
  {"id": 3, "type": "判断题", "content": "TCP 是无连接协议。"},
  {"id": 4, "type": "选词填空", "content": "[选词填空]\\nMany people are ____1____ of the risks to their personal ____2____ online.\\n词库: A. privacy B. unaware C. potential D. frequently", "blankCount": 2}
]

示例输出：
{
  "answers": [
    {"questionNumber": "1", "answer": "A"},
    {"questionNumber": "2", "answer": ["A", "B", "D"]},
    {"questionNumber": "3", "answer": "错误"},
    {"questionNumber": "4", "answer": ["B", "A"]}
  ]
}`;

const FEW_SHOT_ANALYSIS = `
示例输入：
[
  {"id": 1, "type": "单选题", "content": "以下哪个是面向对象编程的特征？", "options": ["A. 封装", "B. 递归", "C. 排序", "D. 遍历"]},
  {"id": 2, "type": "多选题", "content": "以下哪些是 HTTP 请求方法？", "options": ["A. GET", "B. POST", "C. SELECT", "D. DELETE"]},
  {"id": 3, "type": "判断题", "content": "TCP 是无连接协议。"},
  {"id": 4, "type": "填空题", "content": "HTTP 协议默认使用____端口，HTTPS 默认使用____端口", "blankCount": 2},
  {"id": 5, "type": "简答题", "content": "简述 TCP 三次握手的过程"},
  {"id": 6, "type": "选词填空", "content": "[选词填空]\\nMany people are ____1____ of the risks to their personal ____2____ online.\\n词库: A. privacy B. unaware C. potential D. frequently", "blankCount": 2}
]

示例输出：
{
  "answers": [
    {"questionNumber": "1", "answer": "A", "confidence": 0.95, "reasoning": "封装是面向对象编程的三大特征之一"},
    {"questionNumber": "2", "answer": ["A", "B", "D"], "confidence": 0.9, "reasoning": "GET、POST、DELETE 是标准 HTTP 方法，SELECT 是 SQL 关键字"},
    {"questionNumber": "3", "answer": "错误", "confidence": 0.98, "reasoning": "TCP 是面向连接的协议，UDP 才是无连接协议"},
    {"questionNumber": "4", "answer": ["80", "443"], "confidence": 0.99, "reasoning": "HTTP 默认端口 80，HTTPS 默认端口 443"},
    {"questionNumber": "5", "answer": "TCP三次握手过程：\\n1. 客户端发送SYN包到服务器\\n2. 服务器回复SYN+ACK包\\n3. 客户端发送ACK包确认连接建立", "confidence": 0.85, "reasoning": "三次握手是TCP建立连接的标准流程"},
    {"questionNumber": "6", "answer": ["B", "A"], "confidence": 0.92, "reasoning": "unaware of 表示'不知道'，privacy 表示'隐私'，按空的顺序第1空填B，第2空填A"}
  ]
}`;



export const DEFAULT_PROMPTS: readonly PromptConfig[] = [
  {
    id: 'standard',
    label: '标准模式',
    description: '直接返回答案，无推理过程，响应最快',
    requireAnalysis: false,
    requireConfidence: false,
  },
  {
    id: 'analysis',
    label: '解析模式',
    description: '返回答案+详细解析，适合学习理解',
    requireAnalysis: true,
    requireConfidence: true,
  },
  {
    id: 'custom',
    label: '自定义模式',
    description: '使用自定义提示词',
    requireAnalysis: false,
    requireConfidence: false,
  },
];

function serializeQuestions(questions: readonly Question[]): string {
  const serialized = questions.map((q) => {
    const obj: Record<string, string | number | string[]> = {
      id: q.number,
      type: q.type,
      content: q.content,
    };
    if (q.options.length > 0) {
      obj['options'] = q.options.map((o) => `${o.label}. ${o.text}`);
    }
    if (q.blankCount > 0) {
      obj['blankCount'] = q.blankCount;
    }
    return obj;
  });
  return JSON.stringify(serialized, null, 2);
}

export function buildPrompt(
  questions: readonly Question[],
  mode: 'standard' | 'analysis' | 'custom',
  customPrompt?: string,
): string {
  if (mode === 'custom') {
    const prefix = customPrompt ?? '';
    return `${prefix}\n\n题目如下：\n${serializeQuestions(questions)}`;
  }

  if (mode === 'standard') {
    return [SYSTEM_PROMPT_FAST, FEW_SHOT_FAST, `\n题目列表：\n${serializeQuestions(questions)}`].join('\n');
  }

  if (mode === 'analysis') {
    return [SYSTEM_PROMPT_ANALYSIS, FEW_SHOT_ANALYSIS, `\n题目列表：\n${serializeQuestions(questions)}`].join('\n');
  }

  return '';
}
