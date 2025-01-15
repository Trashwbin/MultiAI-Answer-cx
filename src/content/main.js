// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    switch (message.action) {
      case 'toggleExtension':
        // 切换插件总开关
        window.extensionEnabled = message.enabled;
        // 重新加载页面以应用更改
        window.location.reload();
        sendResponse({ success: true });
        break;

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

      case 'togglePasteLimit':
        // 切换粘贴限制
        if (message.enabled !== window.pasteLimitDisabled) {
          window.pasteLimitDisabled = message.enabled;
          // 重新加载页面以应用更改
          window.location.reload();
        }
        sendResponse({ success: true });
        break;

      case 'toggleCopyBtn':
        // 切换复制按钮
        if (message.enabled !== window.copyBtnEnabled) {
          window.copyBtnEnabled = message.enabled;
          // 重新加载页面以应用更改
          window.location.reload();
        }
        sendResponse({ success: true });
        break;

      case 'toggleTextSelect':
        // 切换文本选择限制
        if (message.enabled !== window.textSelectEnabled) {
          window.textSelectEnabled = message.enabled;
          // 重新加载页面以应用更改
          window.location.reload();
        }
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
  try {
    if (!question) {
      const selectedQuestions = window.selectedQuestions;
      if (!selectedQuestions || selectedQuestions.length === 0) {
        showNotification('未找到选中的题目', 'warning');
        return;
      }

      // 组装题目文本
      const questionsText = selectedQuestions.map(q => {
        let text = `${q.number} ${q.type}\n${q.content}`;
        if (q.options.length > 0) {
          text += '\n' + q.options.join('\n');
        }
        if (q.type.includes('填空') && q.blankCount > 0) {
          text += `\n(本题共有 ${q.blankCount} 个空)`;
        }
        return text;
      }).join('\n\n');

      // 从 storage 获取保存的提示词
      const result = await chrome.storage.local.get(['ANSWER_MODE']);
      const prompt = result.ANSWER_MODE || window.ANSWER_MODES.find(mode => mode.id === 'concise').prompt;

      question = prompt + '\n\n' + questionsText;
    }

    // 确保答案模态框存在并显示 loading
    if (!document.getElementById('ai-answers-modal')) {
      showAnswersModal();
    }
    updateAnswerPanel(aiType, 'loading');
    loadingState.updateUI(aiType, true);

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
async function sendToAllAIs() {
  try {
    const selectedQuestions = window.selectedQuestions;
    if (!selectedQuestions || selectedQuestions.length === 0) {
      showNotification('未找到选中的题目', 'warning');
      return;
    }

    // 组装题目文本
    const questionsText = selectedQuestions.map(q => {
      let text = `${q.number} ${q.type}\n${q.content}`;
      if (q.options.length > 0) {
        text += '\n' + q.options.join('\n');
      }
      if (q.type.includes('填空') && q.blankCount > 0) {
        text += `\n(本题共有 ${q.blankCount} 个空)`;
      }
      return text;
    }).join('\n\n');

    // 从 storage 获取保存的提示词
    const result = await chrome.storage.local.get(['ANSWER_MODE']);
    const prompt = result.ANSWER_MODE || window.ANSWER_MODES.find(mode => mode.id === 'concise').prompt;

    const question = prompt + '\n\n' + questionsText;

    // 确保答案模态框存在
    if (!document.getElementById('ai-answers-modal')) {
      showAnswersModal();
    }

    // 获取所有启用的 AI
    const enabledAIs = Object.entries(AI_CONFIG)
      .filter(([_, config]) => config.enabled)
      .map(([aiType]) => aiType);

    if (enabledAIs.length === 0) {
      showNotification('请至少启用一个 AI', 'warning');
      return;
    }

    // 为所有启用的 AI 显示 loading 状态
    enabledAIs.forEach(aiType => {
      updateAnswerPanel(aiType, 'loading');
      loadingState.updateUI(aiType, true);
    });

    // 使用 window.currentRunMode 而不是从 storage 获取
    const runMode = window.currentRunMode || 'stable';
    console.log('当前运行模式:', runMode);

    // 一次性发送所有 AI 的请求
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'GET_QUESTIONS',
        aiList: enabledAIs,
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
    enabledAIs.forEach(aiType => {
      updateAnswerPanel(aiType, '发送失败，请点击重试按钮重新发送');
      loadingState.updateUI(aiType, false);
    });
  }
}

// 移除粘贴限制
function removePasteRestriction() {
  // 创建一个 MutationObserver 来监听 DOM 变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach((node) => {
          // 检查新添加的节点是否包含编辑器
          if (node.nodeType === 1) {
            const iframes = node.querySelectorAll('iframe');
            iframes.forEach(handleEditorIframe);
          }
        });
      }
    });
  });

  // 开始观察 DOM 变化
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 处理已存在的编辑器
  document.querySelectorAll('iframe').forEach(handleEditorIframe);
}

