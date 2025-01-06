// 创建答案编辑器
function createAnswerEditor(questionNum, answer = '', type) {
  const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
  if (!handler) {
    console.error('未找到对应的处理器:', type);
    return document.createElement('div');
  }
  return handler.createEditor();
}

// 格式化答案显示
function formatAnswer(answerText) {
  const answers = [];
  const lines = answerText.split('\n');
  let currentAnswer = null;

  for (const line of lines) {
    // 检查是否是新答案的开始
    const answerMatch = line.match(/问题\s*(\d+)\s*答案[:：]/);
    if (answerMatch) {
      // 如果有上一个答案，保存它
      if (currentAnswer) {
        answers.push(currentAnswer);
      }
      // 开始新答案
      currentAnswer = {
        number: answerMatch[1],
        content: []
      };
      continue;
    }

    // 如果有当前答案且行不为空，添加到内容中
    if (currentAnswer && line.trim()) {
      currentAnswer.content.push(line.trim());
    }
  }

  // 保存最后一个答案
  if (currentAnswer) {
    answers.push(currentAnswer);
  }

  // 格式化答案内容
  return answers.map(answer => {
    const content = answer.content.join('\n');
    // 检查是否包含代码块
    if (content.includes('```')) {
      return formatCodeBlock(content);
    }
    return content;
  }).join('\n\n');
}

// 格式化代码块
function formatCodeBlock(text) {
  const codeBlockRegex = /```(?:javascript)?\s*([\s\S]*?)```/g;
  let formattedText = text;

  // 收集所有代码块
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push(match[1].trim());
  }

  // 如果找到代码块,格式化显示
  if (codeBlocks.length > 0) {
    formattedText = codeBlocks.map(code => {
      // 添加行号和语法高亮
      const lines = code.split('\n');
      const numberedLines = lines.map((line, index) =>
        `<div class="code-line">
          <span class="line-number">${index + 1}</span>
          <span class="line-content">${line}</span>
         </div>`
      ).join('');

      return `
        <div class="code-block">
          <div class="code-header">
            <span>JavaScript</span>
            <button onclick="copyCode(this)">复制代码</button>
          </div>
          <div class="code-content">
            ${numberedLines}
          </div>
        </div>
      `;
    }).join('\n\n');

    // 添加样式
    formattedText = `
      <style>
        .code-block {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 16px;
          border-radius: 8px;
          font-family: 'Consolas', monospace;
          margin: 10px 0;
        }
        .code-header {
          padding: 8px;
          border-bottom: 1px solid #333;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .code-header span {
          color: #888;
        }
        .code-header button {
          background: transparent;
          border: 1px solid #666;
          color: #888;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .code-content {
          counter-reset: line;
          white-space: pre;
          overflow-x: auto;
        }
        .code-line {
          display: flex;
          line-height: 1.5;
        }
        .line-number {
          color: #888;
          text-align: right;
          padding-right: 1em;
          user-select: none;
          min-width: 2em;
        }
        .line-content {
          flex: 1;
        }
      </style>
      ${formattedText}
    `;
  }

  return formattedText;
}

