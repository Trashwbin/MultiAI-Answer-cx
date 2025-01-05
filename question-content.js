// AI配置
const AI_CONFIG = {
  kimi: {
    name: 'Kimi',
    color: '#1976d2'
  },
  deepseek: {
    name: 'DeepSeek',
    color: '#4a4a4a'
  },
  tongyi: {
    name: '通义千问',
    color: '#FF6A00'
  }
};

// 添加 loading 状态管理
const loadingState = {
  status: {},
  updateUI(aiType, isLoading) {
    this.status[aiType] = isLoading;
    updateLoadingUI();
  }
};

// 添加按钮和答案面板
function setupUI() {
  console.log('正在添加UI组件...');

  // 创建按钮容器
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  // 添加预览按钮
  const previewButton = document.createElement('button');
  previewButton.textContent = '预览题目';
  previewButton.style.cssText = `
    padding: 10px 20px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  `;
  previewButton.addEventListener('click', showPreviewModal);
  buttonContainer.appendChild(previewButton);

  // 添加单独发送按钮
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    const button = document.createElement('button');
    button.textContent = `发送到 ${config.name}`;
    button.style.cssText = `
      padding: 10px 20px;
      background: ${config.color};
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    `;
    button.addEventListener('click', () => sendToAI(aiType));
    buttonContainer.appendChild(button);
  });

  // 添加一键发送按钮
  const sendAllButton = document.createElement('button');
  sendAllButton.textContent = '一键发送所有AI';
  sendAllButton.style.cssText = `
    padding: 10px 20px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 10px;
  `;
  sendAllButton.addEventListener('click', sendToAllAIs);
  buttonContainer.appendChild(sendAllButton);

  // 添加查看答案按钮
  const viewAnswersButton = document.createElement('button');
  viewAnswersButton.textContent = '查看AI回答';
  viewAnswersButton.style.cssText = `
    padding: 10px 20px;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 10px;
  `;
  viewAnswersButton.addEventListener('click', showAnswersModal);
  buttonContainer.appendChild(viewAnswersButton);

  document.body.appendChild(buttonContainer);

  // 创建答案模态框
  const modal = document.createElement('div');
  modal.id = 'ai-answers-modal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;

  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    position: relative;
    width: 90%;
    height: 90%;
    margin: 2% auto;
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    right: 10px;
    top: 10px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #666;
  `;
  closeButton.addEventListener('click', () => modal.style.display = 'none');

  const answersContainer = document.createElement('div');
  answersContainer.id = 'answers-container';
  answersContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  `;

  modalContent.appendChild(closeButton);
  modalContent.appendChild(answersContainer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

// 显示答案模态框
function showAnswersModal() {
  const modal = document.getElementById('ai-answers-modal');
  const container = document.getElementById('answers-container');

  if (!container.children.length) {
    container.innerHTML = '<div style="text-align: center; color: #666;">暂无AI回答</div>';
  }

  modal.style.display = 'block';
}

// 发送到单个AI
function sendToAI(type) {
  console.log('发送到:', type);
  loadingState.updateUI(type, true);

  // 获取所有问题卡片并合并
  const questionCards = document.querySelectorAll('.question-card');
  const allQuestions = Array.from(questionCards).map((card, index) => {
    const title = card.querySelector('.question-title').textContent;
    const content = card.querySelector('.question-content').textContent;
    const options = Array.from(card.querySelectorAll('.option'))
      .map(opt => opt.textContent)
      .join('\n');

    return `${title}\n${content}\n${options}`;
  }).join('\n\n');

  // 生成带提示词的完整问题
  const promptedQuestion = generatePrompt(allQuestions);

  console.log('准备发送问题到:', type);
  if (allQuestions) {
    chrome.runtime.sendMessage({
      type: 'GET_QUESTION',
      question: promptedQuestion,
      aiType: type
    });
  }
}

// 一键发送到所有AI
function sendToAllAIs() {
  Object.keys(AI_CONFIG).forEach(aiType => {
    sendToAI(aiType);
  });
}

// 生成带提示词的问题
function generatePrompt(questions) {
  return `请按照以下格式回答问题:

1. 每个问题的答案需要以"问题X答案:"(X为题号)开头
2. 如果是选择题:
   - 先给出答案选项(如: 答案: A)
   - 然后给出解释

3. 如果是编程题:
   - 使用 \`\`\`javascript 和 \`\`\` 包裹代码
   - 代码后给出解释
   - 如果有示例,请用注释标明

4. 如果是开放题:
   - 直接给出条理清晰的答案
   - 如果涉及到代码,也使用代码块格式

5. 所有答案要简洁明了,重点突出

${questions}

请开始回答。`;
}

// 发送选中的题目
function sendSelectedQuestions() {
  const selectedIndexes = Array.from(document.querySelectorAll('.question-checkbox:checked'))
    .map(cb => parseInt(cb.dataset.index));

  if (selectedIndexes.length === 0) {
    alert('请至少选择一个题目');
    return;
  }

  const questionCards = document.querySelectorAll('.question-card');
  const selectedQuestions = selectedIndexes.map(index => {
    const card = questionCards[index];
    const title = card.querySelector('.question-title').textContent;
    const content = card.querySelector('.question-content').textContent;
    const options = Array.from(card.querySelectorAll('.option'))
      .map(opt => opt.textContent)
      .join('\n');

    // 直接使用题目原有的标题,不添加额外的题号
    return `${title}\n${content}\n${options}`;
  }).join('\n\n');

  // 生成带提示词的完整问题
  const promptedQuestion = generatePrompt(selectedQuestions);

  // 关闭预览模态框
  document.getElementById('questions-preview-modal').style.display = 'none';

  // 发送选中的题目
  Object.keys(AI_CONFIG).forEach(aiType => {
    chrome.runtime.sendMessage({
      type: 'GET_QUESTION',
      aiType: aiType,
      question: fullQuestion
    });
  });
}

// 更新答案面板
function updateAnswerPanel(aiType, answer) {
  const container = document.getElementById('answers-container');
  const aiConfig = AI_CONFIG[aiType];

  // 使用正则表达式匹配"问题X答案:"格式
  const answers = answer.split(/问题\s*\d+\s*答案:/g).filter(a => a.trim());

  answers.forEach((answerText, index) => {
    let questionSection = document.getElementById(`question-${index}`);

    if (!questionSection) {
      const questionCard = document.querySelectorAll('.question-card')[index];
      const questionTitle = questionCard ? questionCard.querySelector('.question-title').textContent : `问题 ${index + 1}`;

      questionSection = document.createElement('div');
      questionSection.id = `question-${index}`;
      questionSection.style.cssText = `
        margin-bottom: 30px;
        border-bottom: 1px solid #eee;
        padding-bottom: 20px;
      `;

      const titleDiv = document.createElement('h2');
      titleDiv.style.marginBottom = '20px';
      titleDiv.textContent = questionTitle;
      questionSection.appendChild(titleDiv);

      const answersGrid = document.createElement('div');
      answersGrid.className = 'ai-answers';
      answersGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
      `;

      Object.entries(AI_CONFIG).forEach(([ai, config]) => {
        const aiAnswer = document.createElement('div');
        aiAnswer.id = `${ai}-q${index}`;
        aiAnswer.className = 'ai-answer';
        aiAnswer.innerHTML = `
          <h3 style="color: ${config.color}; margin-bottom: 10px;">
            ${config.name} 的回答:
          </h3>
          <div class="answer-content" style="
            white-space: pre-wrap;
            font-family: monospace;
            background: #f8f8f8;
            padding: 15px;
            border-radius: 5px;
          "></div>
        `;
        answersGrid.appendChild(aiAnswer);
      });

      questionSection.appendChild(answersGrid);
      container.appendChild(questionSection);
    }

    const answerDiv = questionSection.querySelector(`#${aiType}-q${index} .answer-content`);
    if (answerDiv) {
      answerDiv.textContent = answerText.trim();
    }
  });
}

// 更新 loading 状态的 UI
function updateLoadingUI() {
  Object.entries(loadingState.status).forEach(([aiType, isLoading]) => {
    const cells = document.querySelectorAll(`[id^="${aiType}-q"]`);
    cells.forEach(cell => {
      const spinner = cell.querySelector('.loading-spinner');
      const content = cell.querySelector('.answer-content');
      if (spinner && content) {
        spinner.style.display = isLoading ? 'block' : 'none';
        content.style.opacity = isLoading ? '0.5' : '1';
      }
    });
  });
}

// 初始化
function init() {
  console.log('初始化脚本...');
  setupUI();
}

if (document.readyState === 'loading') {
  console.log('等待DOM加载...');
  document.addEventListener('DOMContentLoaded', init);
} else {
  console.log('DOM已加载，直接初始化');
  init();
}

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SHOW_ANSWER') {
    console.log('收到AI回答:', request.aiType);
    loadingState.updateUI(request.aiType, false);
    updateAnswerPanel(request.aiType, request.answer);
  }
});

