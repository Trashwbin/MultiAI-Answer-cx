// AI调试面板
class DebugPanel {
  constructor(aiName) {
    this.aiName = aiName;
    this.isActive = false;
    this.isExpanded = false;
    this.originalLog = console.log;
    this.originalError = console.error;
    this.dragData = null;
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
      transition: width 0.3s, height 0.3s, padding 0.3s;
    `;
    document.body.appendChild(debugPanel);

    // 添加标题栏
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      cursor: move;
    `;
    debugPanel.appendChild(titleBar);

    // 添加拖动功能
    titleBar.addEventListener('mousedown', (e) => {
      if (e.target === titleBar) {
        const panel = document.getElementById('ai-debug-panel');
        const rect = panel.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const isNearRight = rect.left > screenWidth / 2;

        this.dragData = {
          startX: e.clientX,
          startY: e.clientY,
          startLeft: rect.left,
          startTop: rect.top,
          isNearRight: isNearRight,
          startRight: screenWidth - rect.right
        };

        const mouseMoveHandler = (e) => {
          if (this.dragData) {
            const dx = e.clientX - this.dragData.startX;
            const dy = e.clientY - this.dragData.startY;

            if (this.dragData.isNearRight) {
              const newRight = this.dragData.startRight - dx;
              panel.style.right = `${newRight}px`;
              panel.style.left = 'auto';
            } else {
              panel.style.left = `${this.dragData.startLeft + dx}px`;
              panel.style.right = 'auto';
            }
            panel.style.top = `${this.dragData.startTop + dy}px`;
          }
        };

        const mouseUpHandler = () => {
          this.dragData = null;
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      }
    });

    const title = document.createElement('div');
    title.textContent = `${this.aiName} 调试日志`;
    title.style.cssText = `
      font-weight: bold;
      font-size: 14px;
      color: #fff;
      pointer-events: none;
    `;
    titleBar.appendChild(title);

    // 添加按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
    `;
    titleBar.appendChild(buttonContainer);

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
    buttonContainer.appendChild(clearButton);

    // 添加展开/收起按钮
    const toggleButton = document.createElement('button');
    toggleButton.textContent = '收起';
    toggleButton.style.cssText = `
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    `;
    toggleButton.onmouseover = () => {
      toggleButton.style.background = 'rgba(255, 255, 255, 0.2)';
    };
    toggleButton.onmouseout = () => {
      toggleButton.style.background = 'rgba(255, 255, 255, 0.1)';
    };
    toggleButton.onclick = () => {
      this.isExpanded = !this.isExpanded;
      const panel = document.getElementById('ai-debug-panel');
      const logContainer = document.getElementById('ai-debug-log');
      const rect = panel.getBoundingClientRect();
      const screenWidth = window.innerWidth;

      // 判断面板是靠近屏幕左边还是右边
      const isNearRight = rect.left > screenWidth / 2;

      if (this.isExpanded) {
        panel.style.width = '320px';
        panel.style.height = '480px';
        panel.style.padding = '15px';
        if (isNearRight) {
          panel.style.right = `${screenWidth - rect.right}px`;
          panel.style.left = 'auto';
        } else {
          panel.style.left = `${rect.left}px`;
          panel.style.right = 'auto';
        }
        logContainer.style.display = 'block';
        title.style.display = 'block';
        clearButton.style.display = 'block';
        toggleButton.textContent = '收起';
      } else {
        const currentLeft = rect.left;
        const currentRight = screenWidth - rect.right;
        panel.style.width = '80px';
        panel.style.height = '32px';
        panel.style.padding = '4px 8px';
        if (isNearRight) {
          panel.style.right = `${currentRight}px`;
          panel.style.left = 'auto';
        } else {
          panel.style.left = `${currentLeft}px`;
          panel.style.right = 'auto';
        }
        logContainer.style.display = 'none';
        title.style.display = 'none';
        clearButton.style.display = 'none';
        toggleButton.textContent = '展开';
      }
    };
    buttonContainer.appendChild(toggleButton);

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

      const content = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
        } else if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        } else {
          return String(arg);
        }
      }).join(' ');

      logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${content.replace(/\n/g, '<br>')}`;
      logContainer.appendChild(logEntry);
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  }
}

// 导出
window.DebugPanel = DebugPanel; 