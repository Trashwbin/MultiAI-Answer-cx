// Gemini 聊天助手
class GeminiAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.observer = null;
    this.lastQuestion = '';
    this.retryCount = 0;
    this.maxRetries = 30;
    this.retryInterval = 1000;
    this.debugPanel = new DebugPanel('Gemini');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    this.log('开始检查 Gemini 页面是否就绪...');
    // 等待输入框加载
    while (!document.querySelector('.ql-editor')) {
      if (this.retryCount >= this.maxRetries) {
        this.log('❌ Gemini 页面加载超时：未找到输入框');
        return;
      }
      this.log(`第 ${this.retryCount + 1} 次尝试查找输入框...`);
      await new Promise(resolve => setTimeout(resolve, this.retryInterval));
      this.retryCount++;
    }

    this.ready = true;
    this.log('✅ Gemini 页面已就绪');
  }

  // 获取输入框
  getInputArea() {
    return document.querySelector('.ql-editor');
  }

  // 获取发送按钮
  getSendButton() {
    return document.querySelector('button.send-button');
  }

  // 获取停止按钮
  getStopButton() {
    return document.querySelector('.stop-icon');
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

      // 清空现有内容
      inputArea.innerHTML = '';

      // 创建新的段落元素
      const p = document.createElement('p');
      p.textContent = message;
      inputArea.appendChild(p);
      this.log('✓ 已插入文本');

      // 触发必要的事件
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.dispatchEvent(new Event('change', { bubbles: true }));
      this.log('✓ 已触发事件');

      // 等待发送按钮出现
      this.log('等待发送按钮出现...');
      let retryCount = 0;
      const maxRetries = 10; // 增加重试次数
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
        this.log('尝试使用回车键发送...');
        // 模拟回车键事件
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        inputArea.dispatchEvent(enterEvent);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        // 使用原生点击事件
        this.log('尝试点击发送按钮...');
        sendButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 100));
        sendButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 100));
        sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }

      this.log('✓ 已尝试发送消息');

    } catch (error) {
      this.log('❌ 更新输入框失败:', error.message);
      throw error;
    }
  }

  async sendMessage(message) {
    try {
      if (this.typing) return;
      this.typing = true;
      this.debugPanel.activate(); // 激活调试面板
      this.lastQuestion = message;

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
            const responseElements = document.querySelectorAll('.markdown');
            if (responseElements.length > 0) {
              const latestResponse = responseElements[responseElements.length - 1];
              const answer = latestResponse.textContent.trim();

              if (!isGenerating) {
                if (answer === lastContent) {
                  stabilityCount++;
                  this.log(`内容稳定性检查 ${stabilityCount}/${requiredStability}`);
                } else {
                  stabilityCount = 0;
                  lastContent = answer;
                }

                if (stabilityCount >= requiredStability && !hasCopied && answer && answer !== this.lastQuestion) {
                  this.log('获取到完整回复，长度:', answer.length);
                  hasCopied = true;

                  chrome.runtime.sendMessage({
                    type: 'ANSWER_READY',
                    answer: answer,
                    aiType: 'gemini'
                  });

                  this.log('✅ 回答完成');
                  clearInterval(checkTyping);
                  resolve();
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
  new GeminiAssistant();
}); 