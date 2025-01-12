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

// 导出需要的函数到 window 对象
window.showAnswersModal = showAnswersModal;
window.updateAnswerPanel = updateAnswerPanel;
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
      max-width: 90vw;
      min-width: 60vw;
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
        min-width: 100px;
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
        modal.style.maxWidth = '90vw';

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