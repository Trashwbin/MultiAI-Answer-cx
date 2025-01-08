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

    // 移除自动添加句号的逻辑，直接返回每行内容
    return textarea.value.split('\n')
      .map(line => line.trim())
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
      //console.error('未找到题目信息:', questionNum);
      return null;
    }

    // 判断是否是多选题
    if (questionInfo.type === window.QUESTION_TYPES.MULTIPLE_CHOICE) {
      return new ChoiceHandler(questionNum, answer, true);
    }

    const Handler = this.handlers[type];
    if (!Handler) {
      //console.error('未知题型:', type);
      return new this.handlers[window.QUESTION_TYPES.OTHER](questionNum, answer);
    }
    return new Handler(questionNum, answer);
  }
};

// 使用示例
function createEditableFinalAnswer(type, answer, questionNum) {
  const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
  if (!handler) return null;
  return handler.createEditor();
}

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
    width: 92%;
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
`;
document.head.appendChild(style);

// 导出工厂和处理器
window.QuestionHandlerFactory = QuestionHandlerFactory;
window.createEditableFinalAnswer = createEditableFinalAnswer;
