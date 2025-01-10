// 通义千问聊天助手
class TongyiChatAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.debugPanel = new DebugPanel('通义千问');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    // 等待输入框加载，使用类名前缀查找
    while (!document.querySelector('textarea[class*="textarea--"]')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.ready = true;
    this.log('通义千问页面已就绪');
  }

  async updateEditorContent(message) {
    try {
      const editor = document.querySelector('textarea[class*="textarea--"]');
      if (!editor) {
        throw new Error('找不到输入框');
      }

      editor.value = message;
      editor.dispatchEvent(new Event('input', { bubbles: true }));

      // 等待发送按钮启用
      await new Promise(resolve => {
        const checkButton = setInterval(() => {
          // 查找不带 disabled 类的发送按钮容器
          const sendButtonContainer = document.querySelector('div[class*="operateBtn--"]:not([class*="disabled--"])');
          if (sendButtonContainer) {
            clearInterval(checkButton);
            sendButtonContainer.click();
            resolve();
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkButton);
          resolve();
        }, 5000);
      });

    } catch (error) {
      this.log('错误: 更新输入框失败:', error);
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;
      this.debugPanel.activate(); // 激活调试面板

      await this.updateEditorContent(message);
      await this.waitForResponse();
      this.typing = false;

    } catch (error) {
      this.log('错误: 发送消息失败:', error);
      this.typing = false;
    }
  }

  async waitForResponse() {
    return new Promise((resolve) => {
      setTimeout(() => {
        let checkCount = 0;
        const maxChecks = 240;
        let hasCopied = false;
        let lastContent = '';

        const checkTyping = setInterval(() => {
          checkCount++;
          this.log(`检查回复 #${checkCount}`);

          try {
            // 获取最后一个回复内容
            const answerItems = document.querySelectorAll('div[class*="answerItem--"]');
            const lastAnswer = answerItems[answerItems.length - 1];

            if (lastAnswer) {
              // 检查是否还在输出中 - 通过工具栏判断
              const toolsDiv = lastAnswer.querySelector('div[class*="tools--"]');
              const isTyping = !toolsDiv;

              if (!isTyping) {
                // 获取完整内容
                const contentDiv = lastAnswer.querySelector('.tongyi-markdown');
                let content = '';

                if (contentDiv) {
                  // 克隆节点以避免修改原始内容
                  const clonedDiv = contentDiv.cloneNode(true);

                  // 处理有序列表，添加序号和换行
                  const orderedLists = clonedDiv.querySelectorAll('ol');
                  orderedLists.forEach(ol => {
                    const items = ol.querySelectorAll('li');
                    items.forEach((li, index) => {
                      li.textContent = `${index + 1}. ${li.textContent}\n`;  // 添加换行
                    });
                  });

                  // 处理无序列表，添加符号和换行
                  const unorderedLists = clonedDiv.querySelectorAll('ul');
                  unorderedLists.forEach(ul => {
                    const items = ul.querySelectorAll('li');
                    items.forEach(li => {
                      li.textContent = `• ${li.textContent}\n`;  // 添加换行
                    });
                  });

                  // 处理代码块
                  const codeBlocks = clonedDiv.querySelectorAll('pre code');
                  Array.from(codeBlocks).forEach(block => {
                    const codeContent = block.cloneNode(true);
                    const actionDiv = codeContent.querySelector('.tongyi-design-highlighter-right-actions');
                    if (actionDiv) {
                      actionDiv.remove();
                    }
                    // 替换原始代码块为处理后的内容
                    block.innerHTML = '\n' + codeContent.textContent
                      .split('\n')
                      .map(line => line.replace(/^\d+/, '').trim())
                      .join('\n')
                      .trim() + '\n';
                  });

                  content = clonedDiv.textContent;
                }

                this.log('通义千问回答内容:', content);

                if (content !== lastContent && !hasCopied) {
                  this.log('获取到完整回复，长度:', content.length);
                  hasCopied = true;

                  if (content) {
                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: content,
                      aiType: 'tongyi'
                    });

                    this.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  }
                }

                lastContent = content;
              }

              if (isTyping) {
                this.log('等待输出完成...');
                return;
              }
            }

            if (checkCount >= maxChecks) {
              this.log('❌ 达到最大检查次数，结束检查');
              clearInterval(checkTyping);
              resolve();
            }
          } catch (error) {
            this.log('错误:', error.message);
          }
        }, 250);
      }, 3000);
    });
  }

  // 接收来自background的消息
  listenForQuestions() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'CHECK_READY') {
        sendResponse({ ready: this.ready });
        return true;
      }

      if (request.type === 'ASK_QUESTION') {
        if (!this.ready) {
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
    if (document.querySelector('textarea[placeholder="千事不决问通义"]')) {
      new TongyiChatAssistant();
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