// 处理编辑器 iframe
function handleEditorIframe(iframe) {
  try {
    // 等待 iframe 加载完成
    if (iframe.contentDocument) {
      enablePaste(iframe.contentDocument);
    } else {
      iframe.addEventListener('load', () => {
        enablePaste(iframe.contentDocument);
      });
    }
  } catch (error) {
    // 忽略跨域错误
    console.error('处理iframe时出错:', error);
  }
}

// 启用粘贴功能
function enablePaste(doc) {
  if (!doc) return;

  // 移除所有粘贴相关的事件监听器
  const body = doc.body || doc.documentElement;
  if (!body) return;

  // 创建一个新的粘贴事件处理函数
  function handlePaste(e) {
    e.stopImmediatePropagation();
    return true;
  }

  // 添加事件捕获
  body.addEventListener('paste', handlePaste, true);

  // 移除可能存在的粘贴限制属性
  body.setAttribute('contenteditable', 'true');
  body.setAttribute('style', (body.getAttribute('style') || '') + '; user-select: text !important; -webkit-user-select: text !important;');

  // 覆盖可能存在的禁止粘贴函数
  if (doc.defaultView) {
    doc.defaultView.onpaste = null;
    doc.defaultView.addEventListener('paste', handlePaste, true);
  }
}

// 移除文本选择限制
function removeSelectRestriction() {
  // 添加全局样式
  const style = document.createElement('style');
  style.id = 'remove-select-restriction-style';
  style.textContent = `
    * {
      user-select: text !important;
      -webkit-user-select: text !important;
      -moz-user-select: text !important;
      -ms-user-select: text !important;
    }
    
    *::selection {
      background: #b4d5fe !important;
      color: inherit !important;
    }
  `;
  document.head.appendChild(style);

  // 移除所有禁止选择和复制的事件监听器
  document.addEventListener('selectstart', e => e.stopPropagation(), true);
  document.addEventListener('copy', e => e.stopPropagation(), true);
  document.addEventListener('contextmenu', e => e.stopPropagation(), true);

  // 处理所有元素
  const elements = document.querySelectorAll('*');
  elements.forEach(el => {
    el.style.userSelect = 'text';
    el.style.webkitUserSelect = 'text';
    el.oncontextmenu = null;
    el.onselectstart = null;
    el.oncopy = null;
  });
}

// 恢复文本选择限制
function restoreSelectRestriction() {
  // 移除添加的样式
  const style = document.getElementById('remove-select-restriction-style');
  if (style) {
    style.remove();
  }
}

// 初始化函数
async function initialize() {
  //console.log('开始初始化...');

  try {
    // 从存储中加载功能状态
    const {
      extensionEnabled = true,
      pasteLimitDisabled = true,
      copyBtnEnabled = true,
      textSelectEnabled = true
    } = await chrome.storage.local.get([
      'extensionEnabled',
      'pasteLimitDisabled',
      'copyBtnEnabled',
      'textSelectEnabled'
    ]);

    // 如果插件被禁用，直接返回
    if (!extensionEnabled) {
      return;
    }

    // 等待配置和工具加载
    if (!window.QUESTION_TYPES || !window.AI_CONFIG || !window.RUN_MODES) {
      //console.error('配置未加载，等待重试...');
      setTimeout(initialize, 500);
      return;
    }

    // 保存状态到全局变量
    window.extensionEnabled = extensionEnabled;
    window.copyBtnEnabled = copyBtnEnabled;
    window.pasteLimitDisabled = pasteLimitDisabled;
    window.textSelectEnabled = textSelectEnabled;

    // 根据存储的状态初始化功能
    if (pasteLimitDisabled) {
      removePasteRestriction();
    }
    if (textSelectEnabled) {
      removeSelectRestriction();
    }

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