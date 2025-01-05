// 复用你现有的大部分代码，但修改为扩展形式
class KimiChatAssistant {
  constructor() {
    this.typing = false;
    this.listenForQuestions();
  }

  async updateEditorContent(message) {
    try {
      const editorDiv = document.querySelector('[data-testid="msh-chatinput-editor"]');
      if (!editorDiv) {
        throw new Error('找不到输入框');
      }

      editorDiv.focus();
      const formattedHTML = `<p dir="ltr"><span data-lexical-text="true">${message}</span></p>`;
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

      editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error('更新输入框失败:', error);
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;

      await this.updateEditorContent(message);

      await new Promise(resolve => {
        const checkButton = setInterval(() => {
          const sendButton = document.querySelector('[data-testid="msh-chatinput-send-button"]');
          if (sendButton && !sendButton.disabled) {
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

      await this.waitForResponse();
      this.typing = false;

    } catch (error) {
      console.error('发送消息失败:', error);
      this.typing = false;
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
            const segments = document.querySelectorAll('div[id^="chat-segment-"]');
            if (segments.length > 0) {
              const lastSegment = segments[segments.length - 1];
              if (lastSegment) {
                const stopButton = lastSegment.querySelector('div[class*="stop"] button');
                const isTyping = stopButton && stopButton.textContent === '停止输出';

                if (!isTyping) {
                  // 获取完整内容
                  const contentDiv = lastSegment.querySelector('.markdown___vuBDJ');
                  let content = '';

                  if (contentDiv) {
                    // 处理代码块
                    const codeBlocks = contentDiv.querySelectorAll('.highlight-code-light pre');
                    Array.from(codeBlocks).forEach(block => {
                      const codeContent = block.cloneNode(true);
                      const copyBtn = codeContent.querySelector('.copyBtn___l3xJQ');
                      if (copyBtn) {
                        copyBtn.remove();
                      }
                      // 替换原始代码块为处理后的内容
                      block.innerHTML = '\n' + codeContent.textContent.trim() + '\n';
                    });

                    content = contentDiv.textContent;
                  }

                  console.log('Kimi回答内容:', content);

                  if (content !== lastContent && !hasCopied) {
                    console.log('获取到完整回复，长度:', content.length);
                    hasCopied = true;

                    if (content) {
                      chrome.runtime.sendMessage({
                        type: 'ANSWER_READY',
                        answer: content,
                        aiType: 'kimi'
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

  // 接收来自background的消息
  listenForQuestions() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'ASK_QUESTION') {
        this.sendMessage(request.question, true);
        sendResponse({ success: true });
      }
    });
  }
}

// 初始化
const init = () => {
  const maxAttempts = 10;
  let attempts = 0;

  const tryInit = () => {
    if (document.querySelector('[data-testid="msh-chatinput-editor"]')) {
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