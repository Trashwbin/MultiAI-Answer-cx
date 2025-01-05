// 格式化答案显示
function formatAnswer(answerText) {
  // 如果内容已经包含HTML标签，说明是完整的回答
  if (/<[^>]*>/.test(answerText)) {
    return answerText
      .replace(/深色版本|浅色版本/g, ':')
      .replace(/复制(?!代码)/g, ':'); // 使用负向前瞻，避免替换"复制代码"按钮的文本
  }

  // 否则按原来的方式处理代码块
  let formattedText = answerText;
  const codeBlockRegex = /```(?:javascript)?\s*([\s\S]*?)```/g;

  // 收集所有代码块
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(answerText)) !== null) {
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
        <div class="code-block" style="
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 16px;
          border-radius: 8px;
          font-family: 'Consolas', monospace;
          margin: 10px 0;
        ">
          <div class="code-header" style="
            padding: 8px;
            border-bottom: 1px solid #333;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <span style="color: #888">JavaScript</span>
            <button onclick="copyCode(this)" style="
              background: transparent;
              border: 1px solid #666;
              color: #888;
              padding: 4px 8px;
              border-radius: 4px;
              cursor: pointer;
            ">复制代码</button>
          </div>
          <div class="code-content" style="
            counter-reset: line;
            white-space: pre;
            overflow-x: auto;
          ">
            ${numberedLines}
          </div>
        </div>
      `;
    }).join('\n\n');

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
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
    `;
    document.head.appendChild(style);
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
  return Object.entries(AI_CONFIG).filter(([_, config]) => config.enabled);
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

// 显示答案模态框
function showAnswersModal() {
  console.log('Showing answers modal');

  const existingModal = document.getElementById('ai-answers-modal');
  if (existingModal) {
    return;
  }

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
  collapseBtn.disabled = true;
  collapseBtn.style.cssText = `
    padding: 6px 12px;
    background: #f0f0f0;
    color: #666;
    border: none;
    border-radius: 4px;
    cursor: not-allowed;
    font-size: 14px;
    transition: all 0.2s;
  `;

  // 自动填写按钮
  autoFillBtn = document.createElement('button');
  autoFillBtn.textContent = '自动填写';
  autoFillBtn.disabled = true;
  autoFillBtn.style.cssText = `
    padding: 6px 12px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: not-allowed;
    font-size: 14px;
    opacity: 0.7;
    transition: all 0.2s;
  `;

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
      modal.remove();
    }
  };

  // 组装按钮组
  rightGroup.appendChild(collapseBtn);
  rightGroup.appendChild(autoFillBtn);
  rightGroup.appendChild(closeBtn);

  titleRow.appendChild(rightGroup);

  // 创建 AI 名称行
  const aiNamesRow = document.createElement('div');
  const enabledAIs = getEnabledAIs();
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

  // 添加 loading 动画样式
  const style = document.createElement('style');
  style.textContent = `
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
  `;
  document.head.appendChild(style);

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
}

