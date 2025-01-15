// 将题目转换为图片并复制到剪贴板
async function copyQuestionAsImage(questionDiv, copyButton) {
  try {
    // 显示加载状态
    copyButton.innerHTML = `
      <svg class="loading-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
    `;
    copyButton.style.backgroundColor = '#f5f5f5';
    copyButton.disabled = true;

    // 添加旋转动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .loading-icon path {
        animation: spin 1s linear infinite;
        transform-origin: center;
      }
    `;
    document.head.appendChild(style);

    // 获取题目类型和题号
    const titleElem = questionDiv.querySelector('.mark_name');
    const titleText = titleElem?.textContent?.trim() || '';
    const [number, ...rest] = titleText.split('.');
    const typeMatch = rest.join('.').match(/\((.*?)[,，]/);
    const type = typeMatch ? typeMatch[1]?.trim() : '其他';
    const questionNumber = number.trim();

    // 创建一个临时容器来复制题目内容
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: -9999px;
      left: -9999px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 800px;
      font-family: system-ui, -apple-system, sans-serif;
    `;

    // 复制题目内容
    const clone = questionDiv.cloneNode(true);

    // 移除不需要的元素（如复制按钮等）
    const copyButtons = clone.querySelectorAll('.copy-question-btn');
    copyButtons.forEach(btn => btn.remove());

    container.appendChild(clone);
    document.body.appendChild(container);

    // 使用 html2canvas 将内容转换为图片
    const canvas = await html2canvas(container, {
      backgroundColor: 'white',
      scale: 2, // 提高图片质量
      logging: false,
      useCORS: true
    });

    // 生成文件名
    const fileName = `${type}${questionNumber}.png`;

    // 将 canvas 转换为 blob
    const blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/png');
    });

    // 创建 ClipboardItem 并复制到剪贴板
    const clipboardItem = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([clipboardItem]);

    // 清理临时元素
    document.body.removeChild(container);
    document.head.removeChild(style);

    // 恢复按钮状态
    copyButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    copyButton.style.backgroundColor = 'white';
    copyButton.disabled = false;

    // 显示成功提示，包含题目类型和题号
    showToast(`✓ ${type}${questionNumber} 已复制到剪贴板`, blob, fileName);
  } catch (error) {
    console.error('复制题目为图片失败:', error);
    // 恢复按钮状态
    copyButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    copyButton.style.backgroundColor = 'white';
    copyButton.disabled = false;
    showToast('✕ 复制失败，请重试');
  }
}

// 显示提示信息
function showToast(message, blob = null, fileName = null) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(-100%);
    background: #4CAF50;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    opacity: 0;
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  // 如果是错误消息，使用红色背景
  if (message.startsWith('✕')) {
    toast.style.background = '#f44336';
  }

  // 创建消息文本元素
  const messageText = document.createElement('span');
  messageText.textContent = message;
  toast.appendChild(messageText);

  // 如果有blob和文件名，添加下载按钮
  if (blob && fileName) {
    const downloadButton = document.createElement('button');
    downloadButton.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 12px;
      transition: background-color 0.2s ease;
    `;
    downloadButton.textContent = '下载';
    downloadButton.addEventListener('mouseenter', () => {
      downloadButton.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    });
    downloadButton.addEventListener('mouseleave', () => {
      downloadButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });
    downloadButton.addEventListener('click', () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    toast.appendChild(downloadButton);
  }

  document.body.appendChild(toast);

  // 强制重绘
  toast.offsetHeight;

  // 显示动画
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';

  // 3秒后隐藏
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-100%)';
    toast.style.opacity = '0';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

// 导出函数
window.copyQuestionAsImage = copyQuestionAsImage; 