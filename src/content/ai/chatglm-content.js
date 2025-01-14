// 智谱清言聊天助手
class ChatGLMAssistant {
  constructor() {
    this.inputBox = null;
    this.isReady = false;
    this.isProcessing = false;
    this.observer = null;
    this.debugPanel = new DebugPanel('智谱清言');
    this.setupObserver();
    this.listenForQuestions();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  setupObserver() {
    this.observer = new MutationObserver(() => {
      if (!this.isReady) {
        this.checkReady();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  checkReady() {
    const inputBox = document.querySelector('.input-box-inner textarea');
    if (inputBox) {
      this.inputBox = inputBox;
      this.isReady = true;
      this.setupEventListeners();
      this.observer.disconnect();
      this.log('智谱清言页面已就绪');
    }
    return this.isReady;
  }

  setupEventListeners() {
    // 添加回车发送事件监听
    this.inputBox.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const sendButton = document.querySelector('.enter_icon');
        if (sendButton) {
          sendButton.click();
        }
      }
    });
  }

  async updateEditorContent(message) {
    try {
      const textarea = document.querySelector('.input-box-inner textarea');
      if (!textarea) {
        throw new Error('找不到输入框');
      }

      // 聚焦输入框
      textarea.focus();

      // 模拟用户输入
      textarea.value = message;

      // 触发必要的事件
      textarea.dispatchEvent(new Event('focus', { bubbles: true }));
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      // 等待一下确保事件被处理
      await new Promise(resolve => setTimeout(resolve, 100));

      // 点击发送按钮
      const sendButton = document.querySelector('.enter_icon');
      if (sendButton) {
        // 模拟鼠标事件
        sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      } else {
        throw new Error('找不到发送按钮');
      }

    } catch (error) {
      this.log('错误: 更新输入框失败:', error);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      if (this.isProcessing) return;
      this.isProcessing = true;
      this.debugPanel.activate(); // 激活调试面板

      await this.updateEditorContent(message);
      await this.waitForResponse();
      this.isProcessing = false;

    } catch (error) {
      this.log('错误: 发送消息失败:', error);
      this.isProcessing = false;
    }
  }

  async waitForResponse() {
    return new Promise((resolve) => {
      let checkCount = 0;
      const maxChecks = 240;
      let lastContent = '';
      let stabilityCount = 0;
      let contentStabilityCount = 0;
      const requiredStability = 2;
      const requiredContentStability = 10;
      let lastUpdateTime = Date.now();
      const updateInterval = 1000;

      const checkTyping = setInterval(() => {
        checkCount++;
        this.log(`检查回复 #${checkCount}`);

        try {
          // 如果距离上次更新超过1秒，模拟标签页激活状态
          const now = Date.now();
          if (now - lastUpdateTime >= updateInterval) {
            lastUpdateTime = now;
            // 模拟标签页激活和失活
            window.dispatchEvent(new Event('blur'));
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('visibilitychange'));
            this.log('触发页面更新');
          }

          // 获取最后一个回复内容
          const answerDivs = document.querySelectorAll('.answer');
          const lastAnswer = answerDivs[answerDivs.length - 1];

          if (!lastAnswer) {
            this.log('未找到回复内容');
            return;
          }

          // 获取完整内容
          const contentDiv = lastAnswer.querySelector('.markdown-body');
          let content = '';

          if (contentDiv) {
            // 克隆节点以避免修改原始内容
            const clonedDiv = contentDiv.cloneNode(true);

            // 处理有序列表，添加序号和换行
            const orderedLists = clonedDiv.querySelectorAll('ol');
            orderedLists.forEach(ol => {
              const items = ol.querySelectorAll('li');
              items.forEach((li, index) => {
                li.textContent = `${index + 1}. ${li.textContent}\n`;
              });
            });

            // 处理无序列表，添加符号和换行
            const unorderedLists = clonedDiv.querySelectorAll('ul');
            unorderedLists.forEach(ul => {
              const items = ul.querySelectorAll('li');
              items.forEach(li => {
                li.textContent = `• ${li.textContent}\n`;
              });
            });

            // 处理代码块
            const codeBlocks = clonedDiv.querySelectorAll('pre code');
            Array.from(codeBlocks).forEach(block => {
              const codeContent = block.cloneNode(true);
              // 替换原始代码块为处理后的内容
              block.innerHTML = '\n' + codeContent.textContent.trim() + '\n';
            });

            content = clonedDiv.textContent.trim();
          }

          if (!content) {
            this.log('内容为空');
            return;
          }

          // 检查是否还在生成回复
          const enterDiv = document.querySelector('.enter');
          const isGenerating = enterDiv?.classList.contains('searching');

          this.log('状态:', {
            '正在生成': isGenerating ? '是' : '否',
            '内容稳定次数': contentStabilityCount,
            '停止按钮稳定次数': stabilityCount
          });

          // 检查内容稳定性
          if (content === lastContent) {
            contentStabilityCount++;
          } else {
            contentStabilityCount = 0;
            lastContent = content;
          }

          // 两种情况下认为回复完成：
          // 1. 停止按钮消失且内容稳定2次
          // 2. 内容连续稳定3次
          const shouldComplete =
            (!isGenerating && content === lastContent && stabilityCount >= requiredStability) ||
            (contentStabilityCount >= requiredContentStability);

          if (!isGenerating && content === lastContent) {
            stabilityCount++;
          } else {
            stabilityCount = 0;
          }

          if (shouldComplete) {
            this.log('✅ 回答完成，内容长度:', content.length);
            this.log('完成原因:', contentStabilityCount >= requiredContentStability ? '内容稳定' : '停止按钮消失');

            chrome.runtime.sendMessage({
              type: 'ANSWER_READY',
              answer: content,
              aiType: 'chatglm'
            });

            clearInterval(checkTyping);
            resolve();
            return;
          }

          // 超时检查
          if (checkCount >= maxChecks) {
            this.log('❌ 达到最大检查次数，结束检查');
            if (content) {
              this.log('使用当前内容作为最终答案');
              chrome.runtime.sendMessage({
                type: 'ANSWER_READY',
                answer: content,
                aiType: 'chatglm'
              });
            }
            clearInterval(checkTyping);
            resolve();
          }
        } catch (error) {
          this.log('错误:', error.message);
        }
      }, 500);
    });
  }

  listenForQuestions() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'CHECK_READY') {
        sendResponse({ ready: this.isReady });
        return true;
      }

      if (request.type === 'ASK_QUESTION') {
        if (!this.isReady) {
          sendResponse({ success: false, error: 'Page not ready' });
          return true;
        }
        this.sendMessage(request.question);
        sendResponse({ success: true });
      }
      return true;
    });
  }
}

// 初始化
const init = () => {
  const maxAttempts = 10;
  let attempts = 0;

  const tryInit = () => {
    if (document.querySelector('.input-box-inner textarea')) {
      new ChatGLMAssistant();
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(tryInit, 1000);
    }
  };

  tryInit();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}