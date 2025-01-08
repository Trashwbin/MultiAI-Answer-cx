// 创建答案编辑器
function createAnswerEditor(questionNum, answer = '', type) {
  const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
  if (!handler) {
    //console.error('未找到对应的处理器:', type);
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
async function getEnabledAIs() {
  try {
    // 直接返回过滤后的数组，不需要额外的 Promise 包装
    const enabledAIs = Object.entries(window.AI_CONFIG)
      .filter(([_, config]) => config.enabled);
    //console.log('已启用的 AI 列表:', enabledAIs);
    return enabledAIs;
  } catch (error) {
    //console.error('获取已启用的 AI 列表失败:', error);
    return [];
  }
}

// 发送消息到 AI
async function sendMessageToAI(aiType, message) {
  return await retryOperation(async () => {
    try {
      // 设置超时时间为 5 分钟
      const timeout = 300000;

      const response = await Promise.race([
        chrome.runtime.sendMessage({
          type: 'ASK_QUESTION',
          aiType: aiType,
          question: message
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('请求超时')), timeout)
        )
      ]);

      if (!response) {
        throw new Error('未收到响应');
      }

      if (response.error) {
        throw new Error(response.error);
      }

      return response;
    } catch (error) {
      if (error.message.includes('Extension context invalidated') ||
        error.message.includes('message channel closed')) {
        //console.log('连接断开，尝试重新连接...');
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 尝试重新建立连接
        try {
          await chrome.runtime.connect();
        } catch (connectError) {
          //console.error('重新连接失败:', connectError);
        }
      }
      throw error;
    }
  }, 5, 2000); // 最多重试5次，每次间隔2秒
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
function getQuestionInfo(questionId) {
  const questions = window.extractedQuestions || [];

  // 首先尝试直接通过 ID 查找
  let question = questions.find(q => q.id === questionId);

  if (!question) {
    // 如果找不到，尝试通过题号查找
    const numericId = questionId.toString().replace(/[^0-9]/g, '');
    question = questions.find(q => {
      // 移除非数字字符后比较
      const qNum = q.number.replace(/[^0-9]/g, '');
      return qNum === numericId;
    });
  }

  if (!question) {
    //console.error('未找到题目信息:', questionId);
    return null;
  }

  return {
    id: question.id,
    number: question.number,
    type: question.questionType,
    content: question.content,
    options: question.options
  };
}

// 更新答案面板
async function updateAnswerPanel(aiType, answer) {
  //console.log('Updating answer panel:', { aiType, answer });

  const container = document.getElementById('answers-container');
  if (!container) {
    //console.error('Answers container not found!');
    return;
  }

  try {
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

    //console.log('解析出的答案:', answers);

    // 获取启用的 AI 列表
    const enabledAIs = await getEnabledAIs();
    if (!Array.isArray(enabledAIs)) {
      throw new Error('无效的 AI 列表');
    }

    // 使用 Promise.all 等待所有答案更新完成
    await Promise.all(answers.map(async ({ questionNum, answer }) => {
      try {
        // 获取题目信息
        const questionInfo = getQuestionInfo(questionNum);
        if (!questionInfo) {
          //console.error('未找到题目信息:', questionNum);
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
        await updateFinalAnswer(questionNum);
      } catch (error) {
        //console.error(`处理题目 ${questionNum} 时出错:`, error);
        // 显示错误信息到界面
        const errorMessage = `处理答案时出错: ${error.message}`;
        const aiAnswers = container.querySelectorAll(`.ai-answer-${aiType} .answer-content`);
        aiAnswers.forEach(answerCol => {
          answerCol.innerHTML = `<div class="error-message">${errorMessage}</div>`;
        });
      }
    }));
  } catch (error) {
    //console.error('更新答案面板时出错:', error);
    // 显示错误信息到界面
    const errorMessage = `更新答案时出错: ${error.message}`;
    const aiAnswers = container.querySelectorAll(`.ai-answer-${aiType} .answer-content`);
    aiAnswers.forEach(answerCol => {
      answerCol.innerHTML = `<div class="error-message">${errorMessage}</div>`;
    });
  }
}

// 创建问题行
function createQuestionRow(questionNum, type, enabledAIs) {
  const row = document.createElement('div');
  row.className = `question-row-${questionNum}`;

  // 添加题目 ID 作为 data 属性
  const questionInfo = getQuestionInfo(questionNum);
  if (questionInfo) {
    row.dataset.id = questionInfo.id;
    row.dataset.number = questionInfo.number;
  }

  row.style.cssText = `
    display: grid;
    grid-template-columns: 200px repeat(${enabledAIs.length}, 1fr) 1fr;
    gap: 20px;
    padding: 0px 20px;
    align-items: stretch;
    margin-bottom: 12px;
  `;

  // 添加题号列
  const questionNumCol = document.createElement('div');
  questionNumCol.style.cssText = `
    background: #f8f9fa;
    border-radius: 6px;
    padding: 12px;
    min-height: calc(1.5em * 2 + 24px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  `;

  // 创建内容容器
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = `
    font-size: 14px;
    color: #2d3748;
    flex-grow: 1;
  `;

  // 添加题号
  const numberSpan = document.createElement('span');
  numberSpan.textContent = questionInfo ? questionInfo.number : questionNum;
  numberSpan.style.cssText = `
    font-weight: 500;
    color: #4a5568;
    margin-right: 6px;
  `;
  contentDiv.appendChild(numberSpan);

  // 添加题型标签
  if (questionInfo && questionInfo.type) {
    const typeSpan = document.createElement('span');
    typeSpan.style.cssText = `
      font-size: 12px;
      color: #718096;
      background: #edf2f7;
      padding: 1px 6px;
      border-radius: 4px;
      margin-right: 6px;
    `;
    typeSpan.textContent = questionInfo.type;
    contentDiv.appendChild(typeSpan);
  }

  // 添加题目内容
  if (questionInfo && questionInfo.content) {
    const contentSpan = document.createElement('span');
    contentSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.5;
      min-width: 0;
    `;
    contentSpan.textContent = questionInfo.content;
    contentSpan.title = questionInfo.content; // 添加完整内容作为提示
    contentDiv.appendChild(contentSpan);
  }

  questionNumCol.appendChild(contentDiv);
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

// 修改 AI 答案列创建函数
function createAIAnswerColumn(aiType, config) {
  const col = document.createElement('div');
  col.className = `ai-answer-${aiType}`;
  col.style.cssText = `
    padding: 10px;
    background: ${config.color}10;
    border-radius: 4px;
    min-height: calc(1.5em * 2 + 20px); /* 两行文字高度加上内边距 */
    display: flex;
    flex-direction: column;
  `;

  const content = document.createElement('div');
  content.className = 'answer-content';
  content.style.cssText = `
    white-space: pre-wrap;
    word-break: break-word;
    flex-grow: 1;
  `;

  // 添加 loading 状态
  content.innerHTML = createLoadingHTML(aiType);

  col.appendChild(content);
  return col;
}

// 修改最终答案列创建函数
function createFinalAnswerColumn(questionNum, type) {
  const col = document.createElement('div');
  col.className = 'final-answer';
  col.style.cssText = `
    padding: 10px;
    background: #f8f9fa;
    border-radius: 4px;
    min-height: calc(1.5em * 2 + 20px);
    display: flex;
    flex-direction: column;
    width: 100%;
  `;

  const editor = createAnswerEditor(questionNum, '', type);
  editor.style.cssText = `
    flex-grow: 1;
    width: 100%;
  `;

  // 修改编辑器内部的样式
  const textarea = editor.querySelector('.answer-textarea');
  if (textarea) {
    textarea.style.cssText = `
      width: 100%;
      max-width: 100%;
      min-height: calc(1.5em * 2);
      padding: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      resize: vertical;
      background: white;
      color: #2d3748;
      white-space: pre-wrap;
    `;
  }

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
      // 保持原始格式，只处理空行
      answerCol.innerHTML = answer.split('\n')
        .map(line => {
          const trimmed = line.trim();
          if (!trimmed) return '';
          if (/^\d+\./.test(trimmed)) {
            return `\n${trimmed}`;
          }
          return trimmed;
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
  const color = aiType ? window.AI_CONFIG[aiType].color : '#4a90e2';
  return `
    <div class="ai-loading" style="color: ${color}">
      <div class="loading-dots">
        <div></div>
        <div></div>
        <div></div>
      </div>
      
      <div class="timeout-tips">
        <div class="timeout-icon">⏳</div>
        <div class="timeout-text">
          <p>若 AI 长时间未响应</p>
          <p>您可点击上方<span class="highlight">↻</span>重试</p>
        </div>
      </div>
    </div>
  `;
}

// 添加最终答案计算函数
async function updateFinalAnswer(questionNum) {
  // 直接使用题号，不需要从文本中提取
  const num = questionNum.toString();
  //console.log('题号:', num);

  const questionRow = document.querySelector(`.question-row-${questionNum}`);
  if (!questionRow) return;

  const finalAnswerCol = questionRow.querySelector('.final-answer');
  if (!finalAnswerCol) return;

  try {
    // 获取启用的 AI 列表
    const enabledAIs = await getEnabledAIs();
    if (!Array.isArray(enabledAIs) || enabledAIs.length === 0) {
      throw new Error('无效的 AI 列表');
    }

    // 收集所有 AI 的答案
    const answers = new Map();
    for (const [aiType, config] of enabledAIs) {
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
    }

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
    //console.log('题目类型:', questionType);

    // 创建可编辑的最终答案
    const editableAnswer = createEditableFinalAnswer(questionType, finalAnswer, num);
    finalAnswerCol.innerHTML = ''; // 清空原有内容
    finalAnswerCol.appendChild(editableAnswer);
  } catch (error) {
    //console.error('更新最终答案时出错:', error);
  }
}

// 根据题号获取题目类型
function getQuestionTypeFromNumber(questionNum) {
  // 从已保存的题目信息中获取类型
  const questionInfo = getQuestionInfo(questionNum);
  if (questionInfo && questionInfo.type) {
    //console.log('从题目信息中获取到类型:', questionInfo.type);
    return questionInfo.type;
  }

  // 如果没有找到已保存的信息，从页面提取
  const questions = window.extractedQuestions || [];
  const question = questions.find(q => {
    // 移除非数字字符后比较
    const qNum = q.number.replace(/[^0-9]/g, '');
    const targetNum = questionNum.toString().replace(/[^0-9]/g, '');
    return qNum === targetNum;
  });

  if (!question) {
    //console.error('未找到题目:', questionNum);
    return window.QUESTION_TYPES.OTHER;
  }

  // 获取题目类型
  const type = getQuestionTypeFromText(question.type);
  //console.log('从页面提取的题目类型:', type);

  // 保存题目信息
  saveQuestionInfo(questionNum, type, question);

  return type;
}

// 根据题型文本判断类型
function getQuestionTypeFromText(typeText) {
  if (!typeText) return window.QUESTION_TYPES.OTHER;

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
    padding: 6px 20px;
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
    try {
      // 获取题目ID和类型
      const questionId = row.dataset.id;
      const questionNumber = row.dataset.number;

      if (!questionId || !questionNumber) {
        //console.error('未找到题目ID或题号');
        continue;
      }

      // 从保存的题目信息中获取类型
      const questionInfo = getQuestionInfo(questionNumber);
      if (!questionInfo) {
        //console.error('未找到题目信息:', questionNumber);
        continue;
      }

      const type = questionInfo.type;
      //console.log(`处理题目 ID: ${questionId}, 题号: ${questionNumber}, 题型:`, type);

      // 根据题型获取答案
      let answer;
      const finalAnswerCol = row.querySelector('.final-answer');
      if (!finalAnswerCol) {
        //console.error('未找到最终答案列:', questionId);
        continue;
      }

      switch (type) {
        case window.QUESTION_TYPES.SINGLE_CHOICE:
        case window.QUESTION_TYPES.MULTIPLE_CHOICE:
          // 选择题答案获取
          if (type === window.QUESTION_TYPES.MULTIPLE_CHOICE) {
            const multiInput = finalAnswerCol.querySelector('.multiple-choice-input input');
            answer = multiInput?.value || '';
          } else {
            const radioChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
            if (radioChecked && radioChecked.value === 'other') {
              const customInput = finalAnswerCol.querySelector('.custom-option-input');
              answer = customInput?.value || '';
            } else {
              answer = radioChecked?.value || '';
            }
          }
          break;

        case window.QUESTION_TYPES.FILL_BLANK:
          // 填空题答案获取
          const blankInputs = finalAnswerCol.querySelectorAll('.blank-input');
          answer = Array.from(blankInputs).map(input => input.value.trim());
          break;

        case window.QUESTION_TYPES.JUDGE:
          // 判断题答案获取
          const judgeChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
          answer = judgeChecked?.value || '';
          break;

        case window.QUESTION_TYPES.QA:
        case window.QUESTION_TYPES.WORD_DEFINITION:
        case window.QUESTION_TYPES.OTHER:
          // 问答题和其他题型答案获取
          const textarea = finalAnswerCol.querySelector('.answer-textarea');
          answer = textarea?.value || '';
          break;

        default:
          //console.log('未知题型:', type);
          continue;
      }

      if (!answer || (Array.isArray(answer) && answer.every(a => !a))) {
        //console.log(`题目 ${questionId} 未选择答案`);
        continue;
      }

      //console.log(`题目 ${questionId} 答案:`, answer);

      // 根据题型执行不同的填写逻辑
      await autoFill(questionId, answer, type);
    } catch (error) {
      //console.error('处理题目时出错:', error);
    }
  }
}

// 添加自动填写的具体实现函数
async function autoFill(questionId, answer, type) {
  //console.log(`处理题目 ID: ${questionId}，题型: ${type}`);

  // 找到题目元素
  const questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`) ||
    document.querySelector(`.questionLi[data="${questionId}"]`);

  if (questionDiv) {
    // 滚动到题目位置，添加一些偏移以确保题目完全可见
    questionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 等待滚动完成
    await new Promise(resolve => setTimeout(resolve, 500));
    // 添加随机延迟
    const delay = Math.floor(Math.random() * 2000) + 1000;
    //console.log(`等待 ${delay}ms 后填写题目 ${questionId}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    // 根据题型执行不同的填写逻辑
    switch (type) {
      case window.QUESTION_TYPES.SINGLE_CHOICE:
      case window.QUESTION_TYPES.MULTIPLE_CHOICE:
        await autoFillChoice(questionId, answer);
        break;

      case window.QUESTION_TYPES.FILL_BLANK:
        await autoFillBlank(questionId, answer);
        break;

      case window.QUESTION_TYPES.JUDGE:
        await autoFillJudge(questionId, answer);
        break;

      case window.QUESTION_TYPES.QA:
      case window.QUESTION_TYPES.WORD_DEFINITION:
      case window.QUESTION_TYPES.OTHER:
        await autoFillQA(questionId, answer);
        break;

      default:
      //console.log('未知题型:', type);
    }
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改选择题填写函数
async function autoFillChoice(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillChoiceAnswer(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改填空题填写函数
async function autoFillBlank(questionId, answers) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillBlankAnswers(questionDiv, answers);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改判断题填写函数
async function fillJudgeAnswers(questionDiv, answer) {
  try {
    //console.log('开始填写判断题答案:', answer);

    // 查找所有选项
    const options = questionDiv.querySelectorAll('.answerBg');
    if (!options || options.length === 0) {
      //console.error('未找到选项');
      return;
    }

    // 处理答案格式
    let processedAnswer = answer;
    if (answer === 'A' || answer.includes('对') || answer.includes('√')) {
      processedAnswer = 'true';
    } else if (answer === 'B' || answer.includes('错') || answer.includes('×')) {
      processedAnswer = 'false';
    }

    //console.log('处理后的答案:', processedAnswer);

    // 遍历选项找到匹配的
    let found = false;
    options.forEach(option => {
      const optionSpan = option.querySelector('.num_option');
      if (!optionSpan) return;

      const optionValue = optionSpan.getAttribute('data');
      const isChecked = optionSpan.classList.contains('check_answer');

      if (optionValue === processedAnswer && !isChecked) {
        found = true;
        //console.log('选择选项:', optionValue);
        try {
          option.click();
        } catch (error) {
          //console.error('点击选项失败，尝试使用事件分发:', error);
          try {
            option.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          } catch (dispatchError) {
            //console.error('分发点击事件失败:', dispatchError);
          }
        }
      }
    });

    if (!found) {
      //console.log('未找到需要选择的选项:', answer);
    }

  } catch (error) {
    //console.error('填写判断题答案失败:', error);
  }
}

// 修改判断题自动填写函数
async function autoFillJudge(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillJudgeAnswers(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改问答题填写函数
async function autoFillQA(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillQAAnswers(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

async function fillQAAnswers(questionDiv, answer) {
  try {
    // 1. 找到答题区域
    const answerDiv = questionDiv.querySelector('.stem_answer.examAnswer');
    if (!answerDiv) {
      //console.error('未找到答题区域');
      return;
    }

    // 2. 找到编辑器的 iframe
    const editorFrame = answerDiv.querySelector('.edui-editor-iframeholder iframe');
    if (!editorFrame) {
      //console.error('未找到编辑器 iframe');
      return;
    }

    // 3. 点击编辑区域激活编辑器
    editorFrame.click();
    //console.log('点击编辑区域');
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. 在编辑器中输入内容，确保每个点都单独一行
    const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
    const editorBody = editorDoc.body;

    // 处理答案，确保每个点都在新的一行
    const formattedAnswer = answer.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p>${line}</p>`)
      .join('');

    editorBody.innerHTML = formattedAnswer;
    //console.log('设置答案内容');

    // 5. 触发编辑器的 input 事件
    editorBody.dispatchEvent(new Event('input', {
      bubbles: true,
      cancelable: true
    }));

    // 6. 找到并点击保存按钮
    const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn');
    if (saveBtn) {
      //console.log('点击保存按钮');
      saveBtn.click();
    } else {
      //console.error('未找到保存按钮');
    }

    // 等待保存完成
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    //console.error('填写答案失败:', error);
  }
}

// 添加填空题答案填写函数
async function fillBlankAnswers(questionDiv, answers) {
  try {
    //console.log('开始填写填空题答案:', answers);

    // 确保答案数组格式正确
    let processedAnswers = answers;
    if (typeof answers === 'string') {
      // 如果是字符串，尝试解析答案
      processedAnswers = answers.split('\n')
        .map(line => {
          const match = line.match(/第(\d+)空[:：](.+)/);
          return match ? match[2].trim() : null;
        })
        .filter(Boolean);
    }

    //console.log('处理后的答案:', processedAnswers);

    // 查找所有填空的编辑器区域
    const answerDivs = questionDiv.querySelectorAll('.sub_que_div');
    //console.log('找到填空数量:', answerDivs.length);

    for (let i = 0; i < answerDivs.length; i++) {
      const answerDiv = answerDivs[i];
      const answer = processedAnswers[i];
      if (!answer) continue;

      // 添加随机延迟
      const delay = Math.floor(Math.random() * 1000) + 500;
      await new Promise(resolve => setTimeout(resolve, delay));

      // 1. 找到答题区域
      const examAnswerDiv = answerDiv.querySelector('.divText.examAnswer');
      if (!examAnswerDiv) {
        //console.error('未找到答题区域');
        continue;
      }

      // 2. 找到编辑器的 iframe
      const editorFrame = examAnswerDiv.querySelector('.edui-editor-iframeholder iframe');
      if (!editorFrame) {
        //console.error('未找到编辑器 iframe');
        continue;
      }

      // 3. 点击编辑区域激活编辑器
      editorFrame.click();
      //console.log('点击编辑区域');
      await new Promise(resolve => setTimeout(resolve, 100));

      // 4. 在编辑器中输入内容
      const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
      const editorBody = editorDoc.body;
      editorBody.innerHTML = `<p>${answer}</p>`;
      //console.log(`设置第 ${i + 1} 空的答案:`, answer);

      // 5. 触发编辑器的 input 事件
      editorBody.dispatchEvent(new Event('input', {
        bubbles: true,
        cancelable: true
      }));

      // 6. 找到并点击保存按钮
      const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn');
      if (saveBtn) {
        //console.log('点击保存按钮');
        saveBtn.click();
      } else {
        //console.error('未找到保存按钮');
      }

      // 等待保存完成
      await new Promise(resolve => setTimeout(resolve, 200));
    }

  } catch (error) {
    //console.error('填写填空题答案失败:', error);
  }
}

// 添加重试机制的工具函数
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
  let lastError;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      retryCount++;

      //console.log(`操作失败，第 ${retryCount}/${maxRetries} 次重试:`, error);

      // 如果是最后一次尝试，直接抛出错误
      if (retryCount === maxRetries) {
        break;
      }

      // 根据错误类型调整延迟时间
      const retryDelay = error.message.includes('Extension context invalidated') ?
        delay * 2 : delay;

      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new Error(`操作失败 (已重试 ${maxRetries} 次): ${lastError.message}`);
}

// 添加选择题答案填写函数
async function fillChoiceAnswer(questionDiv, answer) {
  try {
    //console.log('开始填写选择题答案:', answer);
    const options = questionDiv.querySelectorAll('.answerBg');
    let found = false;

    // 处理多选题答案
    if (answer.includes(';') || answer.length > 1) {
      // 将答案转换为大写字母数组
      const selectedOptions = Array.isArray(answer) ? answer :
        answer.replace(/[^A-Za-z]/g, '').toUpperCase().split('');
      //console.log('多选题选项:', selectedOptions);

      // 先处理需要取消选择的选项
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option_dx');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer_dx');
        const shouldBeSelected = selectedOptions.includes(optionLabel);

        // 如果已选但不应该被选中，则取消选择
        if (isChecked && !shouldBeSelected) {
          //console.log('取消选择选项:', optionLabel);
          await clickWithDelay(option);
          // 添加随机延迟
          const delay = Math.floor(Math.random() * 1000) + 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // 再处理需要选择的选项
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option_dx');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer_dx');

        if (selectedOptions.includes(optionLabel) && !isChecked) {
          found = true;
          //console.log('选择选项:', optionLabel);
          await clickWithDelay(option);
          // 添加随机延迟
          const delay = Math.floor(Math.random() * 1000) + 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } else {
      // 处理单选题答案
      //console.log('单选题答案:', answer);
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer');

        if (optionLabel === answer.toUpperCase() && !isChecked) {
          found = true;
          //console.log('选择选项:', optionLabel);
          await clickWithDelay(option);
        }
      }
    }

    if (!found) {
      //console.log('未找到需要选择的选项:', answer);
    }
  } catch (error) {
    //console.error('填写选择题答案失败:', error);
  }
}

// 导出需要的函数到 window 对象
window.showAnswersModal = showAnswersModal;
window.updateAnswerPanel = updateAnswerPanel;
window.autoFillAnswers = autoFillAnswers;
window.createEditableFinalAnswer = createEditableFinalAnswer;
window.getQuestionInfo = getQuestionInfo;
window.saveQuestionInfo = saveQuestionInfo;
window.formatAnswer = formatAnswer;
window.copyCode = copyCode;

// 修改 showAnswersModal 函数为异步函数
async function showAnswersModal() {
  //console.log('Showing answers modal');

  // 检查是否已存在模态框
  const existingModal = document.getElementById('ai-answers-modal');
  if (existingModal) {
    existingModal.style.display = 'flex';
    return;
  }

  try {
    // 获取启用的 AI 列表
    const enabledAIs = await getEnabledAIs();
    //console.log('启用的 AI:', enabledAIs);

    if (!Array.isArray(enabledAIs) || enabledAIs.length === 0) {
      throw new Error('没有启用的 AI');
    }

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
      grid-template-columns: 200px repeat(${enabledAIs.length}, 1fr) 1fr;
      gap: 20px;
      padding: 0 20px;
    `;

    // 添加空白占位
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      color: #666;
      font-weight: bold;
      font-size: 16px;
      text-align: center;
      padding: 10px;
      border-bottom: 3px solid #666;
    `;
    placeholder.textContent = '题目';
    aiNamesRow.appendChild(placeholder);

    // 添加启用的 AI 名称
    for (const [type, config] of enabledAIs) {
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

      // 添加点击事件处理
      retryBtn.onclick = async () => {
        try {
          // 获取当前保存的问题
          const answersModal = document.getElementById('ai-answers-modal');
          const currentQuestion = answersModal?.dataset.currentQuestion;

          if (!currentQuestion) {
            //console.error('未找到当前问题');
            return;
          }

          // 更新对应 AI 的答案状态为 loading
          await updateAnswerPanel(type, 'loading');

          // 重新发送问题到对应的 AI
          await sendToAI(type, currentQuestion);

          // 切换到对应的标签页
          chrome.runtime.sendMessage({
            type: 'SWITCH_TAB',
            aiType: type
          });
        } catch (error) {
          //console.error('重发请求失败:', error);
        }
      };

      aiName.appendChild(nameSpan);
      aiName.appendChild(retryBtn);
      aiNamesRow.appendChild(aiName);
    }

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
      position: relative;
    `;

    // 添加初始的整体 loading 状态
    const initialLoadingDiv = document.createElement('div');
    initialLoadingDiv.id = 'initial-loading';
    initialLoadingDiv.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
    `;
    initialLoadingDiv.innerHTML = `
      <div class="ai-loading" style="transform: scale(1.5);">
        <div class="loading-dots">
          <div></div>
          <div></div>
          <div></div>
        </div>
        <div class="timeout-tips" style="margin-top: 30px;">
          <div class="timeout-icon" style="font-size: 24px;">⏳</div>
          <div class="timeout-text">
            <p>正在等待 AI 响应</p>
            <p>请稍候...</p>
          </div>
        </div>
      </div>
    `;
    answersContainer.appendChild(initialLoadingDiv);

    // 创建答案行容器
    const answersRowsContainer = document.createElement('div');
    answersRowsContainer.id = 'answers-rows-container';
    answersContainer.appendChild(answersRowsContainer);


    modal.appendChild(header);
    modal.appendChild(answersContainer);

    document.body.appendChild(modal);

    //console.log('Answers modal created');

    // 在 showAnswersModal 函数中修改收起按钮的事件处理
    collapseBtn.onclick = async () => {
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
        const enabledAIs = await getEnabledAIs();
        aiNamesRow.style.gridTemplateColumns = `200px repeat(${enabledAIs.length}, 1fr) 1fr`;

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
        aiNamesRow.style.gridTemplateColumns = '200px 1fr';

        // 隐藏 AI 答案列
        allQuestionRows.forEach(row => {
          row.style.gridTemplateColumns = '200px 1fr';
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
      // 先收起 AI 回答
      const modal = document.getElementById('ai-answers-modal');
      const container = document.getElementById('answers-container');
      const aiNamesRow = modal.querySelector('div[style*="grid-template-columns"]');
      const allQuestionRows = container.querySelectorAll('[class^="question-row-"]');

      // 更新收起按钮文本
      collapseBtn.textContent = '展开AI回答';

      // 收起状态
      modal.style.width = '500px';
      modal.style.maxWidth = '500px';
      // 将模态框移动到右侧
      modal.style.left = 'auto';
      modal.style.right = '20px';
      modal.style.transform = 'translateY(-50%)';

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

      // 开始自动填写
      await autoFillAnswers();
    };

  } catch (error) {
    //console.error('显示答案模态框时出错:', error);
    alert('显示答案模态框时出错: ' + error.message);
  }
}

// 添加相关样式
const loadingStyle = document.createElement('style');
loadingStyle.textContent = `
  .ai-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
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

  .timeout-tips {
    margin-top: 15px !important;
    text-align: center !important;
    font-size: 13px !important;
    color: #666 !important;
    opacity: 0.9 !important;
    padding: 12px !important;
    border-radius: 8px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 8px !important;
    width: auto !important;
    position: relative !important;
    left: auto !important;
    right: auto !important;
    top: auto !important;
    bottom: auto !important;
    transform: none !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }

  .timeout-icon {
    font-size: 20px !important;
    color: #f0ad4e !important;
    animation: pulse 2s infinite !important;
    line-height: normal !important;
    display: block !important;
  }

  .timeout-text {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    width: auto !important;
  }

  .timeout-text p {
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.4 !important;
    font-size: 13px !important;
    color: #666 !important;
    text-align: center !important;
    width: auto !important;
  }

  .timeout-text .highlight {
    color: #2196F3 !important;
    font-weight: bold !important;
    font-size: 16px !important;
    display: inline-block !important;
    vertical-align: middle !important;
  }

  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }

  #initial-loading {
    transition: opacity 0.3s ease;
  }
`;
document.head.appendChild(loadingStyle);

// 添加点击延迟函数
async function clickWithDelay(element) {
  try {
    // 尝试直接点击
    element.click();
  } catch (error) {
    //console.error('点击选项失败，尝试使用事件分发:', error);
    try {
      // 如果直接点击失败，尝试使用事件分发
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    } catch (dispatchError) {
      //console.error('分发点击事件失败:', dispatchError);
    }
  }
  // 添加点击后的延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
}