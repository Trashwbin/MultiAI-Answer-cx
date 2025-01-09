// 讯飞星火聊天助手
class XunfeiChatAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.debugPanel = new DebugPanel('讯飞星火');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志
  log(...args) {
    this.debugPanel.log(...args);
  }

  // 查找具有特定前缀的类名元素
  findElementByClassPrefix(parent, prefix) {
    const elements = parent.getElementsByTagName('*');
    for (const element of elements) {
      if (typeof element.className !== 'string') continue;
      const classes = element.className.split(' ');
      if (classes.some(cls => cls.startsWith(prefix))) {
        return element;
      }
    }
    return null;
  }

  async checkReady() {
    // 等待输入框加载
    while (!document.querySelector('#askwindow-textarea')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.ready = true;
    this.log('讯飞星火页面已就绪');
  }

  async updateEditorContent(message) {
    try {
      const editor = document.querySelector('#askwindow-textarea');
      if (!editor) {
        throw new Error('找不到输入框');
      }

      editor.focus();
      editor.value = message;
      editor.dispatchEvent(new Event('input', { bubbles: true }));

      // 等待发送按钮
      await new Promise(resolve => {
        const checkButton = setInterval(() => {
          const sendButton = document.querySelector('#ask_window_send_btn');
          if (sendButton) {
            clearInterval(checkButton);
            sendButton.click();
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
      // 不再关闭调试面板
      // this.debugPanel.deactivate();

    } catch (error) {
      this.log('错误: 发送消息失败:', error);
      this.typing = false;
      // 错误时也不关闭调试面板
      // this.debugPanel.deactivate();
    }
  }

  async waitForResponse() {
    return new Promise((resolve) => {
      setTimeout(() => {
        let checkCount = 0;
        const maxChecks = 240;
        let hasCopied = false;
        let lastContent = '';
        let stabilityCount = 0;
        const requiredStability = 5;

        const checkTyping = setInterval(() => {
          checkCount++;
          this.log(`检查回复 #${checkCount}`);

          try {
            // 使用类名前缀查找元素
            const contentItems = Array.from(document.getElementsByTagName('*'))
              .filter(el => {
                if (!el.className || typeof el.className !== 'string') return false;
                const classes = el.className.split(' ');
                return classes.some(cls => cls.startsWith('ChatWindow_chat_content__'));
              });

            this.log('找到内容元素数量:', contentItems.length);
            const lastItem = contentItems[0];

            if (lastItem) {
              // 检查是否还在生成回复
              const stopButton = this.findElementByClassPrefix(lastItem, 'AskWindow_stop_btn_wrap__');
              const isGenerating = !!stopButton;
              this.log('是否正在生成:', isGenerating);

              if (!isGenerating) {
                // 获取完整内容
                let content = '';

                // 直接从最后一个对话内容中获取文本
                if (lastItem) {
                  // 检查是否是用户消息
                  const isUserMessage = Array.from(lastItem.classList).some(cls =>
                    cls.startsWith('ChatWindow_content_user__')
                  );

                  if (isUserMessage) {
                    this.log('跳过用户消息');
                    return;
                  }

                  // 查找AI回复内容
                  const gptContent = this.findElementByClassPrefix(lastItem, 'ChatWindow_content_gpt__');
                  if (!gptContent) {
                    this.log('未找到AI回复内容');
                    return;
                  }

                  // 检查是否还在流式输出
                  const resultInner = gptContent.querySelector('.result-inner');
                  if (!resultInner) {
                    this.log('未找到result-inner元素');
                    return;
                  }

                  const isStreaming = resultInner.classList.contains('result-streaming') ||
                    resultInner.classList.contains('last-chat-loading');

                  if (isStreaming) {
                    this.log('内容正在流式输出中...');
                    return;
                  }

                  // 获取纯文本内容
                  content = resultInner.textContent.trim();
                  this.log('内容长度:', content.length);
                  this.log('内容片段:', content.substring(0, 50) + '...');
                } else {
                  this.log('未找到对话内容元素');
                }

                if (content === lastContent) {
                  stabilityCount++;
                  this.log(`内容稳定性检查 ${stabilityCount}/${requiredStability}`);
                } else {
                  stabilityCount = 0;
                  lastContent = content;
                }

                if (stabilityCount >= requiredStability && !hasCopied) {
                  console.log('获取到完整回复，长度:', content.length);
                  hasCopied = true;

                  if (content) {
                    try {
                      this.log('发送回复到测试页面');
                      chrome.runtime.sendMessage({
                        type: 'ANSWER_READY',
                        answer: content,
                        aiType: 'xinghuo'
                      });
                      this.log('消息发送成功');
                    } catch (error) {
                      this.log('发送消息失败:', error.message);
                    }

                    console.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  }
                }
              }

              if (isGenerating) {
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
    if (document.querySelector('#askwindow-textarea')) {
      new XunfeiChatAssistant();
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