// 主入口文件
console.log('题目页面脚本开始加载...');

// 加载状态管理
const loadingState = {
  status: {},
  updateUI(aiType, isLoading) {
    this.status[aiType] = isLoading;
    updateLoadingUI(aiType, isLoading);
  }
};

// 更新加载状态UI
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

// 发送到AI
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

// 发送到所有AI
function sendToAllAIs() {
  Object.keys(AI_CONFIG).forEach(aiType => {
    if (AI_CONFIG[aiType].enabled) {
      sendToAI(aiType);
    }
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

// 初始化函数
async function initialize() {
  console.log('开始初始化...');

  // 等待配置和工具加载
  if (!window.QUESTION_TYPES || !window.AI_CONFIG) {
    console.error('配置未加载，等待重试...');
    setTimeout(initialize, 500);
    return;
  }

  try {
    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('题目页面收到消息:', request.type);

      switch (request.type) {
        case 'SHOW_ANSWER':
          console.log('收到答案:', request.aiType, request.answer);
          updateAnswerPanel(request.aiType, request.answer);
          loadingState.updateUI(request.aiType, false);
          break;
      }
    });

    // 创建浮动面板
    if (document.querySelector('.questionLi')) {
      createFloatingPanel();
    }

    // 通知background.js题目页面已准备就绪
    chrome.runtime.sendMessage({
      type: 'QUESTION_PAGE_READY'
    });

    console.log('初始化完成');
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

// 在页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 导出需要的函数和对象
window.sendToAI = sendToAI;
window.sendToAllAIs = sendToAllAIs;
window.showPreviewModal = showPreviewModal;
window.loadingState = loadingState; 