// 更新答案面板
function updateAnswerPanel(aiType, answer) {
  console.log('Updating answer panel:', { aiType, answer });

  const container = document.getElementById('answers-container');
  if (!container) {
    console.error('Answers container not found!');
    return;
  }

  const enabledAIs = getEnabledAIs();

  if (answer === 'loading') {
    // 如果是 loading 状态，直接创建或更新该 AI 的答案格子为 loading
    const aiAnswers = container.querySelectorAll(`.ai-answer-${aiType} .answer-content`);
    if (aiAnswers.length === 0) {
      // 如果还没有答案行，创建一个默认行
      const defaultRow = document.createElement('div');
      defaultRow.className = 'question-row-default';
      defaultRow.style.cssText = `
        display: grid;
        grid-template-columns: 60px repeat(${enabledAIs.length}, 1fr) 1fr;
        gap: 20px;
        margin-bottom: 20px;
      `;

      // 添加题号列
      const numberCol = document.createElement('div');
      numberCol.style.cssText = `
        font-weight: bold;
        color: #333;
        padding-top: 10px;
      `;
      defaultRow.appendChild(numberCol);

      // 只为启用的 AI 创建答案列
      enabledAIs.forEach(([type, config]) => {
        const aiCol = document.createElement('div');
        aiCol.className = `ai-answer-${type}`;
        aiCol.style.cssText = `
          background: white;
          border-radius: 8px;
          padding: 15px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        `;

        const answerContent = document.createElement('div');
        answerContent.className = 'answer-content';
        if (type === aiType) {
          answerContent.innerHTML = createLoadingHTML(type);
        }
        aiCol.appendChild(answerContent);
        defaultRow.appendChild(aiCol);
      });

      container.appendChild(defaultRow);
    } else {
      // 更新所有该 AI 的答案格子为 loading
      aiAnswers.forEach(answerCol => {
        answerCol.innerHTML = createLoadingHTML(aiType);
      });
    }
    return;
  }

  // 如果不是 loading 状态，按原来的逻辑处理
  const answers = [];
  const regex = /问题(\d+)答案[:：]([\s\S]*?)(?=问题\d+答案[:：]|$)/g;
  let match;

  while ((match = regex.exec(answer)) !== null) {
    answers.push({
      questionNum: match[1],
      answer: match[2].trim()
    });
  }

  // 如果收到了正式答案，直接删除默认行
  const defaultRow = container.querySelector('.question-row-default');
  if (defaultRow) {
    defaultRow.remove();
  }

  answers.forEach(({ questionNum, answer }) => {
    let questionRow = container.querySelector(`.question-row-${questionNum}`);
    if (!questionRow) {
      questionRow = document.createElement('div');
      questionRow.className = `question-row-${questionNum}`;
      questionRow.style.cssText = `
        display: grid;
        grid-template-columns: 60px repeat(${enabledAIs.length}, 1fr) 1fr;
        gap: 20px;
        margin-bottom: 20px;
      `;

      // 添加题号列
      const numberCol = document.createElement('div');
      numberCol.style.cssText = `
        font-weight: bold;
        color: #333;
        padding-top: 10px;
      `;
      numberCol.textContent = `问题 ${questionNum}`;
      questionRow.appendChild(numberCol);

      // 只为启用的 AI 创建答案列
      enabledAIs.forEach(([type, config]) => {
        const aiCol = document.createElement('div');
        aiCol.className = `ai-answer-${type}`;
        aiCol.style.cssText = `
          background: white;
          border-radius: 8px;
          padding: 15px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        `;

        const answerContent = document.createElement('div');
        answerContent.className = 'answer-content';
        answerContent.style.cssText = `
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 14px;
          line-height: 1.5;
        `;
        // 如果是当前 AI，显示答案；如果是其他 AI 且在 loading 状态，显示 loading
        if (type === aiType) {
          answerContent.innerHTML = formatAnswer(answer);
        } else if (loadingState.status[type]) {
          answerContent.innerHTML = createLoadingHTML(type);
        }
        aiCol.appendChild(answerContent);
        questionRow.appendChild(aiCol);
      });

      // 添加最终答案列
      const finalAnswerCol = document.createElement('div');
      finalAnswerCol.className = 'final-answer';
      finalAnswerCol.style.cssText = `
        background: #f8f9fa;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      `;
      questionRow.appendChild(finalAnswerCol);

      container.appendChild(questionRow);
    } else {
      // 更新对应 AI 的答案
      const answerCol = questionRow.querySelector(`.ai-answer-${aiType} .answer-content`);
      if (answerCol) {
        answerCol.innerHTML = formatAnswer(answer);
      }

      // 更新最终答案
      updateFinalAnswer(questionNum);
    }
  });

  // 检查是否所有答案都已加载完成
  function checkAllAnswersLoaded() {
    const enabledAIs = getEnabledAIs();
    const allQuestionRows = container.querySelectorAll('[class^="question-row-"]');

    for (const row of allQuestionRows) {
      for (const [type, _] of enabledAIs) {
        const answerCol = row.querySelector(`.ai-answer-${type} .answer-content`);
        if (!answerCol || answerCol.querySelector('.ai-loading')) {
          return false; // 还有答案在加载中
        }
      }
    }
    return true; // 所有答案都加载完成
  }

  // 在答案更新后检查是否需要启用按钮
  if (checkAllAnswersLoaded()) {
    enableButtons();
  }
}

