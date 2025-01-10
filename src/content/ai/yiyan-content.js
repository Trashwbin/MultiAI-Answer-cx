// 文心一言聊天助手
class YiyanChatAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.debugPanel = new DebugPanel('文心一言');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    // 等待输入框加载
    while (!document.querySelector('.yc-editor[contenteditable="true"]')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 等待编辑器完全初始化
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 尝试一次空输入，确保编辑器已经完全准备好
    try {
      const editor = document.querySelector('.yc-editor[contenteditable="true"]');
      editor.focus();
      editor.dispatchEvent(new Event('focus', { bubbles: true }));
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) {
      this.log('初始化测试失败，但继续执行:', error);
    }

    this.ready = true;
    this.log('文心一言页面已就绪');
  }

  async updateEditorContent(message) {
    try {
      const editor = document.querySelector('#dialogue-input') || document.querySelector('.yc-editor[contenteditable="true"]');
      if (!editor) {
        throw new Error('找不到输入框');
      }

      if (document.querySelector('.swiper')) {
        document.querySelector('.swiper').innerHTML = '';
      }

      // 聚焦编辑器
      editor.focus();
      editor.dispatchEvent(new Event('focus', { bubbles: true }));
      // 确保编辑器处于可编辑状态
      editor.contentEditable = 'true';
      // 尝试使用 click 事件触发聚焦
      editor.click();
      editor.placeholder = '请输入问题或“/”获取模板';
      this.log('输入框已聚焦');

      // 使用 execCommand 插入文本
      const selection = window.getSelection();
      const range = document.createRange();

      // 确保编辑器有一个空段落
      if (!editor.querySelector('p')) {
        const p = document.createElement('p');
        p.className = 'yc-editor-paragraph';
        p.innerHTML = '<br>';
        editor.appendChild(p);
      }

      const p = editor.querySelector('p');
      range.selectNodeContents(p);
      selection.removeAllRanges();
      selection.addRange(range);

      document.execCommand('insertText', false, message);

      // 触发输入事件
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 等待一下确保内容更新
      await new Promise(resolve => setTimeout(resolve, 200));

      // 点击发送按钮
      const sendButton = document.querySelector('#sendBtn');
      if (sendButton) {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        sendButton.dispatchEvent(clickEvent);
      }

    } catch (error) {
      this.log('错误: 更新输入框失败:', error);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;
      this.debugPanel.activate(); // 激活调试面板

      const currentMessages = Array.from(document.querySelectorAll('.dialogue_card_item[data-chat-id]'));
      this.lastMessageId = currentMessages.length > 0 ?
        parseInt(currentMessages[currentMessages.length - 1].getAttribute('data-chat-id')) :
        null;

      await this.updateEditorContent(message);
      await this.waitForResponse();
      this.typing = false;

    } catch (error) {
      this.log('错误: 发送消息失败:', error);
      this.typing = false;
      throw error;
    }
  }

  async waitForResponse() {
    return new Promise((resolve) => {
      setTimeout(() => {
        let checkCount = 0;
        const maxChecks = 240;
        let hasCopied = false;
        let lastContent = '';
        let contentStabilityCount = 0;
        const requiredContentStability = 10;
        let lastUpdateTime = Date.now();
        const updateInterval = 1000; // 每2秒触发一次页面更新

        const checkTyping = setInterval(() => {
          checkCount++;
          this.log(`检查回复 #${checkCount}`);

          try {
            // 如果距离上次更新超过2秒，模拟标签页激活状态
            const now = Date.now();
            if (now - lastUpdateTime >= updateInterval) {
              lastUpdateTime = now;
              // 模拟标签页激活和失活
              window.dispatchEvent(new Event('blur'));
              window.dispatchEvent(new Event('focus'));
              document.dispatchEvent(new Event('visibilitychange'));
              this.log('触发页面更新');
            }

            // 获取所有对话项并找到最新的一个
            const messageItems = Array.from(document.querySelectorAll('.dialog-card-wrapper'));
            if (!messageItems.length) {
              this.log('未找到对话项');
              return;
            }

            const lastMessage = messageItems[0];

            if (lastMessage) {
              // 检查是否还在输出中 - 通过查找停止按钮或复制按钮
              const stopButton = Array.from(lastMessage.querySelectorAll('span')).find(
                span => span.textContent === '停止生成'
              );
              const copyContainer = lastMessage.querySelector('#copy-container');
              const isTyping = !!stopButton && !copyContainer;

              if (!isTyping) {
                // 获取完整内容
                const contentDiv = lastMessage.querySelector('.custom-html');
                let content = '';

                if (contentDiv) {
                  // 克隆节点以避免修改原始内容
                  const clonedDiv = contentDiv.cloneNode(true);

                  // 处理有序列表
                  const orderedLists = clonedDiv.querySelectorAll('ol');
                  orderedLists.forEach(ol => {
                    const items = ol.querySelectorAll('li');
                    items.forEach((li, index) => {
                      li.textContent = `${index + 1}. ${li.textContent}\n`;
                    });
                  });

                  // 处理无序列表
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

                // 检查内容稳定性
                if (content === lastContent) {
                  contentStabilityCount++;
                  this.log(`内容稳定性检查 ${contentStabilityCount}/${requiredContentStability}`);
                } else {
                  contentStabilityCount = 0;
                  lastContent = content;
                }

                // 两种情况下认为回复完成：
                // 1. 内容连续稳定10次
                // 2. 出现复制按钮
                const shouldComplete =
                  contentStabilityCount >= requiredContentStability ||
                  copyContainer;

                if (shouldComplete && !hasCopied) {
                  this.log('获取到完整回复，长度:', content.length);
                  this.log('完成原因:', copyContainer ? '出现复制按钮' : '内容稳定');
                  hasCopied = true;

                  if (content) {
                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: content,
                      aiType: 'yiyan'
                    });

                    this.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  }
                }
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
      }, 5000); // 初始等待5秒
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
        this.sendMessage(request.question)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
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
    if (document.querySelector('.yc-editor[contenteditable="true"]')) {
      new YiyanChatAssistant();
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