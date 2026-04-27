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
- 阅读理解: answer 为字母数组，按子题顺序排列，如 ["C", "A", "B"]
- 完形填空: answer 为字母数组，按子题/空位顺序排列，如 ["B", "D", "A"]
- 共用选项题: answer 为字母数组，按子题顺序排列，如 ["D", "E", "A"]
- 简答题: answer 为完整答案文本字符串
- 名词解释: answer 为解释文本字符串
- 其他: answer 为完整答案文本字符串`;

const SYSTEM_PROMPT_FAST = `你是一个精准的考试答题助手。你的任务是根据给定的题目列表，以 JSON 格式返回答案。

你必须严格返回以下 JSON 格式，不要添加任何其他文字、注释或 markdown 标记：

{
  "answers": [
    {
      "id": "题目ID",
      "answer": "答案"
    }
  ]
}

${ANSWER_RULES}

关键约束：

1. 必须回答所有题目，不要遗漏
2. 必须使用输入题目里的 id 作为返回标识，不要返回其他题号字段
3. 选择题只给字母，不要附带选项内容
4. 多选题答案按字母顺序排列
5. 填空题答案数量必须与空的数量一致
6. 选词填空答案按空的顺序排列（不要按字母排序），数量必须与空的数量一致
7. 阅读理解、完形填空、共用选项题的 answer 使用数组，按子题顺序排列
8. 简答题分点回答，使用换行符分隔
9. 所有答案用中文，除非题目明确要求其他语言
10. 不要输出推理过程，直接给答案
11. 只输出 JSON，不要输出任何 markdown 标记或额外文字`;

const SYSTEM_PROMPT_ANALYSIS = `你是一个精准的考试答题助手。你的任务是根据给定的题目列表，以 JSON 格式返回答案。

你必须严格返回以下 JSON 格式，不要添加任何其他文字、注释或 markdown 标记：

{
  "answers": [
    {
      "id": "题目ID",
      "answer": "答案",
      "confidence": 0.0-1.0,
      "reasoning": "推理过程"
    }
  ]
}

${ANSWER_RULES}

关键约束：

1. 必须回答所有题目，不要遗漏
2. 必须使用输入题目里的 id 作为返回标识，不要返回其他题号字段
3. 选择题只给字母，不要附带选项内容
4. 多选题答案按字母顺序排列
5. 填空题答案数量必须与空的数量一致
6. 选词填空答案按空的顺序排列（不要按字母排序），数量必须与空的数量一致
7. 阅读理解、完形填空、共用选项题的 answer 使用数组，按子题顺序排列
8. 简答题分点回答，使用换行符分隔
9. 所有答案用中文，除非题目明确要求其他语言
10. confidence 为你对答案的把握程度 (0.0-1.0)
11. 只输出 JSON，不要输出任何 markdown 标记或额外文字

额外要求 (解析模式)：

在 reasoning 字段中提供详细解析，包含：
- 选择该答案的理由
- 排除其他选项的原因 (选择题)
- 相关知识点
- 易错点提醒`;

const FEW_SHOT_FAST = `
示例输入：
[
  {"id": "q1", "type": "单选题", "content": "以下哪个是面向对象编程的特征？", "options": ["A. 封装", "B. 递归", "C. 排序", "D. 遍历"]},
  {"id": "q2", "type": "多选题", "content": "以下哪些是 HTTP 请求方法？", "options": ["A. GET", "B. POST", "C. SELECT", "D. DELETE"]},
  {"id": "q3", "type": "判断题", "content": "TCP 是无连接协议。"},
  {"id": "q4", "type": "填空题", "content": "HTTP 协议默认使用____端口，HTTPS 默认使用____端口", "blankCount": 2},
  {"id": "q5", "type": "简答题", "content": "简述 TCP 三次握手的过程"},
  {"id": "q6", "type": "名词解释", "content": "面向对象编程"},
  {"id": "q7", "type": "阅读理解", "content": "Artificial intelligence has made remarkable progress...", "subQuestions": [{"index": 1, "content": "What architecture do large language models primarily rely on?", "options": ["A. CNN", "B. RNN", "C. Transformer"]}, {"index": 2, "content": "What limitation is mentioned?", "options": ["A. Lack of true understanding", "B. Cannot generate text", "C. Needs tiny datasets"]}]},
  {"id": "q8", "type": "完形填空", "content": "Software development has evolved significantly...", "subQuestions": [{"index": 1, "content": "第1空", "options": ["A. natural", "B. low-level", "C. high-level", "D. machine"]}, {"index": 2, "content": "第2空", "options": ["A. low-level", "B. high-level", "C. scripting", "D. markup"]}]},
  {"id": "q9", "type": "共用选项题", "content": "共用选项: A. HTTP B. FTP C. SMTP D. DNS E. SSH", "subQuestions": [{"index": 1, "content": "用于域名解析的协议是( )"}, {"index": 2, "content": "用于安全远程登录的协议是( )"}]},
  {"id": "q10", "type": "选词填空", "content": "[选词填空]\\nMany people are ____1____ of the risks to their personal ____2____ online.\\n词库: A. privacy B. unaware C. potential D. frequently", "blankCount": 2},
  {"id": "q11", "type": "其他", "content": "请写一段关于学习算法重要性的短文。"}
]