// 创建 loading HTML
function createLoadingHTML(aiType) {
  return `
    <div class="ai-loading" style="color: ${AI_CONFIG[aiType].color}">
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
  // 从题号中提取数字
  const num = questionNum.toString().replace(/[^0-9.]/g, '');
  console.log('提取的题号:', num);

  // 在题目列表中查找对应题号的题目
  const questions = extractQuestionsFromXXT();

  // 修改匹配逻辑，处理带点号的题号
  const question = questions.find(q => {
    const qNum = q.number.replace(/[^0-9.]/g, '');
    return qNum === num || qNum === num + '.';
  });

  console.log('当前题目:', question);

  if (!question) {
    console.error('未找到题目:', num);
    return 'other';
  }

  // 根据题型文本判断类型
  const type = question.type.toLowerCase();
  console.log('题目类型:', type);

  // 使用 QUESTION_TYPES 配置来判断题型
  for (const [key, config] of Object.entries(QUESTION_TYPES)) {
    if (config.subtypes.some(subtype =>
      type.includes(subtype.toLowerCase())
    )) {
      console.log('匹配到题型:', key);
      return key;
    }
  }

  return 'other';
}

// 创建可编辑的最终答案
function createEditableFinalAnswer(type, currentAnswer = '', questionNum = '') {
  const container = document.createElement('div');
  container.className = 'editable-final-answer';
  container.style.userSelect = 'text'; // 允许选择文本

  switch (type) {
    case 'choice': // 选择题
      container.innerHTML = `
        <div class="options-group">
          ${['A', 'B', 'C', 'D'].map(opt => `
            <label class="option-item">
              <input type="radio" name="final-choice-${questionNum}" value="${opt}" 
                ${currentAnswer.trim().toUpperCase() === opt ? 'checked' : ''}>
              <span>${opt}</span>
            </label>
          `).join('')}
          <div class="custom-option">
            <input type="text" 
              maxlength="1" 
              placeholder="其他" 
              class="custom-option-input"
              value="${!['A', 'B', 'C', 'D'].includes(currentAnswer.trim().toUpperCase()) ? currentAnswer.trim() : ''}"
              onkeyup="this.value = this.value.toUpperCase()"
              oninput="this.value = this.value.replace(/[^A-Za-z]/g, '')">
          </div>
        </div>
      `;
      container.style.cssText = `
        padding: 10px;
        display: flex;
        gap: 10px;
        user-select: text;
      `;

      // 添加自定义选项的事件处理
      const customInput = container.querySelector('.custom-option-input');
      const radioButtons = container.querySelectorAll('input[type="radio"]');

      customInput.onfocus = () => {
        radioButtons.forEach(radio => radio.checked = false);
      };

      radioButtons.forEach(radio => {
        radio.onchange = () => {
          if (radio.checked) {
            customInput.value = '';
          }
        };
      });
      break;

    case 'blank': // 填空题
      const blanks = currentAnswer.match(/第(\d+)空[:：](.*?)(?=第\d+空|$)/g) || [];
      container.innerHTML = `
        <div class="blanks-group">
          ${blanks.map((blank, index) => {
        const content = blank.match(/第\d+空[:：](.*?)$/)[1].trim();
        return `
              <div class="blank-item">
                <span class="blank-label">第${index + 1}空:</span>
                <input type="text" class="blank-input" value="${content}">
              </div>
            `;
      }).join('')}
        </div>
      `;
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
        user-select: text;
      `;
      break;

    case 'judge': // 判断题
      container.innerHTML = `
        <div class="judge-group">
          <label class="judge-item">
            <input type="radio" name="final-judge" value="√" 
              ${currentAnswer.includes('√') ? 'checked' : ''}>
            <span>√</span>
          </label>
          <label class="judge-item">
            <input type="radio" name="final-judge" value="×" 
              ${currentAnswer.includes('×') ? 'checked' : ''}>
            <span>×</span>
          </label>
        </div>
      `;
      break;

    case 'qa': // 问答题
    case 'calc': // 计算题
      container.innerHTML = `
        <textarea class="answer-textarea" rows="6">${currentAnswer}</textarea>
        <div class="editor-toolbar">
          <button class="format-btn" title="格式化">格式化</button>
          <button class="clear-btn" title="清空">清空</button>
        </div>
      `;
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 8px;
      `;

      // 添加编辑器功能
      const textarea = container.querySelector('.answer-textarea');
      const formatBtn = container.querySelector('.format-btn');
      const clearBtn = container.querySelector('.clear-btn');

      formatBtn.onclick = () => {
        const text = textarea.value;
        // 自动添加序号和换行
        const formatted = text.split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .map((line, i) => line.match(/^\d+\./) ? line : `${i + 1}. ${line}`)
          .join('\n');
        textarea.value = formatted;
      };

      clearBtn.onclick = () => {
        if (confirm('确定要清空答案吗？')) {
          textarea.value = '';
        }
      };
      break;

    default: // 其他题型
      container.innerHTML = `
        <textarea class="answer-textarea" rows="4">${currentAnswer}</textarea>
      `;
      break;
  }

  // 修改通用样式
  const style = document.createElement('style');
  style.textContent = `
    .editable-final-answer {
      background: white;
      border-radius: 4px;
      padding: 8px;
      user-select: text;
    }
    
    .options-group, .judge-group {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .option-item, .judge-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      user-select: text;
    }
    
    .custom-option {
      display: flex;
      align-items: center;
    }
    
    .custom-option-input {
      width: 40px;
      padding: 4px;
      border: 1px solid #ddd;
      border-radius: 4px;
      text-transform: uppercase;
      text-align: center;
    }
    
    .blank-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .blank-label {
      white-space: nowrap;
    }
    
    .blank-input {
      width: 120px;
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    
    .answer-textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      resize: vertical;
      user-select: text;
    }
    
    .editor-toolbar {
      display: flex;
      gap: 8px;
    }
    
    .editor-toolbar button {
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: #f0f0f0;
      cursor: pointer;
    }
    
    .editor-toolbar button:hover {
      background: #e0e0e0;
    }
  `;

  document.head.appendChild(style);
  return container;
} 