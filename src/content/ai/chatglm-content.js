// 智谱清言聊天助手
class ChatGLMAssistant {
  constructor() {
    this.inputBox = null;
    this.isReady = false;
    this.isProcessing = false;
    this.observer = null;
    this.setupObserver();
    this.listenForQuestions();
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
      console.error('更新输入框失败:', error);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      if (this.isProcessing) return;
      this.isProcessing = true;

      await this.updateEditorContent(message);
      await this.waitForResponse();
      this.isProcessing = false;

    } catch (error) {
      console.error('发送消息失败:', error);
      this.isProcessing = false;
    }
  }

  async waitForResponse() {
    return new Promise((resolve) => {
      setTimeout(() => {
        let checkCount = 0;
        const maxChecks = 120;
        let hasCopied = false;
        let lastContent = '';

        const checkTyping = setInterval(() => {
          checkCount++;
          console.group(`检查回复 #${checkCount}`);

          try {
            // 获取最后一个回复内容
            const answerDivs = document.querySelectorAll('.answer');
            const lastAnswer = answerDivs[answerDivs.length - 1];

            if (lastAnswer) {
              // 检查是否还在输出中 - 通过复制按钮判断
              const interactContainer = lastAnswer.querySelector('.interact-container');
              const copyButtons = interactContainer?.querySelectorAll('.copy');
              const isTyping = !copyButtons || copyButtons.length === 0;

              if (!isTyping) {
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

                  content = clonedDiv.textContent;
                }

                console.log('智谱清言回答内容:', content);

                if (content !== lastContent && !hasCopied) {
                  console.log('获取到完整回复，长度:', content.length);
                  hasCopied = true;

                  if (content) {
                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: content,
                      aiType: 'chatglm'
                    });

                    console.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  }
                }

                lastContent = content;
              }

              if (isTyping) {
                console.log('等待输出完成...');
                return;
              }
            }

            if (checkCount >= maxChecks) {
              console.log('❌ 达到最大检查次数，结束检查');
              clearInterval(checkTyping);
              resolve();
            }
          } finally {
            console.groupEnd();
          }
        }, 250);
      }, 3000);
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