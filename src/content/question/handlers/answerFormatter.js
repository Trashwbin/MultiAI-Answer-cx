// 格式化答案显示
function formatAnswer(answerText) {
  const answers = [];
  const lines = answerText.split('\n');
  let currentAnswer = null;

  for (const line of lines) {
    // 检查是否是新答案的开始
    const answerMatch = line.match(/问题\s*(\d+)\s*答案[:：]/);
    if (answerMatch) {
      // 如果有上一个答案，保存它
      if (currentAnswer) {
        answers.push(currentAnswer);
      }
      // 开始新答案
      currentAnswer = {
        number: answerMatch[1],
        content: []
      };
      continue;
    }

    // 如果有当前答案且行不为空，添加到内容中
    if (currentAnswer && line.trim()) {
      currentAnswer.content.push(line.trim());
    }
  }

  // 保存最后一个答案
  if (currentAnswer) {
    answers.push(currentAnswer);
  }

  // 格式化答案内容
  return answers.map(answer => {
    const content = answer.content.join('\n');
    // 检查是否包含代码块
    if (content.includes('```')) {
      return formatCodeBlock(content);
    }
    return content;
  }).join('\n\n');
}

// 格式化代码块
function formatCodeBlock(text) {
  const codeBlockRegex = /```(?:javascript)?\s*([\s\S]*?)```/g;
  let formattedText = text;

  // 收集所有代码块
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    codeBlocks.push(match[1].trim());
  }

  // 如果找到代码块,格式化显示
  if (codeBlocks.length > 0) {
    formattedText = codeBlocks.map(code => {
      // 添加行号和语法高亮
      const lines = code.split('\n');
      const numberedLines = lines.map((line, index) =>
        `<div class="code-line">
          <span class="line-number">${index + 1}</span>
          <span class="line-content">${line}</span>
         </div>`
      ).join('');

      return `
        <div class="code-block">
          <div class="code-header">
            <span>JavaScript</span>
            <button onclick="copyCode(this)">复制代码</button>
          </div>
          <div class="code-content">
            ${numberedLines}
          </div>
        </div>
      `;
    }).join('\n\n');

    // 添加样式
    formattedText = `
      <style>
        .code-block {
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 16px;
          border-radius: 8px;
          font-family: 'Consolas', monospace;
          margin: 10px 0;
        }
        .code-header {
          padding: 8px;
          border-bottom: 1px solid #333;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .code-header span {
          color: #888;
        }
        .code-header button {
          background: transparent;
          border: 1px solid #666;
          color: #888;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
        }
        .code-content {
          counter-reset: line;
          white-space: pre;
          overflow-x: auto;
        }
        .code-line {
          display: flex;
          line-height: 1.5;
        }
        .line-number {
          color: #888;
          text-align: right;
          padding-right: 1em;
          user-select: none;
          min-width: 2em;
        }
        .line-content {
          flex: 1;
        }
      </style>
      ${formattedText}
    `;
  }

  return formattedText;
}

// 复制代码功能
function copyCode(button) {
  const codeBlock = button.closest('.code-block');
  const code = Array.from(codeBlock.querySelectorAll('.line-content'))
    .map(line => line.textContent)
    .join('\n');

  navigator.clipboard.writeText(code).then(() => {
    const originalText = button.textContent;
    button.textContent = '已复制!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  });
}

// 导出函数
window.formatAnswer = formatAnswer;
window.copyCode = copyCode; 