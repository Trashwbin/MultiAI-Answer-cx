// 先定义题型常量
window.QUESTION_TYPES = {
  SINGLE_CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  FILL_BLANK: '填空题',
  JUDGE: '判断题',
  QA: '简答题',
  WORD_DEFINITION: '名词解释',
  OTHER: '其他'
};

// 然后定义题型配置
window.QUESTION_TYPES_CONFIG = {
  [window.QUESTION_TYPES.SINGLE_CHOICE]: {
    name: '单选题',
    subtypes: ['单选题']
  },
  [window.QUESTION_TYPES.MULTIPLE_CHOICE]: {
    name: '多选题',
    subtypes: ['多选题']
  },
  [window.QUESTION_TYPES.FILL_BLANK]: {
    name: '填空题',
    subtypes: ['填空题']
  },
  [window.QUESTION_TYPES.JUDGE]: {
    name: '判断题',
    subtypes: ['判断题']
  },
  [window.QUESTION_TYPES.QA]: {
    name: '简答题',
    subtypes: ['简答题']
  },
  [window.QUESTION_TYPES.WORD_DEFINITION]: {
    name: '名词解释',
    subtypes: ['名词解释']
  },
  [window.QUESTION_TYPES.OTHER]: {
    name: '其他',
    subtypes: ['其他']
  }
};

// 最后定义其他配置
window.AI_CONFIG = {
  kimi: {
    name: 'Kimi',
    color: '#FF6B6B',
    weight: 2,
    enabled: true
  },
  deepseek: {
    name: 'DeepSeek',
    color: '#4ECDC4',
    weight: 1,
    enabled: true
  },
  tongyi: {
    name: '通义千问',
    color: '#45B7D1',
    weight: 1,
    enabled: true
  },
  chatglm: {
    name: '智谱清言',
    color: '#2454FF',
    weight: 1,
    enabled: true
  },
  doubao: {
    name: '豆包',
    color: '#FF6A00',
    weight: 1,
    enabled: true
  },
  yiyan: {
    name: '文心一言',
    color: '#4B5CC4',
    weight: 1,
    enabled: true
  }
};

// 回答模式配置
window.ANSWER_MODES = [
  {
    id: 'concise',
    label: '简洁模式',
    prompt: `请用中文回答以下题目。
请严格按照以下格式回答，注意每个答案必须以"问题X答案:"开头，X为题号：

选择题答案格式：
问题1答案:
A

多选题答案格式：
问题2答案:
A;B;C

填空题答案格式：
问题3答案:
第1空：xxx
第2空：xxx

判断题答案格式：
问题4答案:
A. 对

简答题答案格式：
问题5答案:
1. xxx
2. xxx
3. xxx

名词解释答案格式：
问题6答案:
1. xxx：具体解释
2. xxx：具体解释

注意事项：
1. 选择题必须直接给出选项字母，不带选项内容，多选题用分号分隔
2. 填空题用"第N空："格式，题目里说有几个空就有几个"第N空："，且数字两边不要有空格
3. 简答题和名词解释用数字列表
4. 答案之间用一个空行分隔
5. 不要添加任何解释性文字
6. 所有答案必须用中文回答，除非某一题要求用英文回答

题目如下：\n\n`
  },
  {
    id: 'detailed',
    label: '解析模式',
    prompt: `请用中文回答以下题目。
请严格按照以下格式回答，注意每个答案必须以"问题X答案:"开头，X为题号：

选择题答案格式：
问题1答案:
答案：A
解析：
1. 选择A的原因...
2. 其他选项错误原因...
3. 本题考点...

多选题答案格式：
问题2答案:
答案：A;B;C
解析：
1. 选择A的原因...
2. 选择B的原因...
3. 选择C的原因...
4. 本题考点...

填空题答案格式：
问题3答案:
答案：
第1空：xxx
第2空：xxx
解析：
1. 第1空解释...
2. 第2空解释...
3. 相关知识点...

判断题答案格式：
问题4答案:
答案：A. 对
解析：
1. 判断依据...
2. 相关知识点...
3. 易错分析...

简答题答案格式：
问题5答案:
答案：
1. xxx
2. xxx
3. xxx
解析：
1. 要点一解释...
2. 要点二解释...
3. 相关知识点...

名词解释答案格式：
问题6答案:
答案：
1. xxx：具体解释
2. xxx：具体解释
解析：
1. 补充说明...
2. 应用场景...
3. 相关概念...

注意事项：
1. 每个答案必须先给出标准答案，再进行解析
2. 选择题直接给出选项字母，多选题用分号分隔
3. 填空题用"第N空："格式，题目里说有几个空就有几个"第N空："
4. 简答题和名词解释用数字列表
5. 答案之间用一个空行分隔
6. 所有答案必须用中文回答，除非某一题要求用英文回答
7. 解析部分必须分点说明，每点一行

题目如下：\n\n`
  }
]; 