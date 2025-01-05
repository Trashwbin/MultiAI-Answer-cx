// DeepSeek聊天助手
class DeepSeekChatAssistant {
  constructor() {
    this.typing = false;
    this.listenForQuestions();
  }

  async updateEditorContent(message) {
    try {
      const editor = document.querySelector('#chat-input');
      if (!editor) {
        throw new Error('找不到输入框');
      }

      editor.focus();
      editor.value = message;
      editor.dispatchEvent(new Event('input', { bubbles: true }));

    } catch (error) {
      console.error('更新输入框失败:', error);
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;

      await this.updateEditorContent(message);

      // 模拟按回车键发送
      const editor = document.querySelector('#chat-input');
      if (editor) {
        editor.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true
        }));
      }

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
            const responseDivs = document.querySelectorAll('.ds-markdown--block');
            const responseDiv = responseDivs[responseDivs.length - 1];

            if (responseDiv) {
              // 检查是否还在输出中 - 通过复制按钮判断
              const copyButton = responseDiv.parentElement.querySelector('.ds-icon-button');
              const isTyping = !copyButton;

              if (!isTyping) {
                // 获取完整内容
                const contentDiv = responseDiv;
                let content = '';

                if (contentDiv) {
                  // 处理代码块
                  const codeBlocks = contentDiv.querySelectorAll('.md-code-block pre');
                  Array.from(codeBlocks).forEach(block => {
                    const codeContent = block.cloneNode(true);
                    const actionDiv = codeContent.querySelector('.md-code-block-action');
                    if (actionDiv) {
                      actionDiv.remove();
                    }
                    // 替换原始代码块为处理后的内容
                    block.innerHTML = '\n' + codeContent.textContent.trim() + '\n';
                  });

                  content = contentDiv.textContent;
                }

                console.log('DeepSeek回答内容:', content);

                if (content !== lastContent && !hasCopied) {
                  console.log('获取到完整回复，长度:', content.length);
                  hasCopied = true;

                  if (content) {
                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: content,
                      aiType: 'deepseek'
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
      if (request.type === 'ASK_QUESTION') {
        this.sendMessage(request.question);
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
    if (document.querySelector('#chat-input')) {
      new DeepSeekChatAssistant();
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