示例输出：
{
  "answers": [
    {"id": "q1", "answer": "A"},
    {"id": "q2", "answer": ["A", "B", "D"]},
    {"id": "q3", "answer": "错误"},
    {"id": "q4", "answer": ["80", "443"]},
    {"id": "q5", "answer": "1. 客户端发送 SYN 报文。\\n2. 服务器返回 SYN+ACK 报文。\\n3. 客户端返回 ACK 报文，连接建立。"},
    {"id": "q6", "answer": "一种以对象为核心组织程序的编程思想，强调封装、继承和多态。"},
    {"id": "q7", "answer": ["C", "A"]},
    {"id": "q8", "answer": ["B", "B"]},
    {"id": "q9", "answer": ["D", "E"]},
    {"id": "q10", "answer": ["B", "A"]},
    {"id": "q11", "answer": "算法能够帮助我们把复杂问题拆解成可执行步骤，并提升程序的效率与可维护性。"}
  ]
}`;

const FEW_SHOT_ANALYSIS = `
示例输入：
[
  {"id": "q1", "type": "单选题", "content": "以下哪个是面向对象编程的特征？", "options": ["A. 封装", "B. 递归", "C. 排序", "D. 遍历"]},
  {"id": "q2", "type": "多选题", "content": "以下哪些是 HTTP 请求方法？", "options": ["A. GET", "B. POST", "C. SELECT", "D. DELETE"]},
  {"id": "q3", "type": "判断题", "content": "TCP 是无连接协议。"},
  {"id": "q4", "type": "填空题", "content": "HTTP 协议默认使用____端口，HTTPS 默认使用____端口", "blankCount": 2},
  {"id": "q5", "type": "简答题", "content": "简述 TCP 三次握手的过程"},
  {"id": "q6", "type": "名词解释", "content": "面向对象编程"},
  {"id": "q7", "type": "阅读理解", "content": "Artificial intelligence has made remarkable progress...", "subQuestions": [{"index": 1, "content": "What architecture do large language models primarily rely on?", "options": ["A. CNN", "B. RNN", "C. Transformer"]}, {"index": 2, "content": "What limitation is mentioned?", "options": ["A. Lack of true understanding", "B. Cannot generate text", "C. Needs tiny datasets"]}]},
  {"id": "q8", "type": "完形填空", "content": "Software development has evolved significantly...", "subQuestions": [{"index": 1, "content": "第1空", "options": ["A. natural", "B. low-level", "C. high-level", "D. machine"]}, {"index": 2, "content": "第2空", "options": ["A. low-level", "B. high-level", "C. scripting", "D. markup"]}]},
  {"id": "q9", "type": "共用选项题", "content": "共用选项: A. HTTP B. FTP C. SMTP D. DNS E. SSH", "subQuestions": [{"index": 1, "content": "用于域名解析的协议是( )"}, {"index": 2, "content": "用于安全远程登录的协议是( )"}]},
  {"id": "q10", "type": "选词填空", "content": "[选词填空]\\nMany people are ____1____ of the risks to their personal ____2____ online.\\n词库: A. privacy B. unaware C. potential D. frequently", "blankCount": 2},
  {"id": "q11", "type": "其他", "content": "请写一段关于学习算法重要性的短文。"}
]

示例输出：
{
  "answers": [
    {"id": "q1", "answer": "A", "confidence": 0.95, "reasoning": "封装是面向对象编程的三大特征之一"},
    {"id": "q2", "answer": ["A", "B", "D"], "confidence": 0.9, "reasoning": "GET、POST、DELETE 是标准 HTTP 方法，SELECT 是 SQL 关键字"},
    {"id": "q3", "answer": "错误", "confidence": 0.98, "reasoning": "TCP 是面向连接的协议，UDP 才是无连接协议"},
    {"id": "q4", "answer": ["80", "443"], "confidence": 0.99, "reasoning": "HTTP 默认端口 80，HTTPS 默认端口 443"},
    {"id": "q5", "answer": "TCP三次握手过程：\\n1. 客户端发送SYN包到服务器\\n2. 服务器回复SYN+ACK包\\n3. 客户端发送ACK包确认连接建立", "confidence": 0.85, "reasoning": "三次握手是TCP建立连接的标准流程"},
    {"id": "q6", "answer": "一种以对象为核心组织程序的编程思想，强调封装、继承和多态。", "confidence": 0.91, "reasoning": "这是对 OOP 核心概念的标准定义。"},
    {"id": "q7", "answer": ["C", "A"], "confidence": 0.9, "reasoning": "第一小题对应 Transformer，第二小题强调当前模型并不真正理解语言。"},
    {"id": "q8", "answer": ["B", "B"], "confidence": 0.86, "reasoning": "Assembly 属于低级语言，C/Java 属于高级语言。"},
    {"id": "q9", "answer": ["D", "E"], "confidence": 0.94, "reasoning": "DNS 负责域名解析，SSH 用于安全远程登录。"},
    {"id": "q10", "answer": ["B", "A"], "confidence": 0.92, "reasoning": "unaware of 表示'不知道'，privacy 表示'隐私'，按空的顺序第1空填B，第2空填A"},
    {"id": "q11", "answer": "算法能够帮助我们把复杂问题拆解成可执行步骤，并提升程序的效率与可维护性。", "confidence": 0.8, "reasoning": "答案围绕算法的重要作用展开，适合开放题型。"}
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
    const obj: Record<string, unknown> = {
      id: q.id,
      type: q.type,
      content: q.content,
    };

    if (q.options.length > 0) {
      obj['options'] = q.options.map((o) => `${o.label}. ${o.text}`);
    }

    if (q.blankCount > 0) {
      obj['blankCount'] = q.blankCount;
    }

    if (q.subQuestions && q.subQuestions.length > 0) {
      obj['subQuestions'] = q.subQuestions.map((sub) => ({
        index: sub.index,
        content: sub.content,
        options: sub.options.map((option) => `${option.label}. ${option.text}`),
      }));
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
