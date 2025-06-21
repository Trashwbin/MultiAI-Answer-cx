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
    // 等待输入框加载 - 更新选择器以适配新版本
    while (!document.querySelector('.chat-input-editor[data-lexical-editor="true"]')) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.ready = true;
    this.log('Kimi 页面已就绪');
  }

  async updateEditorContent(message) {
    try {
      const editorDiv = document.querySelector('.chat-input-editor[data-lexical-editor="true"]');
      if (!editorDiv) {
        throw new Error('找不到输入框');
      }

      editorDiv.focus();

      // 先清空编辑器内容
      editorDiv.innerHTML = '';

      // 设置新内容 - 适配Lexical编辑器格式
      const lexicalContent = `<p dir="ltr"><span data-lexical-text="true">${message}</span></p>`;
      editorDiv.innerHTML = lexicalContent;

      // 尝试使用剪贴板方式作为备选
      try {
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', lexicalContent);
        clipboardData.setData('text/plain', message);

        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboardData
        });

        editorDiv.dispatchEvent(pasteEvent);
      } catch (clipboardError) {
        this.log('剪贴板方式失败，使用直接设置:', clipboardError);
      }

      // 触发input事件
      editorDiv.dispatchEvent(new Event('input', { bubbles: true }));
      editorDiv.dispatchEvent(new Event('change', { bubbles: true }));

      // 等待内容更新
      await new Promise(resolve => setTimeout(resolve, 200));

      // 验证内容是否设置成功
      const currentText = editorDiv.textContent || '';
      if (!currentText.includes(message.substring(0, 20))) {
        this.log('警告: 内容设置可能未成功，当前内容:', currentText);
      }

    } catch (error) {
      this.log('错误: 更新输入框失败:', error);
    }
  }

  async addPlaceholderText() {
    try {
      // 等待一小段时间确保发送完成
      await new Promise(resolve => setTimeout(resolve, 1000));

      const editorDiv = document.querySelector('.chat-input-editor[data-lexical-editor="true"]');
      if (!editorDiv) return;

      // 添加占位符文本以保持发送按钮启用
      const placeholderContent = `<p dir="ltr"><span data-lexical-text="true">.</span></p>`;
      editorDiv.innerHTML = placeholderContent;

      // 触发input事件
      editorDiv.dispatchEvent(new Event('input', { bubbles: true }));

      this.log('已添加占位符文本以启用发送按钮');
    } catch (error) {
      this.log('添加占位符失败:', error);
    }
  }

  async clearEditor() {
    try {
      const editorDiv = document.querySelector('.chat-input-editor[data-lexical-editor="true"]');
      if (!editorDiv) return;

      editorDiv.innerHTML = '';
      editorDiv.dispatchEvent(new Event('input', { bubbles: true }));

      this.log('已清空输入框');
    } catch (error) {
      this.log('清空输入框失败:', error);
    }
  }

  // 检查是否发送成功
  async checkSendSuccess() {
    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 500;

    while (retryCount < maxRetries) {
      const editor = document.querySelector('.chat-input-editor[data-lexical-editor="true"]');
      const segments = document.querySelectorAll('div[id^="chat-segment-"]');
      const lastSegment = segments[segments.length - 1];

      // 检查是否有停止按钮或输入框已清空
      if (lastSegment) {
        const stopButton = lastSegment.querySelector('.stop-message-btn');
        if (stopButton && stopButton.textContent.includes('停止输出')) {
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
      // 等待一小段时间确保内容设置完成
      await new Promise(resolve => setTimeout(resolve, 800));

      let sendSuccess = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!sendSuccess && retryCount < maxRetries) {
        // 尝试回车发送
        const editor = document.querySelector('.chat-input-editor[data-lexical-editor="true"]');
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
          // 更新发送按钮选择器
          const sendButton = document.querySelector('.send-button-container .send-button');
          if (sendButton) {
            this.log('点击发送按钮...');
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

      // 发送成功后，在输入框中添加占位符以保持发送按钮启用状态
      await this.addPlaceholderText();

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
            // 检查发送按钮状态来判断是否还在输出
            const sendButtonContainer = document.querySelector('.send-button-container');
            const isStillTyping = sendButtonContainer &&
              sendButtonContainer.classList.contains('stop');

            if (isStillTyping) {
              this.log('发送按钮显示停止状态，AI还在输出，继续等待...');
              return;
            }

            // 获取最后一个回复内容
            const segments = document.querySelectorAll('.segment-assistant');
            if (segments.length > 0) {
              const lastSegment = segments[segments.length - 1];
              if (lastSegment) {
                // 双重检查：既检查发送按钮状态，也检查停止按钮
                const stopButton = lastSegment.querySelector('.stop-message-btn');
                const hasStopButton = stopButton && stopButton.textContent.includes('停止输出');

                // 如果还有停止按钮或发送按钮被禁用，继续等待
                if (hasStopButton || isStillTyping) {
                  this.log('等待输出完成...');
                  return;
                }

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

                // 检查内容是否稳定并且AI已完成输出
                if (content && !hasCopied) {
                  if (content === lastContent) {
                    // 内容稳定，确认完成
                    this.log('内容稳定且发送按钮无停止状态，确认输出完成，长度:', content.length);
                    hasCopied = true;

                    // 清空输入框
                    this.clearEditor();

                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: content,
                      aiType: 'kimi'
                    });

                    this.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  } else {
                    this.log('内容有变化，继续等待稳定...');
                    lastContent = content;
                  }
                }
              }
            }

            if (checkCount >= maxChecks) {
              this.log('❌ 达到最大检查次数，结束检查');
              if (lastContent && !hasCopied) {
                // 清空输入框
                this.clearEditor();

                chrome.runtime.sendMessage({
                  type: 'ANSWER_READY',
                  answer: lastContent,
                  aiType: 'kimi'
                });
                this.log('⚠️ 超时但仍发送最后内容');
              }
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
    if (document.querySelector('.chat-input-editor[data-lexical-editor="true"]')) {
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