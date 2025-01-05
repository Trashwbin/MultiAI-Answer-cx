const loadingState = {
  status: {},
  updateUI(aiType, isLoading) {
    this.status[aiType] = isLoading;
    updateLoadingUI(aiType, isLoading);
  }
};

function updateLoadingUI(aiType, isLoading) {
  const panel = document.querySelector('.ai-panel');
  if (!panel) return;

  const button = panel.querySelector(`button[data-ai="${aiType}"]`);
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.style.opacity = '0.7';
    button.textContent = `${AI_CONFIG[aiType].name} (发送中...)`;
  } else {
    button.disabled = false;
    button.style.opacity = '1';
    button.textContent = `发送到 ${AI_CONFIG[aiType].name}`;
  }
}

function sendToAI(aiType, question = null) {
  // 如果没有传入问题，则获取当前选中的题目
  if (!question) {
    const questions = extractQuestionsFromXXT();
    if (questions.length === 0) {
      alert('未找到题目');
      return;
    }

    // 组装题目文本
    const questionsText = questions.map(q => {
      let text = `${q.number} ${q.type}\n${q.content}`;
      if (q.options.length > 0) {
        text += '\n' + q.options.join('\n');
      }
      if (q.type.includes('填空') && q.blankCount > 0) {
        text += `\n(本题共有 ${q.blankCount} 个空)`;
      }
      return text;
    }).join('\n\n');

    // 使用简洁模式的提示词
    const prompt = ANSWER_MODES.find(mode => mode.id === 'concise').prompt;
    question = prompt + '\n\n' + questionsText;
  }

  // 确保答案模态框存在并显示 loading
  if (!document.getElementById('ai-answers-modal')) {
    showAnswersModal();
  }
  updateAnswerPanel(aiType, 'loading');
  loadingState.updateUI(aiType, true);

  // 发送消息
  chrome.runtime.sendMessage({
    type: 'GET_QUESTION',
    aiType: aiType,
    question: question
  }, response => {
    if (chrome.runtime.lastError) {
      console.error('发送消息失败:', chrome.runtime.lastError);
      updateAnswerPanel(aiType, '发送失败，请点击重试按钮重新发送');
      loadingState.updateUI(aiType, false);
    }
  });
}

function sendToAllAIs() {
  Object.keys(AI_CONFIG).forEach(aiType => {
    sendToAI(aiType);
  });
}

// 创建浮动面板
function createFloatingPanel() {
  const panel = document.createElement('div');
  panel.className = 'ai-panel';
  panel.style.cssText = `
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9999;
  `;

  // 显示题目列表按钮
  const previewButton = document.createElement('button');
  previewButton.textContent = '显示题目列表';
  previewButton.style.cssText = `
    padding: 8px 16px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  `;
  previewButton.onclick = () => {
    // 如果答案模态框存在，先关闭它
    const answersModal = document.getElementById('ai-answers-modal');
    if (answersModal) {
      answersModal.remove();
    }
    showPreviewModal();
  };

  // 显示AI答案按钮
  const showAnswersButton = document.createElement('button');
  showAnswersButton.textContent = '显示AI答案';
  showAnswersButton.style.cssText = `
    padding: 8px 16px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  `;
  showAnswersButton.onclick = () => {
    // 如果题目列表模态框存在，先关闭它
    const previewModal = document.getElementById('questions-preview-modal');
    if (previewModal) {
      previewModal.remove();
    }
    showAnswersModal();
  };

  panel.appendChild(previewButton);
  panel.appendChild(showAnswersButton);

  document.body.appendChild(panel);
}

// 初始化
function init() {
  if (document.querySelector('.questionLi')) {
    createFloatingPanel();
  }
}

window.addEventListener('load', init);

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('main.js 收到消息:', request);
  console.log('sender:', sender);

  if (request.type === 'SHOW_ANSWER') {
    console.log('显示答案:', request.aiType, request.answer);
    try {
      // 确保答案模态框存在
      if (!document.getElementById('ai-answers-modal')) {
        showAnswersModal();
      }

      // 等待模态框创建完成
      setTimeout(() => {
        loadingState.updateUI(request.aiType, false);
        updateAnswerPanel(request.aiType, request.answer);
      }, 100);

    } catch (error) {
      console.error('处理答案时出错:', error);
    }
  }
  return true;
});

// 导出到全局
window.loadingState = loadingState;
window.sendToAI = sendToAI;
window.sendToAllAIs = sendToAllAIs;

// 修改答案面板的标题行，添加重发按钮
function createAIColumn(aiType, config) {
  const aiCol = document.createElement('div');
  aiCol.className = `ai-answer-${aiType}`;
  aiCol.style.cssText = `
    flex: 1;
    background: white;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: bold;
    color: ${config.color};
    font-size: 14px;
  `;
  title.textContent = config.name;

  const retryBtn = document.createElement('button');
  retryBtn.innerHTML = '↻';
  retryBtn.title = '重新发送';
  retryBtn.style.cssText = `
    background: none;
    border: none;
    color: ${config.color};
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
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
    const currentQuestion = document.querySelector('#ai-answers-modal').dataset.currentQuestion;
    if (currentQuestion) {
      sendToAI(aiType, currentQuestion);
    }
  };

  header.appendChild(title);
  header.appendChild(retryBtn);
  aiCol.appendChild(header);

  const answerContent = document.createElement('div');
  answerContent.className = 'answer-content';
  answerContent.style.cssText = `
    white-space: pre-wrap;
    font-family: monospace;
    font-size: 14px;
    line-height: 1.5;
  `;
  aiCol.appendChild(answerContent);

  return aiCol;
} 