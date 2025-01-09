// 豆包聊天助手
class DoubaoAssistant {
  constructor() {
    this.typing = false;
    this.ready = false;
    this.debugPanel = new DebugPanel('豆包');
    this.listenForQuestions();
    this.checkReady();
  }

  // 添加日志方法
  log(...args) {
    this.debugPanel.log(...args);
  }

  async checkReady() {
    this.log('开始检查豆包页面是否就绪...');
    // 等待输入框加载
    let attempts = 0;
    const maxAttempts = 20; // 最多等待10秒

    while (!document.querySelector('[data-testid="chat_input_input"]')) {
      this.log(`第 ${attempts + 1} 次尝试查找输入框...`);
      if (attempts >= maxAttempts) {
        this.log('豆包页面加载超时：未找到输入框');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      attempts++;
    }

    this.ready = true;
    this.log('✅ 豆包页面已就绪，输入框加载完成');
  }

  async updateEditorContent(message) {
    try {
      const editor = document.querySelector('[data-testid="chat_input_input"]');
      if (!editor) {
        throw new Error('找不到输入框');
      }

      editor.focus();
      editor.value = message;
      editor.dispatchEvent(new Event('input', { bubbles: true }));

      // 等待发送按钮启用
      await new Promise(resolve => {
        const checkButton = setInterval(() => {
          const sendButton = document.querySelector('[data-testid="chat_input_send_button"]');
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
      // 先等待2秒，确保新回复开始生成
      setTimeout(async () => {
        let checkCount = 0;
        const maxChecks = 240; // 最多等待60秒

        // 等待新的回复消息出现
        while (checkCount < maxChecks) {
          const messages = document.querySelectorAll('[data-testid="receive_message"]');
          const lastMessage = messages[messages.length - 1];
          const contentDiv = lastMessage?.querySelector('[data-testid="message_text_content"]');

          if (!lastMessage || !contentDiv) {
            this.log('等待新回复内容区域加载...');
            await new Promise(resolve => setTimeout(resolve, 250));
            checkCount++;
            continue;
          }

          // 找到新回复后，开始检测生成状态
          let lastContent = '';
          let stabilityCount = 0;
          const requiredStability = 5; // 需要连续5次内容保持稳定

          const checkTyping = setInterval(async () => {
            try {
              // 检查是否正在生成回复
              const stopButton = document.querySelector('[data-testid="chat_input_local_break_button"]');
              const isGenerating = stopButton && !stopButton.classList.contains('!hidden');

              this.log('状态:', {
                '正在生成': isGenerating ? '是' : '否'
              });

              // 当停止生成后，开始检查内容稳定性
              if (!isGenerating) {
                let currentContent = '';

                // 获取所有内容元素
                const elements = contentDiv.children;
                for (const element of elements) {
                  // 处理有序列表
                  if (element.tagName === 'OL') {
                    const items = element.querySelectorAll('li');
                    const listContent = Array.from(items)
                      .map((li, index) => `${index + 1}. ${li.textContent.trim()}`)
                      .join('\n');
                    currentContent += listContent + '\n\n';
                  }
                  // 处理段落
                  else if (element.classList.contains('paragraph-JOTKXA')) {
                    const text = element.textContent.trim();
                    if (text) {
                      currentContent += text + '\n\n';
                    }
                  }
                  // 处理其他可能的内容类型
                  else if (element.textContent.trim()) {
                    currentContent += element.textContent.trim() + '\n\n';
                  }
                }

                // 处理内容，去掉数字两边的空格
                currentContent = currentContent
                  // 处理"问题 X 答案:"格式
                  .replace(/问题\s+(\d+)\s+答案:/g, '问题$1答案:')
                  // 处理"第 X 空："格式
                  .replace(/第\s+(\d+)\s+空：/g, '第$1空：')
                  // 去掉末尾多余的换行
                  .trim();

                if (currentContent === lastContent) {
                  stabilityCount++;
                  this.log(`内容稳定性检查 ${stabilityCount}/${requiredStability}`);

                  if (stabilityCount >= requiredStability) {
                    this.log('✅ 回答完成，内容长度:', currentContent.length);

                    chrome.runtime.sendMessage({
                      type: 'ANSWER_READY',
                      answer: currentContent,
                      aiType: 'doubao'
                    });

                    clearInterval(checkTyping);
                    resolve();
                    return;
                  }
                } else {
                  this.log('内容发生变化，重置稳定性计数');
                  stabilityCount = 0;
                  lastContent = currentContent;
                }

                // 每次检查后等待一小段时间
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                this.log('等待生成完成...');
                stabilityCount = 0;
                lastContent = '';
              }
            } catch (error) {
              this.log('错误:', error.message);
            }
          }, 250);

          break;
        }

        if (checkCount >= maxChecks) {
          this.log('❌ 等待新回复超时');
          resolve();
        }
      }, 5000); // 初始等待5秒
    });
  }

  listenForQuestions() {
    this.log('开始监听问题消息...');
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.log('收到消息:', request.type);

      if (request.type === 'CHECK_READY') {
        this.log('检查就绪状态:', this.ready);
        sendResponse({ ready: this.ready });
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
const init = () => {
  new DoubaoAssistant();
};

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}