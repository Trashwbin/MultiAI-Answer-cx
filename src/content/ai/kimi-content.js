// 复用你现有的大部分代码，但修改为扩展形式
class KimiChatAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.debugPanel = new DebugPanel('Kimi');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    // 等待输入框加载
    while (!document.querySelector('.chat-input-editor')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.ready = true;
    this.log('Kimi 页面已就绪');
  }

  async updateEditorContent(message) {
    try {
      const editorDiv = document.querySelector('.chat-input-editor');
      if (!editorDiv) {
        throw new Error('找不到输入框');
      }

      editorDiv.focus();
      const formattedHTML = `<p>${message}</p>`;
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', formattedHTML);
      clipboardData.setData('text/plain', message);

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData
      });

      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      editorDiv.dispatchEvent(pasteEvent);

      if (!editorDiv.textContent) {
        editorDiv.innerHTML = formattedHTML;
      }

      // 触发input事件
      editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      this.log('错误: 更新输入框失败:', error);
    }
  }

  // 检查是否发送成功
  async checkSendSuccess() {
    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 500;

    while (retryCount < maxRetries) {
      const editor = document.querySelector('.chat-input-editor');
      const segments = document.querySelectorAll('div[id^="chat-segment-"]');
      const lastSegment = segments[segments.length - 1];
      // 检查是否有停止按钮或输入框已清空
      if (lastSegment) {
        const stopBlock = lastSegment.querySelector('div[class*="stopBlock"]');
        const stopButton = stopBlock?.querySelector('button');
        if (stopButton && stopButton.textContent === '停止输出') {
          return true;
        }
      }

      // 检查输入框是否已清空
      if (editor && !editor.textContent.trim()) {
        return true;
      }

      retryCount++;
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }

    return false;
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;
      this.debugPanel.activate(); // 激活调试面板

      await this.updateEditorContent(message);
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 500));

      let sendSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!sendSuccess && retryCount < maxRetries) {
        // 尝试回车发送
        const editor = document.querySelector('.chat-input-editor');
        if (editor) {
          editor.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }));
        }

        // 检查是否发送成功
        sendSuccess = await this.checkSendSuccess();

        // 如果回车发送失败，尝试点击发送按钮
        if (!sendSuccess) {
          // 点击发送按钮
          const sendButton = document.querySelector('.send-button');
          if (sendButton && !sendButton.classList.contains('disabled')) {
            sendButton.click();
            sendSuccess = await this.checkSendSuccess();
          }
        }

        if (!sendSuccess) {
          retryCount++;
          this.log(`发送失败，第 ${retryCount} 次重试...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!sendSuccess) {
        throw new Error('发送消息失败，已达到最大重试次数');
      }

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
            const segments = document.querySelectorAll('.segment-assistant');
            if (segments.length > 0) {
              const lastSegment = segments[segments.length - 1];
              if (lastSegment) {
                const stopBlock = lastSegment.querySelector('div[class*="stopBlock"]');
                const stopButton = stopBlock?.querySelector('button');
                const isTyping = stopButton && stopButton.textContent === '停止输出';


                if (!isTyping) {
                  // 获取完整内容
                  const contentDiv = lastSegment.querySelector('.markdown');
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

                  this.log('Kimi回答内容:', content);

                  if (content !== lastContent && !hasCopied) {
                    this.log('获取到完整回复，长度:', content.length);
                    hasCopied = true;

                    if (content) {
                      chrome.runtime.sendMessage({
                        type: 'ANSWER_READY',
                        answer: content,
                        aiType: 'kimi'
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
      }, 2000);
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
    if (document.querySelector('.chat-input-editor')) {
      new KimiChatAssistant();
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