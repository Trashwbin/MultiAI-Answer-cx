// ==UserScript==
// @name         Kimi Chat Assistant
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  自动化操作Kimi.ai聊天
// @author       Your name
// @match        https://kimi.moonshot.cn/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  class KimiChatAssistant {
    constructor() {
      this.setupUI();
      this.waitForChat();
      this.typing = false;
      this.chatHistory = [];
    }

    async waitForChat() {
      return new Promise((resolve) => {
        const checkEditor = setInterval(() => {
          const editor = document.querySelector('[data-testid="msh-chatinput-editor"]');
          if (editor) {
            clearInterval(checkEditor);
            resolve();
          }
        }, 1000);
      });
    }

    setupUI() {
      const panel = document.createElement('div');
      panel.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: white;
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 5px;
                z-index: 9999;
                width: 300px;
            `;

      const historyPanel = document.createElement('div');
      historyPanel.style.cssText = `
                max-height: 300px;
                overflow-y: auto;
                margin-bottom: 10px;
                border: 1px solid #eee;
                padding: 10px;
                border-radius: 3px;
            `;

      const input = document.createElement('textarea');
      input.placeholder = '输入要发送的消息';
      input.style.cssText = `
                width: 100%;
                height: 60px;
                margin-bottom: 10px;
                display: block;
                font-size: 14px;
                padding: 5px;
                box-sizing: border-box;
            `;

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
                display: flex;
                gap: 10px;
            `;

      const sendButton = document.createElement('button');
      sendButton.textContent = '发送消息';
      sendButton.style.cssText = `
                padding: 5px 10px;
                cursor: pointer;
                flex: 1;
            `;

      const autoButton = document.createElement('button');
      autoButton.textContent = '开始自动对话';
      autoButton.style.cssText = `
                padding: 5px 10px;
                cursor: pointer;
                flex: 1;
            `;

      const clearButton = document.createElement('button');
      clearButton.textContent = '清空历史';
      clearButton.style.cssText = `
                padding: 5px 10px;
                cursor: pointer;
                flex: 1;
            `;

      let isAutoRunning = false;

      sendButton.addEventListener('click', async () => {
        if (!this.typing && input.value.trim()) {
          this.typing = true;
          await this.waitForChat();
          this.addToHistory('user', input.value);
          await this.sendMessage(input.value, true);
          input.value = '';
          this.typing = false;
        }
      });

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (!this.typing && input.value.trim()) {
            this.typing = true;
            await this.waitForChat();
            this.addToHistory('user', input.value);
            await this.sendMessage(input.value, true);
            input.value = '';
            this.typing = false;
          }
        }
      });

      autoButton.addEventListener('click', async () => {
        if (!isAutoRunning) {
          isAutoRunning = true;
          autoButton.textContent = '停止自动对话';
          await this.waitForChat();
          await this.startAutoChat();
        } else {
          isAutoRunning = false;
          autoButton.textContent = '开始自动对话';
        }
      });

      clearButton.addEventListener('click', () => {
        this.chatHistory = [];
        historyPanel.innerHTML = '';
      });

      buttonContainer.appendChild(sendButton);
      buttonContainer.appendChild(autoButton);
      buttonContainer.appendChild(clearButton);
      panel.appendChild(historyPanel);
      panel.appendChild(input);
      panel.appendChild(buttonContainer);
      document.body.appendChild(panel);

      this.historyPanel = historyPanel;
    }

    addToHistory(role, content, suggestions = []) {
      const message = { role, content, suggestions };
      this.chatHistory.push(message);
      this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
      const historyHTML = this.chatHistory.map(message => {
        const isUser = message.role === 'user';
        const messageStyle = `
          padding: 5px 10px;
          margin: 5px 0;
          border-radius: 5px;
          background-color: ${isUser ? '#e3f2fd' : '#f5f5f5'};
          color: ${isUser ? '#1976d2' : '#333'};
        `;

        let html = `<div style="${messageStyle}">
          <strong>${isUser ? '我' : 'Kimi'}:</strong> 
          <div>${message.content}</div>
        </div>`;

        if (message.suggestions && message.suggestions.length > 0) {
          const suggestionsHTML = message.suggestions.map(suggestion =>
            `<div style="margin-left: 20px; color: #666;">- ${suggestion}</div>`
          ).join('');
          html += `<div style="margin-top: 5px;">${suggestionsHTML}</div>`;
        }

        return html;
      }).join('');

      this.historyPanel.innerHTML = historyHTML;
      this.historyPanel.scrollTop = this.historyPanel.scrollHeight;
    }

    async updateEditorContent(message) {
      try {
        const editorDiv = document.querySelector('[data-testid="msh-chatinput-editor"]');
        if (!editorDiv) {
          throw new Error('找不到输入框');
        }

        // 聚焦编辑器
        editorDiv.focus();

        // 创建带格式的HTML内容
        const formattedHTML = `<p dir="ltr"><span data-lexical-text="true">${message}</span></p>`;

        // 使用clipboard API
        const clipboardData = new DataTransfer();
        clipboardData.setData('text/html', formattedHTML);
        clipboardData.setData('text/plain', message);

        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: clipboardData
        });

        // 清除现有内容
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // 触发粘贴事件
        editorDiv.dispatchEvent(pasteEvent);

        // 如果粘贴事件没有生效，回退到直接设置HTML
        if (!editorDiv.textContent) {
          editorDiv.innerHTML = formattedHTML;
        }

        // 触发输入事件
        editorDiv.dispatchEvent(new Event('input', { bubbles: true }));

        // 等待React更新
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error('更新输入框失败:', error);
      }
    }

    async sendMessage(message, isManual = false) {
      try {
        const editorDiv = document.querySelector('[data-testid="msh-chatinput-editor"]');
        if (!editorDiv) {
          throw new Error('找不到输入框');
        }

        // 更新编辑器内容
        await this.updateEditorContent(message);

        // 等待React状态更新和发送按钮启用
        await new Promise(resolve => {
          const checkButton = setInterval(() => {
            const sendButton = document.querySelector('[data-testid="msh-chatinput-send-button"]');
            if (sendButton && !sendButton.disabled) {
              clearInterval(checkButton);
              sendButton.click();
              resolve();
            }
          }, 100);

          // 设置超时
          setTimeout(() => {
            clearInterval(checkButton);
            resolve();
          }, 5000);
        });

        // 如果是自动发送，添加额外延时
        if (!isManual) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 等待回复
        await this.waitForResponse();

      } catch (error) {
        console.error('发送消息失败:', error);
      }
    }

    async waitForResponse() {
      return new Promise((resolve) => {
        // 延迟3秒后开始检查
        setTimeout(() => {
          let checkCount = 0;
          const maxChecks = 120; // 由于间隔增加到250ms,相应减少最大检查次数
          let hasCopied = false;

          const checkTyping = setInterval(() => {
            checkCount++;
            console.group(`检查回复 #${checkCount}`);

            try {
              // 使用id前缀查找对话片段
              const segments = document.querySelectorAll('div[id^="chat-segment-"]');
              console.log(`找到对话片段数量: ${segments.length}`);

              if (segments.length > 0) {
                const lastSegment = segments[segments.length - 1];
                console.log(`最后一个对话片段ID: ${lastSegment.id}`);

                if (lastSegment) {
                  // 检查是否存在停止输出按钮
                  const stopButton = lastSegment.querySelector('div[class*="stop"] button');
                  const isTyping = stopButton && stopButton.textContent === '停止输出';
                  console.log(`状态: ${isTyping ? '正在输出' : '输出已停止'}`);

                  if (isTyping) {
                    console.log('等待输出完成...');
                    // 重置复制状态
                    hasCopied = false;
                    return;
                  }

                  // 只有当停止输出按钮消失且未复制过时才复制内容
                  if (!hasCopied) {
                    const copyButton = lastSegment.querySelector('[data-testid="msh-chat-segment-copy"]');
                    console.log(`复制按钮: ${copyButton ? '已找到' : '未找到'}`);

                    if (copyButton) {
                      // 创建一个隐藏的textarea来获取复制的内容
                      const textarea = document.createElement('textarea');
                      textarea.style.position = 'fixed';
                      textarea.style.opacity = '0';
                      document.body.appendChild(textarea);
                      textarea.focus();

                      // 保存原始的execCommand
                      const originalExec = document.execCommand;
                      let copiedText = '';

                      try {
                        // 替换execCommand来捕获复制的内容
                        document.execCommand = function (command) {
                          if (command === 'copy') {
                            const selection = document.getSelection();
                            copiedText = selection.toString();
                            console.log('获取到内容长度:', copiedText.length);
                          }
                          return true;
                        };

                        // 触发复制按钮点击
                        copyButton.click();
                        hasCopied = true;

                        if (copiedText) {
                          // 更新历史记录
                          if (this.chatHistory.length > 0 && this.chatHistory[this.chatHistory.length - 1].role === 'assistant') {
                            this.chatHistory[this.chatHistory.length - 1].content = copiedText;
                            this.updateHistoryDisplay();
                          } else {
                            this.addToHistory('assistant', copiedText, []);
                          }

                          // 获取建议问题
                          const suggestions = Array.from(
                            lastSegment.querySelectorAll('div[id="text"]')
                          ).map(el => el.textContent.trim());
                          console.log('建议问题:', suggestions);

                          // 更新建议问题
                          if (this.chatHistory.length > 0) {
                            this.chatHistory[this.chatHistory.length - 1].suggestions = suggestions;
                            this.updateHistoryDisplay();
                          }

                          // 完成回复
                          console.log('✅ 回答完成');
                          clearInterval(checkTyping);
                          resolve();
                        }
                      } catch (error) {
                        console.error('复制内容失败:', error);
                      } finally {
                        // 恢复原始的execCommand
                        document.execCommand = originalExec;
                        // 移除临时textarea
                        document.body.removeChild(textarea);
                      }
                    }
                  }
                }
              }

              // 超时处理
              if (checkCount >= maxChecks) {
                console.log('❌ 达到最大检查次数，结束检查');
                clearInterval(checkTyping);
                resolve();
              }
            } finally {
              console.groupEnd();
            }
          }, 250); // 将检查间隔从100ms增加到250ms
        }, 3000); // 延迟3秒后开始检查
      });
    }

    async startAutoChat() {
      const messages = [
        '你好',
        '介绍一下你自己',
        '你能做什么?'
      ];

      for (const message of messages) {
        await this.sendMessage(message);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

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
})(); 