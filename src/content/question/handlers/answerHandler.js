// 创建答案编辑器
function createAnswerEditor(questionNum, answer = '', type) {
  const handler = QuestionHandlerFactory.getHandler(type, questionNum, answer);
  if (!handler) {
    //console.error('未找到对应的处理器:', type);
    return document.createElement('div');
  }
  return handler.createEditor();
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
    if (!window.aiFullAnswers) {
      window.aiFullAnswers = {};
    }
    window.aiFullAnswers[aiType] = answer;
    // 解析答案
    const answers = [];
    const regex = /问题\s*(\d+)\s*答案[:：]([^问]*?)(?=问题\s*\d+\s*答案[:：]|$)/gs;
    let match;
    let hasStandardFormat = false;

    while ((match = regex.exec(answer)) !== null) {
      hasStandardFormat = true;
      answers.push({
        questionNum: match[1],
        answer: match[2].trim()
      });
    }

    // 如果无法解析出标准格式，则将整个回答放在第一题
    if (!hasStandardFormat) {
      const firstQuestionNum = '1';  // 默认放在第一题
      answers.push({
        questionNum: firstQuestionNum,
        answer: answer.trim()
      });
    }

    // 获取所有题目信息
    const allQuestions = window.selectedQuestions || [];
    const questionNumbers = allQuestions.map(q => q.number.replace(/\./g, ''));

    // 获取启用的 AI 列表
    const enabledAIs = await getEnabledAIs();
    if (!Array.isArray(enabledAIs)) {
      throw new Error('无效的 AI 列表');
    }

    // 确保所有题目都有行
    for (const questionNum of questionNumbers) {
      const questionInfo = getQuestionInfo(questionNum);
      if (!questionInfo) continue;

      // 检查问题行是否存在，如果不存在则创建
      let questionRow = container.querySelector(`.question-row-${questionNum}`);
      if (!questionRow) {
        questionRow = createQuestionRow(questionNum, questionInfo.type, enabledAIs);
        container.appendChild(questionRow);
      }

      // 如果这个题目有答案，更新它
      const answer = answers.find(a => a.questionNum === questionNum);
      if (answer) {
        const answerCol = questionRow.querySelector(`.ai-answer-${aiType} .answer-content`);
        const analysisOverlay = questionRow.querySelector(`.ai-answer-${aiType} .analysis-overlay .analysis-content`);

        if (answerCol && analysisOverlay) {
          if (!hasStandardFormat) {
            // 如果不是标准格式，直接显示完整回答，不显示解析
            answerCol.textContent = answer.answer;
            analysisOverlay.textContent = '';  // 清空解析
          } else {
            // 使用 formatAnswerWithAnalysis 处理答案和解析
            const { answer: formattedAnswer, analysis } = window.formatAnswerWithAnalysis(answer.answer);
            updateAnswerContent(answerCol, formattedAnswer, questionInfo.type);

            // 更新解析内容
            if (analysis) {
              analysisOverlay.textContent = analysis;
            }
          }
        }
      }

      // 更新最终答案
      await updateFinalAnswer(questionNum);
    }
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
  row.className = `question-row-${questionNum} question-row-transition`;

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
  col.className = `ai-answer-${aiType} ai-answer-transition`;
  col.style.cssText = `
    padding: 10px;
    background: ${config.color}10;
    border-radius: 4px;
    min-height: calc(1.5em * 2 + 20px);
    display: flex;
    flex-direction: column;
    border: 1px solid ${config.color}20;
    position: relative;
  `;

  // 添加AI类型标识
  const aiTypeIndicator = document.createElement('div');
  aiTypeIndicator.style.cssText = `
    position: absolute;
    top: 0;
    right: 0;
    background: ${config.color}20;
    color: ${config.color};
    padding: 2px 6px;
    font-size: 12px;
    border-radius: 0 4px 0 4px;
    opacity: 0.8;
  `;
  aiTypeIndicator.textContent = config.name;
  col.appendChild(aiTypeIndicator);

  const content = document.createElement('div');
  content.className = 'answer-content';
  content.style.cssText = `
    white-space: pre-wrap;
    word-break: break-word;
    flex-grow: 1;
    margin-top: 20px;
  `;

  // 添加解析浮层
  const analysisOverlay = document.createElement('div');
  analysisOverlay.className = 'analysis-overlay';
  analysisOverlay.style.cssText = `
    display: none;
    position: absolute;
    top: 0;
    left: calc(99%);
    background: white;
    border: 1px solid ${config.color}40;
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    z-index: 1000;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 100%;
    width: 300px;
    overflow-y: auto;
    font-size: 14px;
    color: #333;
    backdrop-filter: blur(4px);
  `;

  // 添加小箭头
  const arrow = document.createElement('div');
  arrow.style.cssText = `
    position: absolute;
    top: 20px;
    left: -6px;
    width: 12px;
    height: 12px;
    background: white;
    border-left: 1px solid ${config.color}40;
    border-bottom: 1px solid ${config.color}40;
    transform: rotate(45deg);
  `;
  analysisOverlay.appendChild(arrow);

  // 添加解析标题
  const analysisTitle = document.createElement('div');
  analysisTitle.style.cssText = `
    font-weight: bold;
    margin-bottom: 8px;
    color: ${config.color};
    border-bottom: 1px solid ${config.color}20;
    padding-bottom: 4px;
  `;
  analysisTitle.textContent = '解析';
  analysisOverlay.insertBefore(analysisTitle, analysisOverlay.firstChild);

  // 添加解析内容容器
  const analysisContent = document.createElement('div');
  analysisContent.className = 'analysis-content';
  analysisContent.style.cssText = `
    line-height: 1.6;
  `;
  analysisOverlay.appendChild(analysisContent);

  // 添加 hover 事件
  col.addEventListener('mouseenter', () => {
    if (analysisContent.textContent.trim()) {
      analysisOverlay.style.display = 'block';

      // 检查是否超出视口右侧
      const rect = analysisOverlay.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        // 如果超出右侧，则显示在左侧
        analysisOverlay.style.left = 'auto';
        analysisOverlay.style.right = 'calc(99%)';
        arrow.style.left = 'auto';
        arrow.style.right = '-6px';
        arrow.style.borderLeft = 'none';
        arrow.style.borderRight = `1px solid ${config.color}40`;
      }
    }
  });

  col.addEventListener('mouseleave', () => {
    analysisOverlay.style.display = 'none';
    // 重置位置设置
    analysisOverlay.style.left = 'calc(99%)';
    analysisOverlay.style.right = 'auto';
    arrow.style.left = '-6px';
    arrow.style.right = 'auto';
    arrow.style.borderLeft = `1px solid ${config.color}40`;
    arrow.style.borderRight = 'none';
  });

  // 添加 loading 状态
  content.innerHTML = createLoadingHTML(aiType);

  col.appendChild(content);
  col.appendChild(analysisOverlay);
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
    min-width: 200px;
    display: flex;
    flex-direction: column;
    width: 100%;
  `;
  if (type.includes('单选题') || type.includes('判断题') || type.includes('填空题') || type.includes('多选题')) {
    col.style.cssText += `
      justify-content: center;
    `;
  }
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
      showNotification('无效的 AI 列表', 'error');
      return;
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
    console.error('更新最终答案失败:', error);
    showNotification('更新最终答案失败: ' + error.message, 'error');
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

// 修改 showAnswersModal 函数为异步函数
async function showAnswersModal() {
  try {
    //console.log('Showing answers modal');

    // 检查是否已存在模态框
    const existingModal = document.getElementById('ai-answers-modal');
    if (existingModal) {
      existingModal.style.display = 'flex';
      return;
    }

    // 获取启用的 AI 列表
    const enabledAIs = await getEnabledAIs();
    //console.log('启用的 AI:', enabledAIs);

    if (!Array.isArray(enabledAIs) || enabledAIs.length === 0) {
      showNotification('没有启用的 AI', 'error');
      return;
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

    // 添加查看完整回答按钮
    const viewFullAnswerBtn = document.createElement('button');
    viewFullAnswerBtn.id = 'view-full-answer-btn';
    viewFullAnswerBtn.textContent = '查看完整回答';
    viewFullAnswerBtn.style.cssText = `
      padding: 6px 12px;
      background: #673ab7;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    `;

    viewFullAnswerBtn.onmouseover = () => viewFullAnswerBtn.style.background = '#5e35b1';
    viewFullAnswerBtn.onmouseout = () => viewFullAnswerBtn.style.background = '#673ab7';

    // 添加查看完整回答的点击事件
    viewFullAnswerBtn.onclick = () => {
      showFullAnswerModal();
    };

    rightGroup.appendChild(viewFullAnswerBtn);

    // 重发按钮和下拉菜单容器
    const retryContainer = document.createElement('div');
    retryContainer.id = 'retry-container';
    retryContainer.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // 删除AI按钮和下拉菜单容器
    const deleteContainer = document.createElement('div');
    deleteContainer.id = 'delete-container';
    deleteContainer.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // 删除AI按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '删除AI';
    deleteBtn.style.cssText = `
      padding: 6px 12px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 5px;
    `;

    // 添加下拉箭头
    const deleteArrow = document.createElement('span');
    deleteArrow.textContent = '▼';
    deleteArrow.style.fontSize = '10px';
    deleteBtn.appendChild(deleteArrow);

    // 创建删除下拉菜单
    const deleteDropdown = document.createElement('div');
    deleteDropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: none;
      z-index: 1000;
      min-width: 150px;
      margin-top: 5px;
    `;

    // 添加删除按钮事件
    deleteBtn.onmouseover = () => deleteBtn.style.background = '#c82333';
    deleteBtn.onmouseout = () => deleteBtn.style.background = '#dc3545';

    // 删除按钮点击事件处理
    deleteBtn.onclick = async () => {
      const isVisible = deleteDropdown.style.display === 'block';
      deleteDropdown.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        // 获取启用的AI列表并更新下拉菜单
        const enabledAIs = await getEnabledAIs();
        deleteDropdown.innerHTML = ''; // 清空现有选项

        // 如果只有一个AI，显示提示信息
        if (enabledAIs.length <= 1) {
          const message = document.createElement('div');
          message.style.cssText = `
            padding: 8px 12px;
            color: #666;
            font-size: 13px;
            text-align: center;
          `;
          message.textContent = '至少需要保留一个AI';
          deleteDropdown.appendChild(message);
          return;
        }

        enabledAIs.forEach(([type, config]) => {
          const option = document.createElement('div');
          option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #333;
            transition: background 0.2s;
          `;

          // 创建颜色标记
          const colorDot = document.createElement('span');
          colorDot.style.cssText = `
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${config.color};
            display: inline-block;
          `;

          option.appendChild(colorDot);
          option.appendChild(document.createTextNode(config.name));

          option.onmouseover = () => option.style.background = '#f5f5f5';
          option.onmouseout = () => option.style.background = 'white';

          option.onclick = async () => {
            try {
              // 检查是否是权重AI
              if (config.weight === 2) {
                showNotification('不能删除权重为2的AI，请先修改权重再删除', 'warning');
                return;
              }

              // 获取所有启用的AI
              const currentEnabledAIs = await getEnabledAIs();
              if (currentEnabledAIs.length <= 1) {
                showNotification('至少需要保留一个AI', 'warning');
                return;
              }

              // 删除对应的AI列
              const modal = document.getElementById('ai-answers-modal');
              const aiColumns = modal.querySelectorAll(`.ai-answer-${type}`);
              aiColumns.forEach(col => col.remove());

              // 更新AI配置
              window.AI_CONFIG[type].enabled = false;

              // 更新网格布局
              const remainingAIs = await getEnabledAIs();
              const aiNamesRow = modal.querySelector('div[style*="grid-template-columns"]');
              const allQuestionRows = modal.querySelectorAll('[class^="question-row-"]');

              // 更新网格布局
              if (remainingAIs.length > 6) {
                const newGridTemplate = `200px repeat(1, 1fr) 200px`;
                aiNamesRow.style.gridTemplateColumns = newGridTemplate;
              } else {
                const newGridTemplate = `200px repeat(${remainingAIs.length}, 1fr) 1fr`;
                aiNamesRow.style.gridTemplateColumns = newGridTemplate;

                const aiNameCells = aiNamesRow.children;
                // 保留第一个（题目）和最后一个（最终答案）单元格
                const firstCell = aiNameCells[0];
                const lastCell = aiNameCells[aiNameCells.length - 1];
                aiNamesRow.innerHTML = '';
                aiNamesRow.appendChild(firstCell);

                // 重新创建AI名称列
                for (const [aiType, aiConfig] of remainingAIs) {
                  const aiName = document.createElement('div');
                  aiName.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: bold;
                    color: ${aiConfig.color};
                    font-size: 16px;
                    text-align: center;
                    padding: 10px;
                    min-width: 100px;
                    border-bottom: 3px solid ${aiConfig.color};
                  `;

                  // AI 名称
                  const nameSpan = document.createElement('span');
                  nameSpan.textContent = aiConfig.name;

                  // 重发按钮
                  const retryBtn = document.createElement('button');
                  retryBtn.innerHTML = '↻';
                  retryBtn.title = '重新发送';
                  retryBtn.style.cssText = `
                    background: none;
                    border: none;
                    color: ${aiConfig.color};
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
                      const currentQuestion = modal.dataset.currentQuestion;
                      if (!currentQuestion) return;
                      await updateAnswerPanel(aiType, 'loading');
                      await sendToAI(aiType, currentQuestion);
                      chrome.runtime.sendMessage({
                        type: 'SWITCH_TAB',
                        aiType: aiType
                      });
                    } catch (error) {
                      //console.error('重发请求失败:', error);
                    }
                  };

                  aiName.appendChild(nameSpan);
                  aiName.appendChild(retryBtn);
                  aiNamesRow.appendChild(aiName);
                }
                aiNamesRow.appendChild(lastCell);

              }
              const newGridTemplate = `200px repeat(${remainingAIs.length}, 1fr) 1fr`;
              allQuestionRows.forEach(row => {
                row.style.gridTemplateColumns = newGridTemplate;
              });
              // 更新AI名称行

              // 更新所有下拉菜单
              const updateDropdownMenu = async (dropdown, type) => {
                dropdown.innerHTML = '';
                if (remainingAIs.length <= 1) {
                  const message = document.createElement('div');
                  message.style.cssText = `
                    padding: 8px 12px;
                    color: #666;
                    font-size: 13px;
                    text-align: center;
                  `;
                  message.textContent = '至少需要保留一个AI';
                  dropdown.appendChild(message);
                } else {
                  remainingAIs.forEach(([aiType, aiConfig]) => {
                    const option = document.createElement('div');
                    option.style.cssText = `
                      padding: 8px 12px;
                      cursor: pointer;
                      display: flex;
                      align-items: center;
                      gap: 8px;
                      color: #333;
                      transition: background 0.2s;
                      ${type === 'weight' && aiConfig.weight === 2 ? 'background: #f3e5f5;' : ''}
                    `;

                    const colorDot = document.createElement('span');
                    colorDot.style.cssText = `
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background: ${aiConfig.color};
                      display: inline-block;
                    `;

                    if (type === 'weight') {
                      const nameSpan = document.createElement('span');
                      nameSpan.textContent = aiConfig.name;
                      nameSpan.style.flex = '1';

                      const weightSpan = document.createElement('span');
                      weightSpan.textContent = `权重: ${aiConfig.weight}`;
                      weightSpan.style.fontSize = '12px';
                      weightSpan.style.color = '#666';

                      option.appendChild(colorDot);
                      option.appendChild(nameSpan);
                      option.appendChild(weightSpan);
                    } else {
                      option.appendChild(colorDot);
                      option.appendChild(document.createTextNode(aiConfig.name));
                    }

                    option.onmouseover = () => option.style.background = type === 'weight' && aiConfig.weight === 2 ? '#ede7f6' : '#f5f5f5';
                    option.onmouseout = () => option.style.background = type === 'weight' && aiConfig.weight === 2 ? '#f3e5f5' : 'white';

                    dropdown.appendChild(option);
                  });
                }
              };

              // 更新所有下拉菜单
              await updateDropdownMenu(deleteDropdown, 'delete');
              await updateDropdownMenu(weightDropdown, 'weight');
              await updateDropdownMenu(dropdown, 'retry');

              // 关闭下拉菜单
              deleteDropdown.style.display = 'none';

              // 更新最终答案
              const answersContainer = document.getElementById('answers-container');
              const questionRows = answersContainer.querySelectorAll('[class^="question-row-"]');
              for (const row of questionRows) {
                const questionNum = row.className.match(/question-row-(\d+)/)[1];
                await updateFinalAnswer(questionNum);
              }
            } catch (error) {
              //console.error('删除AI失败:', error);
            }
          };

          deleteDropdown.appendChild(option);
        });
      }
    };

    // 点击其他地方关闭删除下拉菜单
    document.addEventListener('click', (e) => {
      if (!deleteContainer.contains(e.target)) {
        deleteDropdown.style.display = 'none';
      }
    });

    // 组装删除按钮和下拉菜单
    deleteContainer.appendChild(deleteBtn);
    deleteContainer.appendChild(deleteDropdown);
    rightGroup.appendChild(deleteContainer);

    // 权重选择按钮和下拉菜单容器
    const weightContainer = document.createElement('div');
    weightContainer.id = 'weight-container';
    weightContainer.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // 权重选择按钮
    const weightBtn = document.createElement('button');
    // 获取当前权重为2的AI
    const getCurrentWeightAI = () => {
      for (const [type, config] of Object.entries(window.AI_CONFIG)) {
        if (config.enabled && config.weight === 2) {
          return config.name;
        }
      }
      return '无';
    };
    weightBtn.textContent = `当前权重AI: ${getCurrentWeightAI()}`;
    weightBtn.style.cssText = `
      padding: 6px 12px;
      background: #9c27b0;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 5px;
    `;

    // 添加下拉箭头
    const weightArrow = document.createElement('span');
    weightArrow.textContent = '▼';
    weightArrow.style.fontSize = '10px';
    weightBtn.appendChild(weightArrow);

    // 创建权重下拉菜单
    const weightDropdown = document.createElement('div');
    weightDropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: none;
      z-index: 1000;
      min-width: 150px;
      margin-top: 5px;
    `;

    // 添加权重按钮事件
    weightBtn.onmouseover = () => weightBtn.style.background = '#7b1fa2';
    weightBtn.onmouseout = () => weightBtn.style.background = '#9c27b0';

    // 权重按钮点击事件处理
    weightBtn.onclick = async () => {
      const isVisible = weightDropdown.style.display === 'block';
      weightDropdown.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        // 获取启用的AI列表并更新下拉菜单
        const enabledAIs = await getEnabledAIs();
        weightDropdown.innerHTML = ''; // 清空现有选项

        enabledAIs.forEach(([type, config]) => {
          const option = document.createElement('div');
          option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #333;
            transition: background 0.2s;
            ${config.weight === 2 ? 'background: #f3e5f5;' : ''}
          `;

          // 创建颜色标记
          const colorDot = document.createElement('span');
          colorDot.style.cssText = `
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${config.color};
            display: inline-block;
          `;

          // 创建名称和权重显示
          const nameSpan = document.createElement('span');
          nameSpan.textContent = config.name;
          nameSpan.style.flex = '1';

          const weightSpan = document.createElement('span');
          weightSpan.textContent = `权重: ${config.weight}`;
          weightSpan.style.fontSize = '12px';
          weightSpan.style.color = '#666';

          option.appendChild(colorDot);
          option.appendChild(nameSpan);
          option.appendChild(weightSpan);

          option.onmouseover = () => option.style.background = config.weight === 2 ? '#ede7f6' : '#f5f5f5';
          option.onmouseout = () => option.style.background = config.weight === 2 ? '#f3e5f5' : 'white';

          option.onclick = async () => {
            try {
              // 重置所有AI权重为1
              Object.values(window.AI_CONFIG).forEach(cfg => {
                cfg.weight = 1;
              });

              // 设置选中的AI权重为2
              window.AI_CONFIG[type].weight = 2;

              // 更新按钮文本
              weightBtn.textContent = `当前权重AI: ${config.name}`;
              weightBtn.appendChild(weightArrow);

              // 关闭下拉菜单
              weightDropdown.style.display = 'none';

              // 更新最终答案
              const answersContainer = document.getElementById('answers-container');
              const questionRows = answersContainer.querySelectorAll('[class^="question-row-"]');
              for (const row of questionRows) {
                const questionNum = row.className.match(/question-row-(\d+)/)[1];
                await updateFinalAnswer(questionNum);
              }
            } catch (error) {
              //console.error('设置权重失败:', error);
            }
          };

          weightDropdown.appendChild(option);
        });
      }
    };

    // 点击其他地方关闭权重下拉菜单
    document.addEventListener('click', (e) => {
      if (!weightContainer.contains(e.target)) {
        weightDropdown.style.display = 'none';
      }
    });

    // 组装权重按钮和下拉菜单
    weightContainer.appendChild(weightBtn);
    weightContainer.appendChild(weightDropdown);
    rightGroup.appendChild(weightContainer);

    // 重发大按钮
    const retryBtn = document.createElement('button');
    retryBtn.textContent = '重发问题';
    retryBtn.style.cssText = `
      padding: 6px 12px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 5px;
    `;

    // 添加下拉箭头
    const arrow = document.createElement('span');
    arrow.textContent = '▼';
    arrow.style.fontSize = '10px';
    retryBtn.appendChild(arrow);

    // 创建下拉菜单
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: none;
      z-index: 1000;
      min-width: 150px;
      margin-top: 5px;
    `;

    // 添加按钮事件
    retryBtn.onmouseover = () => retryBtn.style.background = '#1976D2';
    retryBtn.onmouseout = () => retryBtn.style.background = '#2196F3';

    // 点击事件处理
    retryBtn.onclick = async () => {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';

      if (!isVisible) {
        // 获取启用的AI列表并更新下拉菜单
        const enabledAIs = await getEnabledAIs();
        dropdown.innerHTML = ''; // 清空现有选项

        enabledAIs.forEach(([type, config]) => {
          const option = document.createElement('div');
          option.style.cssText = `
            padding: 8px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            color: #333;
            transition: background 0.2s;
          `;

          // 创建颜色标记
          const colorDot = document.createElement('span');
          colorDot.style.cssText = `
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: ${config.color};
            display: inline-block;
          `;

          option.appendChild(colorDot);
          option.appendChild(document.createTextNode(config.name));

          option.onmouseover = () => option.style.background = '#f5f5f5';
          option.onmouseout = () => option.style.background = 'white';

          option.onclick = async () => {
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

              // 关闭下拉菜单
              dropdown.style.display = 'none';
            } catch (error) {
              //console.error('重发请求失败:', error);
            }
          };

          dropdown.appendChild(option);
        });
      }
    };

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!retryContainer.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });

    // 组装重发按钮和下拉菜单
    retryContainer.appendChild(retryBtn);
    retryContainer.appendChild(dropdown);
    rightGroup.appendChild(retryContainer);

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
        // 添加淡出动画
        modal.style.transition = 'opacity 0.3s ease';
        modal.style.opacity = '0';

        // 等待动画完成后隐藏
        setTimeout(() => {
          modal.style.display = 'none';
          // 重置透明度,以便下次打开
          modal.style.opacity = '1';
        }, 300);
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

    if (enabledAIs.length > 6) {
      aiNamesRow.style.gridTemplateColumns = `200px repeat(1, 1fr) 200px`;
      // 添加回答对比标题占据ai全部列
      const aiNames = document.createElement('div');
      aiNames.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        font-weight: bold;
        color: #E06C75;
        font-size: 16px;
        text-align: center;
        padding: 10px;
        min-width: 100px;
        border-bottom: 3px solid #E06C75;
        `;
      aiNames.textContent = '回答对比';
      aiNamesRow.appendChild(aiNames);
    } else {
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

    // 移除全局loading，改为每个AI独立显示loading状态



    modal.appendChild(header);
    modal.appendChild(answersContainer);

    document.body.appendChild(modal);

    // 立即创建所有题目行并显示AI独立loading状态
    if (window.selectedQuestions) {
      const questionNumbers = window.selectedQuestions.map(q => q.number.replace(/\./g, ''));

      for (const questionNum of questionNumbers) {
        const questionInfo = getQuestionInfo(questionNum);
        if (!questionInfo) continue;

        // 创建题目行
        const questionRow = createQuestionRow(questionNum, questionInfo.type, enabledAIs);
        answersContainer.appendChild(questionRow);
      }

      // 确保所有AI列都显示loading状态（createAIAnswerColumn已经默认设置了loading）
      setTimeout(() => {
        enabledAIs.forEach(([aiType]) => {
          const aiAnswers = answersContainer.querySelectorAll(`.ai-answer-${aiType} .answer-content`);
          aiAnswers.forEach(answerCol => {
            if (!answerCol.innerHTML.includes('ai-loading')) {
              answerCol.innerHTML = createLoadingHTML(aiType);
            }
          });
        });
      }, 100);
    }

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

      // 获取三个主要按钮容器
      const retryContainer = document.getElementById('retry-container');
      const deleteContainer = document.getElementById('delete-container');
      const weightContainer = document.getElementById('weight-container');
      const viewFullAnswerBtn = document.getElementById('view-full-answer-btn');

      // 添加过渡动画
      modal.style.transition = 'width 0.3s ease, max-width 0.3s ease';
      aiNamesRow.style.transition = 'grid-template-columns 0.3s ease';
      allQuestionRows.forEach(row => {
        row.style.transition = 'grid-template-columns 0.3s ease';
      });

      if (isCollapsed) {
        // 展开状态
        modal.style.width = '90%';
        modal.style.maxWidth = '90vw';

        // 显示三个主要按钮，添加淡入动画
        [retryContainer, deleteContainer, weightContainer, viewFullAnswerBtn].forEach(btn => {
          if (btn) {
            btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            btn.style.display = 'inline-block';
            requestAnimationFrame(() => {
              btn.style.opacity = '1';
              btn.style.transform = 'translateX(0)';
            });
          }
        });

        // 恢复 AI 名称行的列数
        const enabledAIs = await getEnabledAIs();
        if (enabledAIs.length > 6) {
          aiNamesRow.style.gridTemplateColumns = `200px repeat(1, 1fr) 200px`;
        } else {
          aiNamesRow.style.gridTemplateColumns = `200px repeat(${enabledAIs.length}, 1fr) 1fr`;
        }

        // 显示所有 AI 答案列
        allQuestionRows.forEach(row => {
          row.style.gridTemplateColumns = `200px repeat(${enabledAIs.length}, 1fr) 1fr`;
          const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
          aiCols.forEach(col => {
            col.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            col.style.display = 'block';

            requestAnimationFrame(() => {
              col.style.opacity = '1';
              col.style.transform = 'translateX(0)';
            });
          });
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
        // 先执行动画，再隐藏元素
        [retryContainer, deleteContainer, weightContainer, viewFullAnswerBtn].forEach(btn => {
          if (btn) {
            btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            btn.style.opacity = '0';
            btn.style.transform = 'translateX(-20px)';
          }
        });

        allQuestionRows.forEach(row => {
          const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
          aiCols.forEach(col => {
            col.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            col.style.opacity = '0';
            col.style.transform = 'translateX(-20px)';
          });
        });

        // 等待动画完成后再改变布局
        setTimeout(() => {
          modal.style.width = '500px';
          modal.style.maxWidth = '500px';

          // 隐藏按钮
          [retryContainer, deleteContainer, weightContainer, viewFullAnswerBtn].forEach(btn => {
            if (btn) btn.style.display = 'none';
          });

          // 修改 AI 名称行的列数
          aiNamesRow.style.gridTemplateColumns = '200px 1fr';
          // 隐藏 AI 名称
          const aiNames = aiNamesRow.querySelectorAll('div');
          aiNames.forEach((div, index) => {
            if (index > 0 && index < aiNames.length - 1) {
              div.style.display = 'none';
            }
          });
          // 隐藏 AI 答案列
          allQuestionRows.forEach(row => {
            row.style.gridTemplateColumns = '200px 1fr';
            const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
            aiCols.forEach(col => col.style.display = 'none');
          });
        }, 300);
      }
    };

    // 在 showAnswersModal 函数中修改自动填写按钮的事件处理
    autoFillBtn.onclick = async () => {
      const modal = document.getElementById('ai-answers-modal');
      const container = document.getElementById('answers-container');
      const aiNamesRow = modal.querySelector('div[style*="grid-template-columns"]');
      const allQuestionRows = container.querySelectorAll('[class^="question-row-"]');

      // 更新收起按钮文本
      collapseBtn.textContent = '展开AI回答';

      // 获取三个主要按钮容器
      const retryContainer = document.getElementById('retry-container');
      const deleteContainer = document.getElementById('delete-container');
      const weightContainer = document.getElementById('weight-container');
      const viewFullAnswerBtn = document.getElementById('view-full-answer-btn');

      // 添加过渡动画
      modal.style.transition = 'all 0.3s ease';
      aiNamesRow.style.transition = 'all 0.3s ease';
      allQuestionRows.forEach(row => {
        row.style.transition = 'all 0.3s ease';
      });

      // 先执行动画
      [retryContainer, deleteContainer, weightContainer, viewFullAnswerBtn].forEach(btn => {
        if (btn) {
          btn.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          btn.style.opacity = '0';
          btn.style.transform = 'translateX(-20px)';
        }
      });

      allQuestionRows.forEach(row => {
        const aiCols = row.querySelectorAll('[class^="ai-answer-"]');
        aiCols.forEach(col => {
          col.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          col.style.opacity = '0';
          col.style.transform = 'translateX(-20px)';
        });
      });

      // 等待动画完成后再改变布局
      setTimeout(() => {
        // 收起状态
        modal.style.width = '500px';
        modal.style.maxWidth = '500px';
        modal.style.left = 'auto';
        modal.style.right = '20px';
        modal.style.transform = 'translateY(-50%)';

        // 隐藏按钮
        [retryContainer, deleteContainer, weightContainer, viewFullAnswerBtn].forEach(btn => {
          if (btn) btn.style.display = 'none';
        });

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
        autoFillAnswers();
      }, 300);
    };

  } catch (error) {
    console.error('显示答案模态框失败:', error);
    showNotification('显示答案模态框失败: ' + error.message, 'error');
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

  /* 添加新的动画样式 */
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes bounceIn {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    50% {
      opacity: 0.9;
      transform: scale(1.1);
    }
    80% {
      opacity: 1;
      transform: scale(0.9);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* 应用动画到相应元素 */
  #ai-answers-modal {
    animation: fadeIn 0.3s ease-out;
  }

  .question-row {
    animation: slideIn 0.3s ease-out;
  }

  .ai-answer {
    animation: scaleIn 0.3s ease-out;
  }

  .final-answer {
    animation: scaleIn 0.3s ease-out;
  }

  .analysis-overlay {
    animation: fadeIn 0.2s ease-out;
  }

  /* 按钮悬停动画 */
  button {
    transition: all 0.2s ease !important;
  }

  button:active {
    transform: scale(0.95) !important;
  }

  /* 下拉菜单动画 */
  #retry-container > div,
  #delete-container > div,
  #weight-container > div {
    animation: scaleIn 0.2s ease-out;
  }

  /* 模态框内容动画 */
  #ai-answers-modal > div {
    animation: slideIn 0.3s ease-out;
  }

  /* AI 答案切换动画 */
  .ai-answer-editor {
    transition: opacity 0.3s ease-out, transform 0.3s ease-out;
  }

  /* 错误消息动画 */
  .error-message {
    animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
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
    animation: fadeIn 0.3s ease-out !important;
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
    animation: slideIn 0.3s ease-out !important;
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

  /* 添加展开/收起动画 */
  .question-row-transition {
    transition: all 0.3s ease-out !important;
  }

  .ai-answer-transition {
    transition: all 0.3s ease-out !important;
  }

  /* 添加按钮点击波纹效果 */
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }

  button {
    position: relative;
    overflow: hidden;
  }

  button::after {
    content: '';
    display: block;
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, #fff 10%, transparent 10.01%);
    background-repeat: no-repeat;
    background-position: 50%;
    transform: scale(10, 10);
    opacity: 0;
    transition: transform .5s, opacity 1s;
  }

  button:active::after {
    transform: scale(0, 0);
    opacity: .3;
    transition: 0s;
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

// 添加显示完整回答模态框的函数
function showFullAnswerModal() {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10002;
    opacity: 0;
    transition: background 0.3s ease, opacity 0.3s ease;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    width: 80%;
    height: 80%;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    padding: 20px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    transform: scale(0.95);
    opacity: 0;
    transition: transform 0.3s ease, opacity 0.3s ease;
  `;

  // 添加到DOM后触发动画
  requestAnimationFrame(() => {
    modal.style.background = 'rgba(0, 0, 0, 0.5)';
    modal.style.opacity = '1';
    content.style.transform = 'scale(1)';
    content.style.opacity = '1';
  });

  // 创建头部
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  `;

  const titleContainer = document.createElement('div');
  titleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 15px;
  `;

  const title = document.createElement('h3');
  title.textContent = 'AI完整回答';
  title.style.cssText = `
    margin: 0;
    font-size: 18px;
    color: #333;
  `;

  // 创建AI选择下拉框
  const aiSelect = document.createElement('select');
  aiSelect.style.cssText = `
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    color: #333;
    background: #f8f9fa;
    cursor: pointer;
    outline: none;
  `;

  // 获取所有启用的AI
  const enabledAIs = Object.entries(window.AI_CONFIG).filter(([_, config]) => config.enabled);
  enabledAIs.forEach(([aiType, config]) => {
    const option = document.createElement('option');
    option.value = aiType;
    option.textContent = config.name;
    option.style.color = config.color;
    aiSelect.appendChild(option);
  });

  titleContainer.appendChild(title);
  titleContainer.appendChild(aiSelect);

  // 创建按钮组
  const buttonGroup = document.createElement('div');
  buttonGroup.style.cssText = `
    display: flex;
    gap: 10px;
  `;

  // 保存按钮
  const saveBtn = document.createElement('button');
  saveBtn.textContent = '保存并重新解析';
  saveBtn.style.cssText = `
    padding: 6px 12px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  saveBtn.onmouseover = () => saveBtn.style.background = '#45a049';
  saveBtn.onmouseout = () => saveBtn.style.background = '#4caf50';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = `
    padding: 6px 12px;
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.background = '#555';
  closeBtn.onmouseout = () => closeBtn.style.background = '#666';

  buttonGroup.appendChild(saveBtn);
  buttonGroup.appendChild(closeBtn);

  header.appendChild(titleContainer);
  header.appendChild(buttonGroup);

  // 创建内容区域
  const answersContainer = document.createElement('div');
  answersContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  `;

  // 创建编辑区域
  function createAnswerEditor(aiType, config) {
    const aiAnswer = document.createElement('div');
    aiAnswer.className = `ai-answer-editor-${aiType}`;
    aiAnswer.style.cssText = `
      display: none;
      height: 100%;
    `;

    const textarea = document.createElement('textarea');
    textarea.className = `ai-answer-${aiType}-full`;
    textarea.value = window.aiFullAnswers?.[aiType] || '';
    textarea.style.cssText = `
      width: 100%;
      height: 100%;
      padding: 15px;
      border: 1px solid ${config.color}20;
      border-radius: 8px;
      resize: none;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.5;
      background: ${config.color}05;
      outline: none;
      transition: border-color 0.2s;
    `;

    textarea.onfocus = () => {
      textarea.style.borderColor = `${config.color}50`;
    };

    textarea.onblur = () => {
      textarea.style.borderColor = `${config.color}20`;
    };

    aiAnswer.appendChild(textarea);
    return aiAnswer;
  }

  // 为每个AI创建编辑区域
  enabledAIs.forEach(([aiType, config]) => {
    const editor = createAnswerEditor(aiType, config);
    answersContainer.appendChild(editor);
  });

  // 显示第一个AI的编辑器
  if (enabledAIs.length > 0) {
    const firstAIType = enabledAIs[0][0];
    const firstEditor = answersContainer.querySelector(`.ai-answer-editor-${firstAIType}`);
    if (firstEditor) {
      firstEditor.style.display = 'block';
    }
  }

  // 下拉框切换事件
  aiSelect.onchange = () => {
    // 隐藏所有编辑器
    enabledAIs.forEach(([aiType]) => {
      const editor = answersContainer.querySelector(`.ai-answer-editor-${aiType}`);
      if (editor) {
        editor.style.display = 'none';
      }
    });

    // 显示选中的AI编辑器
    const selectedEditor = answersContainer.querySelector(`.ai-answer-editor-${aiSelect.value}`);
    if (selectedEditor) {
      selectedEditor.style.display = 'block';
    }
  };

  // 保存按钮点击事件
  saveBtn.onclick = async () => {
    try {
      // 保存所有编辑后的完整回答
      const newAnswers = {};
      enabledAIs.forEach(([aiType]) => {
        const textarea = document.querySelector(`.ai-answer-${aiType}-full`);
        if (textarea) {
          newAnswers[aiType] = textarea.value;
        }
      });

      // 更新全局存储
      window.aiFullAnswers = newAnswers;

      // 重新解析所有答案
      for (const [aiType, answer] of Object.entries(newAnswers)) {
        await updateAnswerPanel(aiType, answer);
      }

      // 关闭模态框
      modal.remove();
    } catch (error) {
      console.error('保存并重新解析答案时出错:', error);
      showNotification('保存失败: ' + error.message, 'error');
    }
  };

  // 关闭按钮点击事件
  closeBtn.onclick = () => {
    modal.style.background = 'rgba(0, 0, 0, 0)';
    modal.style.opacity = '0';
    content.style.transform = 'scale(0.95)';
    content.style.opacity = '0';
    setTimeout(() => modal.remove(), 300);
  };

  content.appendChild(header);
  content.appendChild(answersContainer);
  modal.appendChild(content);
  document.body.appendChild(modal);
}

