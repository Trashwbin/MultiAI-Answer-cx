// AI调试面板
class DebugPanel {
  constructor(aiName) {
    this.aiName = aiName;
    this.isActive = false;
    this.originalLog = console.log;
    this.originalError = console.error;
    this.createPanel();
  }

  createPanel() {
    const debugPanel = document.createElement('div');
    debugPanel.id = 'ai-debug-panel';
    debugPanel.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      width: 320px;
      height: 480px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 15px;
      font-size: 13px;
      font-family: 'Monaco', 'Consolas', monospace;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 9999;
      display: none;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      text-align: left;
    `;
    document.body.appendChild(debugPanel);

    // 添加标题
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    debugPanel.appendChild(titleBar);

    const title = document.createElement('div');
    title.textContent = `${this.aiName} 调试日志`;
    title.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: #fff;
    `;
    titleBar.appendChild(title);

    // 添加清理按钮
    const clearButton = document.createElement('button');
    clearButton.textContent = '清理';
    clearButton.style.cssText = `
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    `;
    clearButton.onmouseover = () => {
      clearButton.style.background = 'rgba(255, 255, 255, 0.2)';
    };
    clearButton.onmouseout = () => {
      clearButton.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    clearButton.onclick = () => {
      const logContainer = document.getElementById('ai-debug-log');
      if (logContainer) {
        logContainer.innerHTML = '';
      }
    };
    titleBar.appendChild(clearButton);

    // 添加日志容器
    const logContainer = document.createElement('div');
    logContainer.id = 'ai-debug-log';
    logContainer.style.cssText = `
      height: calc(100% - 40px);
      overflow-y: auto;
      padding-right: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
      text-align: left;
    `;

    // 自定义滚动条样式
    const scrollbarStyles = document.createElement('style');
    scrollbarStyles.textContent = `
      #ai-debug-log::-webkit-scrollbar {
        width: 6px;
      }
      #ai-debug-log::-webkit-scrollbar-track {
        background: transparent;
      }
      #ai-debug-log::-webkit-scrollbar-thumb {
        background-color: rgba(255, 255, 255, 0.3);
        border-radius: 3px;
      }
      #ai-debug-log::-webkit-scrollbar-thumb:hover {
        background-color: rgba(255, 255, 255, 0.4);
      }
    `;
    document.head.appendChild(scrollbarStyles);

    debugPanel.appendChild(logContainer);
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;

    const panel = document.getElementById('ai-debug-panel');
    if (panel) {
      panel.style.display = 'block';
    }

    // 重写console.log
    console.log = (...args) => {
      this.originalLog.apply(console, args);
      this.log(...args);
    };

    // 重写console.error
    console.error = (...args) => {
      this.originalError.apply(console, args);
      this.log('错误:', ...args);
    };
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;

    const panel = document.getElementById('ai-debug-panel');
    if (panel) {
      panel.style.display = 'none';
    }

    // 恢复原始console方法
    console.log = this.originalLog;
    console.error = this.originalError;
  }

  log(...args) {
    const logContainer = document.getElementById('ai-debug-log');
    if (logContainer) {
      const logEntry = document.createElement('div');
      logEntry.style.cssText = `
        padding: 6px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        line-height: 1.4;
        word-break: break-word;
        text-align: left;
      `;

      // 添加时间戳
      const timestamp = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const content = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');

      logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${content}`;
      logContainer.appendChild(logEntry);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }
}

// 导出
window.DebugPanel = DebugPanel; 