// 复制代码功能
function copyCode(button) {
  const codeBlock = button.closest('.code-block');
  const code = Array.from(codeBlock.querySelectorAll('.line-content'))
    .map(line => line.textContent)
    .join('\n');

  navigator.clipboard.writeText(code).then(() => {
    const originalText = button.textContent;
    button.textContent = '已复制!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  });
}

// 获取启用的 AI 列表
function getEnabledAIs() {
  return Object.entries(window.AI_CONFIG).filter(([_, config]) => config.enabled);
}

// 将 enableButtons 函数移到全局作用域
let autoFillBtn, collapseBtn;

function enableButtons() {
  if (!collapseBtn || !autoFillBtn) return;

  collapseBtn.disabled = false;
  collapseBtn.style.cursor = 'pointer';
  collapseBtn.style.background = '#f8f9fa';
  collapseBtn.style.color = '#333';
  collapseBtn.onmouseover = () => collapseBtn.style.background = '#e9ecef';
  collapseBtn.onmouseout = () => collapseBtn.style.background = '#f8f9fa';

  autoFillBtn.disabled = false;
  autoFillBtn.style.cursor = 'pointer';
  autoFillBtn.style.opacity = '1';
  autoFillBtn.onmouseover = () => autoFillBtn.style.background = '#45a049';
  autoFillBtn.onmouseout = () => autoFillBtn.style.background = '#4caf50';
}

// 存储题目信息的 Map
const questionInfoMap = new Map();

// 保存题目信息
function saveQuestionInfo(questionNum, type, content) {
  questionInfoMap.set(questionNum.toString(), {
    type,
    content,
    timestamp: Date.now()
  });
}

// 获取题目信息
function getQuestionInfo(questionNum) {
  return questionInfoMap.get(questionNum.toString());
}

// 更新答案面板
function updateAnswerPanel(aiType, answer) {
  console.log('Updating answer panel:', { aiType, answer });

  const container = document.getElementById('answers-container');
  if (!container) {
    console.error('Answers container not found!');
    return;
  }

  if (answer === 'loading') {
    // 处理 loading 状态
    const aiAnswers = container.querySelectorAll(`.ai-answer-${aiType} .answer-content`);
    aiAnswers.forEach(answerCol => {
      answerCol.innerHTML = createLoadingHTML(aiType);
    });
    return;
  }

  // 解析答案
  const answers = [];
  const regex = /问题\s*(\d+)\s*答案[:：]([^问]*?)(?=问题\s*\d+\s*答案[:：]|$)/gs;
  let match;

  while ((match = regex.exec(answer)) !== null) {
    answers.push({
      questionNum: match[1],
      answer: match[2].trim()
    });
  }

  console.log('解析出的答案:', answers);

  // 获取启用的 AI 列表
  const enabledAIs = getEnabledAIs();

  answers.forEach(({ questionNum, answer }) => {
    // 获取题目信息
    const questionInfo = getQuestionInfo(questionNum);
    if (!questionInfo) {
      console.error('未找到题目信息:', questionNum);
      return;
    }

    // 检查问题行是否存在，如果不存在则创建
    let questionRow = container.querySelector(`.question-row-${questionNum}`);
    if (!questionRow) {
      questionRow = createQuestionRow(questionNum, questionInfo.type, enabledAIs);
      container.appendChild(questionRow);
    }

    // 更新对应 AI 的答案
    const answerCol = questionRow.querySelector(`.ai-answer-${aiType} .answer-content`);
    if (answerCol) {
      updateAnswerContent(answerCol, answer, questionInfo.type);
    }

    // 更新最终答案
    updateFinalAnswer(questionNum);
  });
}

// 创建问题行
function createQuestionRow(questionNum, type, enabledAIs) {
  const row = document.createElement('div');
  row.className = `question-row-${questionNum}`;
  row.style.cssText = `
        display: grid;
        grid-template-columns: 60px repeat(${enabledAIs.length}, 1fr) 1fr;
        gap: 20px;
        padding: 10px 20px;
        border-bottom: 1px solid #eee;
      `;

  // 添加题号列
  const questionNumCol = document.createElement('div');
  questionNumCol.style.cssText = `
        font-weight: bold;
        color: #333;
      `;
  questionNumCol.textContent = questionNum;
  row.appendChild(questionNumCol);

  // 为每个启用的 AI 创建答案列
  enabledAIs.forEach(([aiType, config]) => {
    const aiAnswerCol = createAIAnswerColumn(aiType, config);
    row.appendChild(aiAnswerCol);
  });

  // 添加最终答案列
  const finalAnswerCol = createFinalAnswerColumn(questionNum, type);
  row.appendChild(finalAnswerCol);

  return row;
}

// 创建 AI 答案列
function createAIAnswerColumn(aiType, config) {
  const col = document.createElement('div');
  col.className = `ai-answer-${aiType}`;
  col.style.cssText = `
          padding: 10px;
          background: ${config.color}10;
          border-radius: 4px;
          min-height: 40px;
        `;

  const content = document.createElement('div');
  content.className = 'answer-content';
  content.style.cssText = `
          white-space: pre-wrap;
          word-break: break-word;
        `;

  col.appendChild(content);
  return col;
}

// 创建最终答案列
function createFinalAnswerColumn(questionNum, type) {
  const col = document.createElement('div');
  col.className = 'final-answer';
  col.style.cssText = `
        padding: 10px;
        background: #f8f9fa;
        border-radius: 4px;
        min-height: 40px;
      `;

  const editor = createAnswerEditor(questionNum, '', type);
  col.appendChild(editor);

  return col;
}

// 更新答案内容
function updateAnswerContent(answerCol, answer, type) {
  switch (type) {
    case window.QUESTION_TYPES.FILL_BLANK:
      // 处理填空题答案显示，按行分割并保持原格式
      const lines = answer.split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/第\d+空[:：]/));
      answerCol.innerHTML = lines.join('\n');
      break;

    case window.QUESTION_TYPES.QA:
    case window.QUESTION_TYPES.WORD_DEFINITION:
      // 在每个序号前添加一个空行（而不是两个）
      answerCol.innerHTML = answer.split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          if (/^\d+\./.test(trimmed)) {
            return `\n${trimmed}${trimmed.endsWith('.') ? '' : '.'}`;
          }
          return `${trimmed}${trimmed.endsWith('.') ? '' : '.'}`;
        })
        .filter(Boolean)
        .join('\n');
      break;

    default:
      answerCol.textContent = answer;
  }
}

// 创建 loading HTML
function createLoadingHTML(aiType) {
  return `
    <div class="ai-loading" style="color: ${window.AI_CONFIG[aiType].color}">
      <div class="loading-dots">
        <div></div>
        <div></div>
        <div></div>
      </div>
    </div>
  `;
}

