// DeepSeek聊天助手
class DeepSeekChatAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.listenForQuestions();
    this.checkReady();
  }

  async checkReady() {
    // 等待输入框加载
    while (!document.querySelector('#chat-input')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.ready = true;
    console.log('DeepSeek 页面已就绪');
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
                  // 克隆节点以避免修改原始内容
                  const clonedDiv = contentDiv.cloneNode(true);

                  // 处理 br 标签，将其替换为换行符
                  const brTags = clonedDiv.querySelectorAll('br');
                  brTags.forEach(br => {
                    br.replaceWith('\n');
                  });

                  // 处理有序列表，添加序号和换行
                  const orderedLists = clonedDiv.querySelectorAll('ol');
                  orderedLists.forEach(ol => {
                    const items = ol.querySelectorAll('li');
                    items.forEach((li, index) => {
                      li.textContent = `${index + 1}. ${li.textContent}\n`;
                    });
                    // 在列表后添加空行
                    ol.insertAdjacentHTML('afterend', '\n');
                  });

                  // 处理无序列表，添加符号和换行
                  const unorderedLists = clonedDiv.querySelectorAll('ul');
                  unorderedLists.forEach(ul => {
                    const items = ul.querySelectorAll('li');
                    items.forEach(li => {
                      li.textContent = `• ${li.textContent}\n`;
                    });
                    // 在列表后添加空行
                    ul.insertAdjacentHTML('afterend', '\n');
                  });

                  // 处理段落，在每个段落后添加空行
                  const paragraphs = clonedDiv.querySelectorAll('p');
                  paragraphs.forEach(p => {
                    p.insertAdjacentHTML('afterend', '\n');
                  });

                  // 处理代码块
                  const codeBlocks = clonedDiv.querySelectorAll('.md-code-block pre');
                  Array.from(codeBlocks).forEach(block => {
                    const codeContent = block.cloneNode(true);
                    const actionDiv = codeContent.querySelector('.md-code-block-action');
                    if (actionDiv) {
                      actionDiv.remove();
                    }
                    // 在代码块前后添加空行
                    block.innerHTML = '\n' + codeContent.textContent.trim() + '\n';
                    block.insertAdjacentHTML('beforebegin', '\n');
                    block.insertAdjacentHTML('afterend', '\n');
                  });

                  // 处理标题，在标题前后添加空行
                  const headings = clonedDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
                  headings.forEach(heading => {
                    heading.insertAdjacentHTML('beforebegin', '\n');
                    heading.insertAdjacentHTML('afterend', '\n');
                  });

                  content = clonedDiv.textContent;

                  // 处理连续的多个空行，将其规范化为最多两个空行
                  content = content.replace(/\n{3,}/g, '\n\n');
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