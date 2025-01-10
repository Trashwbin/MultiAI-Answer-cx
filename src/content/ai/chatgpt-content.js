// ChatGPT 聊天助手
class ChatGPTAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.observer = null;
    this.lastQuestion = '';
    this.retryCount = 0;
    this.maxRetries = 30;
    this.retryInterval = 1000;
    this.debugPanel = new DebugPanel('ChatGPT');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    this.log('开始检查 ChatGPT 页面是否就绪...');
    while (!this.getInputArea()) {
      if (this.retryCount >= this.maxRetries) {
        this.log('❌ ChatGPT 页面加载超时');
        return;
      }
      this.log(`第 ${this.retryCount + 1} 次尝试查找输入框...`);
      await new Promise(resolve => setTimeout(resolve, this.retryInterval));
      this.retryCount++;
    }

    this.ready = true;
    this.log('✅ ChatGPT 页面已就绪');
  }

  // 获取输入框
  getInputArea() {
    return document.querySelector('#prompt-textarea');
  }

  // 获取发送按钮
  getSendButton() {
    return document.querySelector('button[data-testid="send-button"]');
  }

  // 获取停止按钮
  getStopButton() {
    return document.querySelector('button[data-testid="stop-generating-button"]');
  }

  async updateEditorContent(message) {
    try {
      const inputArea = this.getInputArea();
      if (!inputArea) {
        this.log('❌ 输入框不存在');
        throw new Error('找不到输入框');
      }
      this.log('✓ 找到输入框');

      // 聚焦输入框
      inputArea.focus();
      inputArea.click();
      this.log('✓ 输入框已聚焦');

      // 使用 execCommand 插入文本
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(inputArea);
      selection.removeAllRanges();
      selection.addRange(range);

      document.execCommand('insertText', false, message);
      this.log('✓ 已插入文本');

      // 触发必要的事件
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('change', { bubbles: true }));
      this.log('✓ 已触发事件');

      // 等待发送按钮出现
      this.log('等待发送按钮出现...');
      let retryCount = 0;
      const maxRetries = 5;
      let sendButton = null;

      while (retryCount < maxRetries) {
        sendButton = this.getSendButton();
        if (sendButton && !sendButton.disabled) {
          this.log('✓ 找到可用的发送按钮');
          break;
        }
        this.log(`等待发送按钮 (${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 200));
        retryCount++;
      }

      if (!sendButton || sendButton.disabled) {
        this.log('❌ 找不到发送按钮或按钮被禁用');
        throw new Error('发送按钮不可用');
      }

      // 点击发送按钮
      sendButton.click();
      this.log('✓ 发送按钮已点击');

    } catch (error) {
      this.log('❌ 更新输入框失败:', error.message);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) {
        this.log('⚠️ 正在输入中，请等待...');
        return;
      }

      this.typing = true;
      this.debugPanel.activate();
      this.lastQuestion = message;

      await this.updateEditorContent(message);
      await this.waitForResponse();

    } catch (error) {
      this.log('错误: 发送消息失败:', error.message);
    } finally {
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
        let stabilityCount = 0;
        const requiredStability = 5;
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
            // 检查是否还在生成回答
            const isGenerating = !!this.getStopButton();

            // 获取最新的回答
            const messages = document.querySelectorAll('div[data-message-author-role="assistant"]');
            if (messages.length > 0) {
              const latestMessage = messages[messages.length - 1];
              const markdownDiv = latestMessage.querySelector('.markdown');
              if (!markdownDiv) return;

              // 检查是否是默认的空内容
              const isDefaultContent = markdownDiv.classList.contains('result-streaming') ||
                markdownDiv.textContent.trim() === '\u200B' || // 检查零宽空格
                markdownDiv.textContent.trim().length <= 1;

              if (isDefaultContent) {
                this.log('检测到默认内容，等待实际回复...');
                stabilityCount = 0;
                lastContent = '';
                return;
              }

              // 克隆节点以避免修改原始内容
              const clonedDiv = markdownDiv.cloneNode(true);

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

              const answer = clonedDiv.textContent.trim();

              if (!isGenerating) {
                if (answer === lastContent) {
                  stabilityCount++;
                  this.log(`内容稳定性检查 ${stabilityCount}/${requiredStability}`);
                } else {
                  stabilityCount = 0;
                  lastContent = answer;
                }

                if (stabilityCount >= requiredStability && !hasCopied && answer && answer !== this.lastQuestion) {
                  // 确保内容长度大于1且不是默认内容
                  if (answer.length > 1) {
                    this.log('获取到完整回复，长度:', answer.length);
                    hasCopied = true;

                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: answer,
                      aiType: 'chatgpt'
                    });

                    this.log('✅ 回答完成');
                    clearInterval(checkTyping);
                    resolve();
                  } else {
                    this.log('回复内容过短，继续等待...');
                    stabilityCount = 0;
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
      }, 3000); // 初始等待3秒
    });
  }

  listenForQuestions() {
    this.log('开始监听问题消息...');
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.log('收到消息:', request.type);

      if (request.type === 'CHECK_READY') {
        this.log('检查就绪状态:', this.ready);
        sendResponse({ ready: this.ready && !this.typing });
        return true;
      }

      if (request.type === 'ASK_QUESTION') {
        this.log('收到提问:', request.question);
        if (!this.ready) {
          this.log('页面未就绪，无法发送问题');
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
window.addEventListener('load', () => {
  new ChatGPTAssistant();
}); 