// 添加最终答案计算函数
function updateFinalAnswer(questionNum) {
  // 直接使用题号，不需要从文本中提取
  const num = questionNum.toString();
  console.log('题号:', num);

  const questionRow = document.querySelector(`.question-row-${questionNum}`);
  if (!questionRow) return;

  const finalAnswerCol = questionRow.querySelector('.final-answer');
  if (!finalAnswerCol) return;

  // 收集所有 AI 的答案
  const answers = new Map();
  getEnabledAIs().forEach(([aiType, config]) => {
    const answerCol = questionRow.querySelector(`.ai-answer-${aiType} .answer-content`);
    if (answerCol && !answerCol.querySelector('.ai-loading')) {
      const answer = answerCol.textContent.trim();
      if (answer) {
        answers.set(aiType, {
          answer,
          weight: config.weight
        });
      }
    }
  });

  // 如果没有足够的答案，返回
  if (answers.size === 0) return;

  // 统计答案（忽略大小写）
  const answerCounts = new Map();
  answers.forEach(({ answer, weight }) => {
    // 转换为小写进行比较
    const lowerAnswer = answer.toLowerCase();
    const count = answerCounts.get(lowerAnswer) || {
      count: 0,
      weight: 0,
      originalAnswers: new Map() // 保存原始答案及其出现次数
    };
    count.count++;
    count.weight += weight;
    // 记录原始答案
    count.originalAnswers.set(answer, (count.originalAnswers.get(answer) || 0) + 1);
    answerCounts.set(lowerAnswer, count);
  });

  // 找出最多的答案
  let maxCount = 0;
  let maxWeight = 0;
  let finalAnswer = '';

  answerCounts.forEach((value, lowerAnswer) => {
    if (value.count > maxCount ||
      (value.count === maxCount && value.weight > maxWeight)) {
      maxCount = value.count;
      maxWeight = value.weight;
      // 在相同答案中选择出现次数最多的原始形式
      let maxOriginalCount = 0;
      value.originalAnswers.forEach((count, original) => {
        if (count > maxOriginalCount) {
          maxOriginalCount = count;
          finalAnswer = original;
        }
      });
    }
  });

  // 如果所有答案都只出现一次，使用权重最高的 AI 的答案
  if (maxCount === 1) {
    let highestWeightAnswer = '';
    let highestWeight = 0;

    answers.forEach(({ answer, weight }) => {
      if (weight > highestWeight) {
        highestWeight = weight;
        highestWeightAnswer = answer;
      }
    });

    finalAnswer = highestWeightAnswer;
  }

  // 获取题目类型
  const questionType = getQuestionTypeFromNumber(num);
  console.log('题目类型:', questionType);

  // 创建可编辑的最终答案
  const editableAnswer = createEditableFinalAnswer(questionType, finalAnswer, num);
  finalAnswerCol.innerHTML = ''; // 清空原有内容
  finalAnswerCol.appendChild(editableAnswer);
}

// 根据题号获取题目类型
function getQuestionTypeFromNumber(questionNum) {
  // 从已保存的题目信息中获取类型
  const questionInfo = getQuestionInfo(questionNum);
  if (questionInfo) {
    return questionInfo.type;
  }

  // 如果没有找到已保存的信息，再从页面提取
  const num = questionNum.toString().replace(/[^0-9.]/g, '');
  console.log('提取的题号:', num);

  const questions = extractQuestionsFromXXT();
  const question = questions.find(q => {
    const qNum = q.number.replace(/[^0-9.]/g, '');
    return qNum === num || qNum === num + '.';
  });

  if (!question) {
    console.error('未找到题目:', num);
    return window.QUESTION_TYPES.OTHER;
  }

  // 保存题目信息
  const type = getQuestionTypeFromText(question.type);
  saveQuestionInfo(num, type, question);
  return type;
}

// 定义题型处理器基类
class QuestionHandler {
  constructor(questionNum, answer) {
    this.questionNum = questionNum;
    this.answer = answer;
  }

  // 创建编辑界面
  createEditor() {
    throw new Error('Must implement createEditor');
  }

  // 获取答案
  getAnswer() {
    throw new Error('Must implement getAnswer');
  }

  // 自动填写
  async autoFill() {
    throw new Error('Must implement autoFill');
  }
}

// 选择题处理器
class ChoiceHandler extends QuestionHandler {
  constructor(questionNum, answer, isMultiple = false) {
    super(questionNum, answer);
    this.isMultiple = isMultiple;
  }

  createEditor() {
    const container = document.createElement('div');
    container.className = 'editable-final-answer';
    container.style.userSelect = 'text';

    if (this.isMultiple) {
      // 处理多选题答案，去掉分号
      const processedAnswer = this.answer.replace(/[^a-zA-Z]/g, '').toUpperCase();
      container.innerHTML = `
        <div class="multiple-choice-input">
          <input type="text" class="answer-input" value="${processedAnswer}" 
            oninput="this.value = this.value.replace(/[^a-zA-Z]/g, '').toUpperCase().split('').sort().join('')"
            placeholder="输入选项字母">
        </div>
      `;
    } else {
      // 单选题显示 ABCD + 其他选项
      container.innerHTML = `
      <div class="options-group">
          ${['A', 'B', 'C', 'D'].map(opt => `
          <label class="option-item">
              <input type="radio" name="final-choice-${this.questionNum}" value="${opt}" 
                ${this.answer === opt ? 'checked' : ''}>
              <span>${opt}</span>
          </label>
        `).join('')}
          <div class="other-option">
            <label class="option-item">
              <input type="radio" name="final-choice-${this.questionNum}" value="other"
                ${!['A', 'B', 'C', 'D'].includes(this.answer) ? 'checked' : ''}>
              <span>其他</span>
            </label>
            <input type="text" class="custom-option-input" value="${!['A', 'B', 'C', 'D'].includes(this.answer) ? this.answer : ''}"
              ${!['A', 'B', 'C', 'D'].includes(this.answer) ? '' : 'disabled'}>
          </div>
      </div>
    `;

      // 添加单选框切换事件
      const radios = container.querySelectorAll('input[type="radio"]');
      const customInput = container.querySelector('.custom-option-input');
      radios.forEach(radio => {
        radio.addEventListener('change', () => {
          customInput.disabled = radio.value !== 'other';
          if (radio.value === 'other') {
            customInput.focus();
          }
        });
      });
    }

    return container;
  }

  getAnswer() {
    const container = document.querySelector(`.question-row-${this.questionNum} .final-answer`);
    if (!container) return '';

    if (this.isMultiple) {
      const input = container.querySelector('.multiple-choice-input input');
      // 直接返回排序后的大写字母
      return input ? input.value.replace(/[^a-zA-Z]/g, '').toUpperCase().split('').sort().join('') : '';
    } else {
      const radioChecked = container.querySelector('input[type="radio"]:checked');
      if (!radioChecked) return '';

      if (radioChecked.value === 'other') {
        const customInput = container.querySelector('.custom-option-input');
        return customInput.value.trim();
      }

      return radioChecked.value;
    }
  }
}

