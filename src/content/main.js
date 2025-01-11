// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    switch (message.action) {
      case 'showQuestionList':
        // 检查是否在考试页面（通过页面标题和aria-label判断）
        const subNav = document.querySelector('.subNav');
        const isExamPage = subNav?.getAttribute('aria-label')?.includes('考试 页面');

        // 检查是否有整卷预览按钮（通过onclick属性判断）
        const previewBtn = document.querySelector('.completeBtn[onclick*="topreview"]');

        if (isExamPage && previewBtn) {
          const confirmed = window.confirm('需要跳转到整卷预览页面才能查看完整题目，是否跳转？');
          if (confirmed) {
            previewBtn.click();
            sendResponse({ success: true, redirected: true });
          } else {
            sendResponse({ success: false, cancelled: true });
          }
          return true;
        }

        // 显示题目列表
        showPreviewModal();
        sendResponse({ success: true });
        break;

      case 'showAnswers':
        // 显示 AI 答案
        showAnswersModal();
        sendResponse({ success: true });
        break;
    }
  } catch (error) {
    //console.error('处理消息时出错:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true;
});

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
  const modal = document.getElementById('ai-answers-modal');
  if (!modal) return;

  const button = modal.querySelector(`button[data-ai="${aiType}"]`);
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
async function sendToAI(aiType, question = null) {
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

    const prompt = ANSWER_MODES.find(mode => mode.id === 'concise').prompt;
    question = prompt + '\n\n' + questionsText;
  }

  // 确保答案模态框存在并显示 loading
  if (!document.getElementById('ai-answers-modal')) {
    showAnswersModal();
  }
  updateAnswerPanel(aiType, 'loading');
  loadingState.updateUI(aiType, true);

  try {
    // 使用 window.currentRunMode 而不是从 storage 获取
    const runMode = window.currentRunMode || 'stable';
    console.log('当前运行模式:', runMode);

    // 发送消息并等待响应
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'GET_QUESTION',
        aiType: aiType,
        question: question,
        runMode: runMode
      }, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '发送失败');
    }
  } catch (error) {
    console.error('发送失败:', error);
    updateAnswerPanel(aiType, '发送失败，请点击重试按钮重新发送');
    loadingState.updateUI(aiType, false);
  }
}

// 发送到所有AI
function sendToAllAIs() {
  Object.keys(AI_CONFIG).forEach(aiType => {
    if (AI_CONFIG[aiType].enabled) {
      sendToAI(aiType);
    }
  });
}

// 初始化函数
async function initialize() {
  //console.log('开始初始化...');

  // 等待配置和工具加载
  if (!window.QUESTION_TYPES || !window.AI_CONFIG || !window.RUN_MODES) {
    //console.error('配置未加载，等待重试...');
    setTimeout(initialize, 500);
    return;
  }

  try {
    // 从 chrome.storage.local 加载运行模式
    const { runMode = 'stable' } = await chrome.storage.local.get('RUN_MODE');
    window.currentRunMode = runMode;

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      //console.log('题目页面收到消息:', request.type);

      switch (request.type) {
        case 'SHOW_ANSWER':
          //console.log('收到答案:', request.aiType, request.answer);
          // 移除初始的整体 loading
          const initialLoading = document.getElementById('initial-loading');
          if (initialLoading) {
            initialLoading.style.opacity = '0';
            setTimeout(() => {
              initialLoading.remove();
            }, 300);
          }
          // 更新当前 AI 的答案
          updateAnswerPanel(request.aiType, request.answer);
          loadingState.updateUI(request.aiType, false);
          break;
      }
    });

    // 提取题目
    window.extractedQuestions = extractQuestionsFromXXT();
    //console.log('提取的题目:', window.extractedQuestions);

    // 通知background.js题目页面已准备就绪
    chrome.runtime.sendMessage({
      type: 'QUESTION_PAGE_READY'
    });

    //console.log('初始化完成');
  } catch (error) {
    //console.error('初始化失败:', error);
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