// 显示题目预览
function showPreviewModal() {
  const modal = document.createElement('div');
  modal.id = 'questions-preview-modal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
  `;

  const previewContent = document.createElement('div');
  previewContent.style.cssText = `
    position: relative;
    width: 90%;
    height: 90%;
    margin: 2% auto;
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // 创建头部区域
  const previewHeader = document.createElement('div');
  previewHeader.className = 'preview-header';
  previewHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 0 20px;
  `;

  // 创建全选区域 (放在左侧)
  const selectAllLabel = document.createElement('label');
  selectAllLabel.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  `;

  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.checked = true;
  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.question-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  selectAllLabel.appendChild(selectAllCheckbox);
  selectAllLabel.appendChild(document.createTextNode('全选'));

  // 创建模式选择区域 (放在中间靠右)
  const modeSelection = document.createElement('div');
  modeSelection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 20px;
    margin-left: auto;
    margin-right: 40px;
  `;

  // 创建单选按钮组
  const modes = [
    {
      id: 'concise',
      label: '简洁模式',
      prompt: `请严格按照以下格式简洁回答问题:
问题X答案: (X为题号)

一、选择题格式示例:
问题1答案:
A

问题2答案:
ABC

二、判断题格式示例:
问题3答案:
正确

问题4答案:
错误

三、填空题格式示例:
问题5答案:
第一空: TCP
第二空: UDP

四、编程题格式示例:
问题6答案:
\`\`\`javascript
function example(arr) {
  return arr.filter(x => x > 0);
}
\`\`\`

五、计算题格式示例:
问题7答案:
x = 42

六、简答题格式示例:
问题8答案:
1. 第一点
2. 第二点
3. 第三点

严格要求:
1. 每个答案必须以"问题X答案:"开头
2. 选择题只写选项字母，不要解释
3. 判断题只写"正确"或"错误"
4. 填空题直接给出答案内容
5. 编程题只给出代码，使用代码块
6. 计算题只给出最终结果
7. 简答题只列出要点
8. 所有答案之间用空行分隔
9. 不要添加任何解释说明
10. 保持格式统一规范`,
      default: true
    },
    {
      id: 'detailed',
      label: '解析模式',
      prompt: `请按照以下格式详细回答问题:
问题X答案:

一、选择题(单选/多选)：
1. 给出答案选项
2. 解释为什么选择/不选择每个选项
3. 指出关键考点

二、判断题：
1. 给出判断结果
2. 解释判断依据
3. 纠正错误说法(如果有)

三、填空题：
1. 给出填空内容
2. 解释答案来源
3. 相关知识点延伸

四、编程题：
1. 给出代码实现(使用代码块)
2. 解释代码思路和关键步骤
3. 分析时间/空间复杂度
4. 提供优化建议

五、计算题：
1. 给出计算步骤
2. 列出计算公式
3. 说明计算过程
4. 得出最终结果

六、简答/论述题：
1. 给出答案要点
2. 展开详细说明
3. 举例论证(如果需要)

七、其他题型：
1. 给出规范答案
2. 提供详细解析
3. 总结知识要点

注意：
- 每个问题以"问题X答案:"开头(X为题号)
- 按照题型选择对应的解答格式
- 解释要清晰易懂
- 多个问题之间用空行分隔`
    }
  ];

  modes.forEach(mode => {
    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    `;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer-mode';
    radio.id = mode.id;
    radio.value = mode.prompt;
    radio.checked = mode.default || false;

    const span = document.createElement('span');
    span.textContent = mode.label;

    label.appendChild(radio);
    label.appendChild(span);
    modeSelection.appendChild(label);
  });

  // 创建按钮区域 (放在最右侧)
  const actionButtons = document.createElement('div');
  actionButtons.style.cssText = `
    display: flex;
    gap: 10px;
  `;

  const closePreviewButton = document.createElement('button');
  closePreviewButton.textContent = '关闭';
  closePreviewButton.style.cssText = `
    padding: 8px 16px;
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  closePreviewButton.onclick = () => modal.style.display = 'none';

  const sendSelectedButton = document.createElement('button');
  sendSelectedButton.textContent = '发送选中题目';
  sendSelectedButton.style.cssText = `
    padding: 8px 16px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  // 添加按钮到按钮容器
  actionButtons.appendChild(closePreviewButton);
  actionButtons.appendChild(sendSelectedButton);

  // 组装头部 (新的顺序)
  previewHeader.appendChild(selectAllLabel);        // 左侧
  previewHeader.appendChild(modeSelection);         // 中间靠右
  previewHeader.appendChild(actionButtons);         // 最右侧

  // 创建题目容器
  const questionsContainer = document.createElement('div');
  questionsContainer.id = 'preview-questions-container';
  questionsContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 10px;
  `;

  // 获取所有问题并展示
  const questionCards = document.querySelectorAll('.question-card');
  questionsContainer.innerHTML = Array.from(questionCards).map((card, index) => {
    const title = card.querySelector('.question-title').textContent;
    const content = card.querySelector('.question-content').textContent;
    const options = Array.from(card.querySelectorAll('.option'))
      .map(opt => opt.textContent)
      .join('\n');

    return `
      <div class="preview-question" style="
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #eee;
        border-radius: 4px;
      ">
        <label style="display: flex; gap: 8px; margin-bottom: 10px;">
          <input type="checkbox" class="question-checkbox" data-index="${index}" checked>
          <span style="font-weight: bold;">${title}</span>
        </label>
        <div style="margin: 10px 0;">${content}</div>
        <div style="margin-left: 20px; white-space: pre-wrap;">${options}</div>
      </div>
    `;
  }).join('');

  // 添加发送事件处理
  sendSelectedButton.onclick = () => {
    const selectedQuestions = Array.from(document.querySelectorAll('.question-checkbox:checked'))
      .map(cb => {
        const index = parseInt(cb.dataset.index);
        const questionCard = document.querySelectorAll('.question-card')[index];
        return {
          title: questionCard.querySelector('.question-title').textContent,
          content: questionCard.querySelector('.question-content').textContent,
          options: Array.from(questionCard.querySelectorAll('.option'))
            .map(opt => opt.textContent)
            .join('\n')
        };
      });

    if (selectedQuestions.length === 0) {
      alert('请至少选择一个题目');
      return;
    }

    // 获取选中的模式提示词
    const selectedMode = document.querySelector('input[name="answer-mode"]:checked');
    const prompt = selectedMode.value;

    // 组装完整问题
    const fullQuestion = prompt + '\n\n' + selectedQuestions.map((q, i) =>
      `问题${i + 1}:
${q.title}
${q.content}
${q.options}`
    ).join('\n\n');

    // 发送到所有选中的AI
    Object.keys(AI_CONFIG).forEach(aiType => {
      chrome.runtime.sendMessage({
        type: 'GET_QUESTION',
        aiType: aiType,
        question: fullQuestion
      }, response => {
        if (response && response.success) {
          loadingState.updateUI(aiType, true);
        }
      });
    });

    modal.style.display = 'none';
  };

  // 组装并显示模态框
  previewContent.appendChild(previewHeader);
  previewContent.appendChild(questionsContainer);
  modal.appendChild(previewContent);
  document.body.appendChild(modal);
  modal.style.display = 'block';
}

// 更新答案面板中的代码显示
function formatAnswer(answerText) {
  // 如果内容已经包含HTML标签，说明是完整的回答
  if (/<[^>]*>/.test(answerText)) {
    // 替换深色版本、浅色版本和复制按钮的文本
    return answerText
      .replace(/深色版本|浅色版本/g, ':')
      .replace(/复制(?!代码)/g, ':'); // 使用负向前瞻，避免替换"复制代码"按钮的文本
  }

  // 否则按原来的方式处理代码块
  let formattedText = answerText;
  const codeBlockRegex = /```(?:javascript)?\s*([\s\S]*?)```/g;

  // 收集所有代码块
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(answerText)) !== null) {
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
        <div class="code-block" style="
          background: #1e1e1e;
          color: #d4d4d4;
          padding: 16px;
          border-radius: 8px;
          font-family: 'Consolas', monospace;
          margin: 10px 0;
        ">
          <div class="code-header" style="
            padding: 8px;
            border-bottom: 1px solid #333;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <span style="color: #888">JavaScript</span>
            <button onclick="copyCode(this)" style="
              background: transparent;
              border: 1px solid #666;
              color: #888;
              padding: 4px 8px;
              border-radius: 4px;
              cursor: pointer;
            ">复制代码</button>
          </div>
          <div class="code-content" style="
            counter-reset: line;
            white-space: pre;
            overflow-x: auto;
          ">
            ${numberedLines}
          </div>
        </div>
      `;
    }).join('\n\n');

    // 添加样式
    const style = `
      <style>
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
    `;
    formattedText = style + formattedText;
  }

  return formattedText;
}

// 添加复制功能
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