// 填空题处理器
class BlankHandler extends QuestionHandler {
  createEditor() {
    const container = document.createElement('div');
    container.className = 'editable-final-answer';
    container.style.userSelect = 'text';

    // 解析现有答案
    const answers = [];
    if (this.answer) {
      // 匹配所有的"第X空：答案"格式
      const matches = this.answer.split('\n').filter(line => line.trim());
      matches.forEach(match => {
        const parts = match.match(/第(\d+)空[:：](.+)/);
        if (parts) {
          const [_, num, content] = parts;
          const index = parseInt(num) - 1;
          while (answers.length <= index) {
            answers.push('');
          }
          answers[index] = content.trim();
        }
      });
    }

    // 如果没有答案，至少创建一个空白输入框
    if (answers.length === 0) {
      answers.push('');
    }

    // 创建填空输入框
    container.innerHTML = `
      <div class="blanks-group">
        ${answers.map((answer, index) => `
            <div class="blank-item">
              <span class="blank-label">第${index + 1}空:</span>
            <input type="text" class="blank-input" value="${answer}" placeholder="请输入答案">
            </div>
        `).join('')}
      </div>
    `;

    return container;
  }

  getAnswer() {
    const container = document.querySelector(`.question-row-${this.questionNum} .final-answer`);
    if (!container) return '';

    const inputs = container.querySelectorAll('.blank-input');
    return Array.from(inputs)
      .map((input, index) => {
        const value = input.value.trim();
        return value ? `第${index + 1}空：${value}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
}

// 判断题处理器
class JudgeHandler extends QuestionHandler {
  createEditor() {
    const container = document.createElement('div');
    container.className = 'editable-final-answer';
    container.style.userSelect = 'text';

    container.innerHTML = `
      <div class="judge-options-group">
        <label class="judge-option-item">
          <input type="radio" name="final-judge-${this.questionNum}" value="A" 
            ${this.answer === 'A' || this.answer.includes('对') ? 'checked' : ''}>
          <span>A (对)</span>
        </label>
        <label class="judge-option-item">
          <input type="radio" name="final-judge-${this.questionNum}" value="B"
            ${this.answer === 'B' || this.answer.includes('错') ? 'checked' : ''}>
          <span>B (错)</span>
        </label>
      </div>
    `;

    return container;
  }

  getAnswer() {
    const container = document.querySelector(`.question-row-${this.questionNum} .final-answer`);
    if (!container) return '';

    const radioChecked = container.querySelector('input[type="radio"]:checked');
    return radioChecked ? radioChecked.value : '';
  }
}

// 问答题处理器
class QAHandler extends QuestionHandler {
  createEditor() {
    const container = document.createElement('div');
    container.className = 'editable-final-answer';
    container.style.userSelect = 'text';

    // 处理换行符，确保正确显示
    const formattedAnswer = this.answer.split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join('\n');

    container.innerHTML = `
      <div class="qa-editor">
        <textarea class="answer-textarea" rows="6" style="white-space: pre-wrap;">${formattedAnswer}</textarea>
      </div>
    `;

    // 添加自动调整高度的功能
    const textarea = container.querySelector('.answer-textarea');
    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight + 2) + 'px';
    });

    // 初始化高度
    setTimeout(() => {
      textarea.style.height = 'auto';
      textarea.style.height = (textarea.scrollHeight + 2) + 'px';
    }, 0);

    return container;
  }

  getAnswer() {
    const container = document.querySelector(`.question-row-${this.questionNum} .final-answer`);
    if (!container) return '';

    const textarea = container.querySelector('.answer-textarea');
    if (!textarea) return '';

    // 确保每个序号前只有一个空行
    return textarea.value.split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        if (/^\d+\./.test(trimmed)) {
          return `\n${trimmed}${trimmed.endsWith('.') ? '' : '.'}`;
        }
        return `${trimmed}${trimmed.endsWith('.') ? '' : '.'}`;
      })
      .filter(Boolean)
      .join('\n');
  }
}

// 计算题处理器 (与问答题类似)
class CalcHandler extends QAHandler { }

// 更新题型处理器工厂
const QuestionHandlerFactory = {
  handlers: {
    [window.QUESTION_TYPES.SINGLE_CHOICE]: ChoiceHandler,
    [window.QUESTION_TYPES.MULTIPLE_CHOICE]: ChoiceHandler,
    [window.QUESTION_TYPES.FILL_BLANK]: BlankHandler,
    [window.QUESTION_TYPES.JUDGE]: JudgeHandler,
    [window.QUESTION_TYPES.QA]: QAHandler,
    [window.QUESTION_TYPES.WORD_DEFINITION]: QAHandler,
    [window.QUESTION_TYPES.OTHER]: QAHandler
  },

  getHandler(type, questionNum, answer) {
    // 获取题目信息
    const questionInfo = getQuestionInfo(questionNum);
    if (!questionInfo) {
      console.error('未找到题目信息:', questionNum);
      return null;
    }

    // 判断是否是多选题
    if (questionInfo.type === window.QUESTION_TYPES.MULTIPLE_CHOICE) {
      return new ChoiceHandler(questionNum, answer, true);
    }

    const Handler = this.handlers[type];
    if (!Handler) {
      console.error('未知题型:', type);
      return new this.handlers[window.QUESTION_TYPES.OTHER](questionNum, answer);
    }
    return new Handler(questionNum, answer);
  }
};

// 添加通用样式
const style = document.createElement('style');
style.textContent = `
  .editable-final-answer {
    width: 100%;
    font-family: system-ui, -apple-system, sans-serif;
    min-height: 40px;
    display: flex;
    align-items: flex-start;
  }

  .options-group {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    width: 100%;
  }

  .option-item {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    background: #f8f9fa;
    transition: all 0.2s;
    min-width: 30px;
    font-size: 13px;
  }

  .option-item:hover {
    background: #e9ecef;
  }

  .option-item input[type="radio"] {
    margin: 0;
  }

  .other-option {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .custom-option-input {
    width: 100%;
    max-width: 120px;
    padding: 2px 4px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-size: 13px;
  }

  .custom-option-input:focus {
    outline: none;
    border-color: #86b7fe;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
  }

  .custom-option-input:disabled {
    background: #e9ecef;
    cursor: not-allowed;
  }

  .multiple-choice-input {
    width: 100%;
  }

  .multiple-choice-input input {
    width: 100%;
    max-width: 100px;
    padding: 2px 4px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-size: 13px;
    text-transform: uppercase;
  }

  .multiple-choice-input input:focus {
    outline: none;
    border-color: #86b7fe;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
  }

  .blanks-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .blank-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-bottom: 4px;
  }

  .blank-label {
    white-space: nowrap;
    color: #495057;
    font-size: 13px;
    min-width: 50px;
  }

  .blank-input {
    flex: 1;
    width: 100%;
    max-width: 200px;
    padding: 4px 8px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-size: 13px;
  }

  .blank-input:focus {
    outline: none;
    border-color: #86b7fe;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
  }

  .qa-editor {
    width: 100%;
  }

  .answer-textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    min-height: 100px;
  }

  .answer-textarea:focus {
    outline: none;
    border-color: #86b7fe;
    box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
  }

  .ai-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100px;
  }
  
  .loading-dots {
    display: flex;
    gap: 8px;
  }
  
  .loading-dots div {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: currentColor;
    animation: dot-flashing 1s infinite linear alternate;
  }
  
  .loading-dots div:nth-child(2) { animation-delay: 0.2s; }
  .loading-dots div:nth-child(3) { animation-delay: 0.4s; }
  
  @keyframes dot-flashing {
    0% { opacity: 0.2; transform: scale(0.8); }
    100% { opacity: 1; transform: scale(1); }
  }

  /* 确保每列宽度一致 */
  .question-row {
    display: grid;
    grid-template-columns: 60px repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    padding: 10px 20px;
    border-bottom: 1px solid #eee;
    align-items: start;
  }

  .final-answer {
    min-width: 200px;
    max-width: 100%;
  }

  .judge-options-group {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    width: 100%;
  }

  .judge-option-item {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    background: #f8f9fa;
    transition: all 0.2s;
    font-size: 13px;
  }

  .judge-option-item:hover {
    background: #e9ecef;
  }

  .multiple-choice-input {
    width: 100%;
  }

  .multiple-choice-input input {
    width: 100%;
    padding: 2px 6px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    font-size: 13px;
    text-transform: uppercase;
  }

  .options-group {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    width: 100%;
  }

  .option-item {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    background: #f8f9fa;
    transition: all 0.2s;
    min-width: 30px;
    font-size: 13px;
  }
`;
document.head.appendChild(style);

// 使用示例
function createEditableFinalAnswer(type, answer, questionNum) {
  const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
  if (!handler) return null;
  return handler.createEditor();
}

// 自动填写功能
async function autoFillAnswers() {
  const questionRows = document.querySelectorAll('[class^="question-row-"]');

  for (const row of questionRows) {
    const questionNum = row.className.match(/question-row-(\d+)/)[1];
    const type = getQuestionTypeFromNumber(questionNum);
    console.log(`处理第 ${questionNum} 题，题型:`, type);

    // 根据题型获取答案
    let answer;
    const finalAnswerCol = row.querySelector('.final-answer');
    if (!finalAnswerCol) {
      console.error('未找到最终答案列:', questionNum);
      continue;
    }

    switch (type) {
      case 'single':
      case 'multiple':
        // 选择题答案获取
        const radioChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
        if (radioChecked) {
          answer = radioChecked.value;
        } else {
          const customInput = finalAnswerCol.querySelector('.custom-option-input');
          answer = customInput?.value || '';
        }
        break;

      case 'blank':
        // 填空题答案获取
        answer = Array.from(finalAnswerCol.querySelectorAll('.blank-input'))
          .map(input => input.value);
        break;

      case 'judge':
        // 判断题答案获取
        const judgeChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
        answer = judgeChecked ? judgeChecked.value : '';
        break;

      case 'qa':
      case 'other':
        // 问答题和计算题答案获取
        answer = finalAnswerCol.querySelector('.answer-textarea')?.value || '';
        break;

      default:
        console.log('未知题型:', type);
        continue;
    }

    if (!answer || (Array.isArray(answer) && answer.every(a => !a))) {
      console.log(`第 ${questionNum} 题未选择答案`);
      continue;
    }

    console.log(`第 ${questionNum} 题答案:`, answer);

    // 添加随机延迟
    const delay = Math.floor(Math.random() * 3000) + 2000;
    console.log(`等待 ${delay}ms 后填写题目 ${questionNum}`);
    await new Promise(resolve => setTimeout(resolve, delay));

    // 根据题型执行不同的填写逻辑
    const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
    if (handler) {
      await handler.autoFill();
    }
  }
}

// 添加自动填写的具体实现函数
async function autoFillChoice(questionNum, answer) {
  // 先尝试使用题号查找
  const questions = document.querySelectorAll('.questionLi');
  const question = Array.from(questions).find(q => {
    const titleNumber = q.querySelector('.mark_name')?.textContent?.trim()?.split('.')[0];
    return titleNumber === questionNum.toString();
  });

  if (question) {
    console.log('通过题号找到题目:', question);
    await fillChoiceAnswer(question, answer);
    return;
  }

  // 如果通过题号找不到，再尝试使用 data 属性查找
  const questionDiv = document.querySelector(`.questionLi[data="${questionNum}"]`);
  if (questionDiv) {
    console.log('通过 data 属性找到题目:', questionDiv);
    await fillChoiceAnswer(questionDiv, answer);
    return;
  }

  // 最后尝试使用 id 查找
  const questionById = document.querySelector(`#sigleQuestionDiv_${questionNum}`);
  if (questionById) {
    console.log('通过 id 找到题目:', questionById);
    await fillChoiceAnswer(questionById, answer);
    return;
  }

  console.error('未找到题目:', questionNum);
}

// 分离选择题答案的填写逻辑
async function fillChoiceAnswer(questionDiv, answer) {
  try {
    console.log('开始填写答案:', answer);
    const options = questionDiv.querySelectorAll('.answerBg');
    let found = false;

    options.forEach(option => {
      const optionSpan = option.querySelector('.num_option');
      if (!optionSpan) return;

      const optionLabel = optionSpan.textContent.trim();
      console.log('检查选项:', optionLabel);

      if (optionLabel === answer) {
        found = true;
        console.log('找到匹配选项:', optionLabel);

        try {
          // 使用原生点击事件
          option.click();
          console.log('已点击选项');
        } catch (error) {
          console.error('点击选项失败:', error);

          // 尝试使用事件分发
          try {
            option.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
            console.log('已分发点击事件');
          } catch (dispatchError) {
            console.error('分发点击事件失败:', dispatchError);
          }
        }
      }
    });

    if (!found) {
      console.log('未找到匹配选项:', answer);
    }
  } catch (error) {
    console.error('填写选择题答案失败:', error);
  }
}

async function autoFillBlank(questionNum, answers) {
  // 使用 data 属性查找题目
  const questionDiv = document.querySelector(`.questionLi[data="${questionNum}"]`);
  if (!questionDiv) {
    // 尝试使用题号查找
    const questions = document.querySelectorAll('.questionLi');
    const question = Array.from(questions).find(q => {
      const titleNumber = q.querySelector('.mark_name')?.firstChild?.textContent?.trim();
      return titleNumber === `${questionNum}.`;
    });

    if (!question) {
      console.error('未找到原题目:', questionNum);
      return;
    }

    console.log('通过题号找到题目:', question);
    await fillBlankAnswers(question, answers);
  } else {
    console.log('通过 data 属性找到题目:', questionDiv);
    await fillBlankAnswers(questionDiv, answers);
  }
}

async function autoFillJudge(questionNum, answer) {
  const questionDiv = document.querySelector(`[data="${questionNum}"]`);
  if (!questionDiv) return;

  const options = questionDiv.querySelectorAll('.answerBg');
  options.forEach(option => {
    const optionText = option.textContent.trim();
    if ((answer === '√' && optionText.includes('正确')) ||
      (answer === '×' && optionText.includes('错误'))) {
      try {
        option.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      } catch (error) {
        console.error('触发点击事件失败:', error);
      }
    }
  });
}

async function autoFillQA(questionNum, answer) {
  // 先尝试使用题号查找
  const questions = document.querySelectorAll('.questionLi');
  const question = Array.from(questions).find(q => {
    const titleNumber = q.querySelector('.mark_name')?.textContent?.trim()?.split('.')[0];
    return titleNumber === questionNum.toString();
  });

  if (question) {
    console.log('通过题号找到题目:', question);
    await fillQAAnswers(question, answer);
    return;
  }

  // 如果通过题号找不到，再尝试使用 data 属性查找
  const questionDiv = document.querySelector(`.questionLi[data="${questionNum}"]`);
  if (questionDiv) {
    console.log('通过 data 属性找到题目:', questionDiv);
    await fillQAAnswers(questionDiv, answer);
    return;
  }

  // 最后尝试使用 id 查找
  const questionById = document.querySelector(`#sigleQuestionDiv_${questionNum}`);
  if (questionById) {
    console.log('通过 id 找到题目:', questionById);
    await fillQAAnswers(questionById, answer);
    return;
  }

  console.error('未找到题目:', questionNum);
}

async function fillQAAnswers(questionDiv, answer) {
  try {
    // 1. 找到答题区域
    const answerDiv = questionDiv.querySelector('.stem_answer.examAnswer');
    if (!answerDiv) {
      console.error('未找到答题区域');
      return;
    }

    // 2. 找到编辑器的 iframe
    const editorFrame = answerDiv.querySelector('.edui-editor-iframeholder iframe');
    if (!editorFrame) {
      console.error('未找到编辑器 iframe');
      return;
    }

    // 3. 点击编辑区域激活编辑器
    editorFrame.click();
    console.log('点击编辑区域');
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. 在编辑器中输入内容
    const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
    const editorBody = editorDoc.body;
    editorBody.innerHTML = `<p>${answer}</p>`;
    console.log('设置答案内容');

    // 5. 触发编辑器的 input 事件
    editorBody.dispatchEvent(new Event('input', {
      bubbles: true,
      cancelable: true
    }));

    // 6. 找到并点击保存按钮
    const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn');
    if (saveBtn) {
      console.log('点击保存按钮');
      saveBtn.click();
    } else {
      console.error('未找到保存按钮');
    }

    // 等待保存完成
    await new Promise(resolve => setTimeout(resolve, 200));

  } catch (error) {
    console.error('填写答案失败:', error);
  }
}

// 根据题型调用对应的填写函数
async function autoFill(questionNum, answer, type) {
  console.log(`处理第 ${questionNum} 题，题型: ${type}`);

  switch (type) {
    case 'single':
    case 'multiple':
      await autoFillChoice(questionNum, answer);
      break;

    case 'blank':
      await autoFillBlank(questionNum, answer);
      break;

    case 'judge':
      await autoFillJudge(questionNum, answer);
      break;

    case 'qa':
    case 'other':
      await autoFillQA(questionNum, answer);
      break;

    default:
      console.log('未知题型:', type);
  }
}

// 导出需要的函数
window.showAnswersModal = showAnswersModal;
window.updateAnswerPanel = updateAnswerPanel;

// 定义题型常量
const QUESTION_TYPES = window.QUESTION_TYPES_CONFIG;

// 在发送题目到 AI 之前保存题目信息
function saveQuestions(questions) {
  questions.forEach(question => {
    const num = question.number.replace(/[^0-9.]/g, '');
    const type = getQuestionTypeFromText(question.type);
    saveQuestionInfo(num, type, question);
  });
}

// 根据题型文本判断类型
function getQuestionTypeFromText(typeText) {
  const type = typeText.toLowerCase();
  if (type.includes('多选题')) {
    return window.QUESTION_TYPES.MULTIPLE_CHOICE;
  } else if (type.includes('单选题')) {
    return window.QUESTION_TYPES.SINGLE_CHOICE;
  } else if (type.includes('填空题')) {
    return window.QUESTION_TYPES.FILL_BLANK;
  } else if (type.includes('判断题')) {
    return window.QUESTION_TYPES.JUDGE;
  } else if (type.includes('名词解释')) {
    return window.QUESTION_TYPES.WORD_DEFINITION;
  } else if (type.includes('简答题') || type.includes('问答题') || type.includes('论述题')) {
    return window.QUESTION_TYPES.QA;
  }
  return window.QUESTION_TYPES.OTHER;
}

// 修改 showAnswersModal 函数
function showAnswersModal() {
  console.log('Showing answers modal');

  // 检查是否已存在模态框
  const existingModal = document.getElementById('ai-answers-modal');
  if (existingModal) {
    existingModal.style.display = 'flex';
    return;
  }

  // 先保存题目信息
  const questions = extractQuestionsFromXXT();
  saveQuestions(questions);

  // 获取启用的 AI 列表
  const enabledAIs = getEnabledAIs();
  console.log('启用的 AI:', enabledAIs);

  // 创建模态框
  const modal = document.createElement('div');
  modal.id = 'ai-answers-modal';
  modal.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90%;
    max-width: 1200px;
    height: 90vh;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 10000;
    display: flex;
    flex-direction: column;
  `;

  // 创建头部
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px;
    border-bottom: 1px solid #eee;
  `;

  // 创建标题行
  const titleRow = document.createElement('div');
  titleRow.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    cursor: move;
  `;

  const title = document.createElement('h3');
  title.textContent = 'AI 回答对比';
  title.style.cssText = `
    margin: 0;
    font-size: 18px;
    color: #333;
    flex: 1;
    text-align: center;
  `;

  // 添加拖动图标
  const dragIcon = document.createElement('div');
  dragIcon.innerHTML = '⋮⋮';  // 使用点状图标
  dragIcon.style.cssText = `
    font-size: 18px;
    color: #999;
    padding: 0 15px;
    cursor: move;
    user-select: none;
  `;

  // 添加拖动功能
  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;
  let xOffset = 0;
  let yOffset = 0;

  function dragStart(e) {
    if (e.type === "touchstart") {
      initialX = e.touches[0].clientX - xOffset;
      initialY = e.touches[0].clientY - yOffset;
    } else {
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
    }

    if (e.target === dragIcon || e.target === titleRow || e.target === title) {
      isDragging = true;
    }
  }

  function dragEnd() {
    isDragging = false;
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();

      if (e.type === "touchmove") {
        currentX = e.touches[0].clientX - initialX;
        currentY = e.touches[0].clientY - initialY;
      } else {
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
      }

      xOffset = currentX;
      yOffset = currentY;

      const modal = document.getElementById('ai-answers-modal');
      if (modal) {
        modal.style.transform = `translate(calc(-50% + ${currentX}px), calc(-50% + ${currentY}px))`;
      }
    }
  }

  // 添加事件监听
  titleRow.addEventListener('mousedown', dragStart);
  titleRow.addEventListener('touchstart', dragStart);

  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag);

  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('touchend', dragEnd);

  // 组装标题行
  titleRow.appendChild(dragIcon);
  titleRow.appendChild(title);

  // 创建右侧按钮组
  const rightGroup = document.createElement('div');
  rightGroup.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
  `;

  // 收起AI回答按钮
  collapseBtn = document.createElement('button');
  collapseBtn.textContent = '收起AI回答';
  collapseBtn.style.cssText = `
    padding: 6px 12px;
    background: #f8f9fa;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    color: #333;
    transition: all 0.2s;
  `;

  collapseBtn.onmouseover = () => collapseBtn.style.background = '#e9ecef';
  collapseBtn.onmouseout = () => collapseBtn.style.background = '#f8f9fa';

  // 自动填写按钮
  autoFillBtn = document.createElement('button');
  autoFillBtn.textContent = '自动填写';
  autoFillBtn.style.cssText = `
    padding: 6px 12px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  `;

  autoFillBtn.onmouseover = () => autoFillBtn.style.background = '#45a049';
  autoFillBtn.onmouseout = () => autoFillBtn.style.background = '#4caf50';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;'; // 使用 HTML 实体
  closeBtn.style.cssText = `
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f5;
    border: none;
    border-radius: 50%;
    font-size: 24px;
    cursor: pointer;
    color: #666;
    transition: all 0.2s;
    margin-left: 10px;
  `;

  // 添加按钮悬停效果
  closeBtn.onmouseover = () => {
    closeBtn.style.background = '#e0e0e0';
    closeBtn.style.color = '#333';
  };
  closeBtn.onmouseout = () => {
    closeBtn.style.background = '#f5f5f5';
    closeBtn.style.color = '#666';
  };

  // 添加关闭事件
  closeBtn.onclick = () => {
    const modal = document.getElementById('ai-answers-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  };

  // 组装按钮组
  rightGroup.appendChild(collapseBtn);
  rightGroup.appendChild(autoFillBtn);
  rightGroup.appendChild(closeBtn);

  titleRow.appendChild(rightGroup);

  // 创建 AI 名称行
  const aiNamesRow = document.createElement('div');
  aiNamesRow.style.cssText = `
    display: grid;
    grid-template-columns: 60px repeat(${enabledAIs.length}, 1fr) 1fr;
    gap: 20px;
    padding: 0 20px;
  `;

  // 添加空白占位
  const placeholder = document.createElement('div');
  aiNamesRow.appendChild(placeholder);

  // 只添加启用的 AI 名称
  enabledAIs.forEach(([type, config]) => {
    const aiName = document.createElement('div');
    aiName.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
      color: ${config.color};
      font-size: 16px;
      text-align: center;
      padding: 10px;
      border-bottom: 3px solid ${config.color};
    `;

    // AI 名称
    const nameSpan = document.createElement('span');
    nameSpan.textContent = config.name;

    // 重发按钮
    const retryBtn = document.createElement('button');
    retryBtn.innerHTML = '↻';
    retryBtn.title = '重新发送';
    retryBtn.style.cssText = `
      background: none;
      border: none;
      color: ${config.color};
      cursor: pointer;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: opacity 0.2s;
    `;
    retryBtn.onmouseover = () => retryBtn.style.opacity = '1';
    retryBtn.onmouseout = () => retryBtn.style.opacity = '0.8';
    retryBtn.onclick = () => {
      const currentQuestion = modal.dataset.currentQuestion;
      if (currentQuestion) {
        sendToAI(type, currentQuestion);
      }
    };

    aiName.appendChild(nameSpan);
    aiName.appendChild(retryBtn);
    aiNamesRow.appendChild(aiName);
  });

  // 添加最终答案列标题
  const finalAnswerTitle = document.createElement('div');
  finalAnswerTitle.style.cssText = `
    font-weight: bold;
    color: #333;
    font-size: 16px;
    text-align: center;
    padding: 10px;
    border-bottom: 3px solid #333;
  `;
  finalAnswerTitle.textContent = '最终答案';
  aiNamesRow.appendChild(finalAnswerTitle);

  header.appendChild(titleRow);
  header.appendChild(aiNamesRow);

  // 创建答案容器
  const answersContainer = document.createElement('div');
  answersContainer.id = 'answers-container';
  answersContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  `;

  modal.appendChild(header);
  modal.appendChild(answersContainer);

  document.body.appendChild(modal);

  console.log('Answers modal created');

  // 在 showAnswersModal 函数中修改收起按钮的事件处理
  collapseBtn.onclick = () => {
    const modal = document.getElementById('ai-answers-modal');
    const container = document.getElementById('answers-container');
    const aiNamesRow = modal.querySelector('div[style*="grid-template-columns"]');
    const allQuestionRows = container.querySelectorAll('[class^="question-row-"]');

    // 切换按钮文本
    const isCollapsed = collapseBtn.textContent === '展开AI回答';
    collapseBtn.textContent = isCollapsed ? '收起AI回答' : '展开AI回答';

    if (isCollapsed) {
      // 展开状态
      modal.style.width = '90%';
      modal.style.maxWidth = '1200px';

      // 恢复 AI 名称行的列数
      const enabledAIs = getEnabledAIs();
      aiNamesRow.style.gridTemplateColumns = `60px repeat(${enabledAIs.length}, 1fr) 1fr`;

      // 显示所有 AI 答案列
      allQuestionRows.forEach(row => {
        row.style.gridTemplateColumns = aiNamesRow.style.gridTemplateColumns;
        const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
        aiCols.forEach(col => col.style.display = 'block');
      });

      // 显示 AI 名称
      const aiNames = aiNamesRow.querySelectorAll('div');
      aiNames.forEach((div, index) => {
        if (index > 0 && index < aiNames.length - 1) {
          div.style.display = 'flex';
        }
      });
    } else {
      // 收起状态
      modal.style.width = '500px';
      modal.style.maxWidth = '500px';

      // 修改 AI 名称行的列数
      aiNamesRow.style.gridTemplateColumns = '60px 1fr';

      // 隐藏 AI 答案列
      allQuestionRows.forEach(row => {
        row.style.gridTemplateColumns = '60px 1fr';
        const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
        aiCols.forEach(col => col.style.display = 'none');
      });

      // 隐藏 AI 名称
      const aiNames = aiNamesRow.querySelectorAll('div');
      aiNames.forEach((div, index) => {
        if (index > 0 && index < aiNames.length - 1) {
          div.style.display = 'none';
        }
      });
    }
  };

  // 在 showAnswersModal 函数中修改自动填写按钮的事件处理
  autoFillBtn.onclick = async () => {
    await autoFillAnswers();
  };
}