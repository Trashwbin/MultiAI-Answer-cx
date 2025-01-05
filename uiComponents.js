function createFloatingPanel() {
  // 创建浮动按钮
  const floatingBtn = document.createElement('button');
  floatingBtn.textContent = '展开AI助手';
  floatingBtn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #1976d2;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    z-index: 9999;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;

  // 创建操作面板(默认隐藏)
  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 300px;
    background: white;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 9999;
    display: none;
  `;

  // 添加面板标题
  const title = document.createElement('h3');
  title.textContent = 'AI助手';
  title.style.cssText = `
    margin: 0 0 15px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  `;
  panel.appendChild(title);

  // 添加预览题目按钮
  const previewButton = document.createElement('button');
  previewButton.textContent = '预览题目列表';
  previewButton.style.cssText = `
    width: 100%;
    padding: 8px;
    margin: 5px 0;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  previewButton.addEventListener('click', showPreviewModal);
  panel.appendChild(previewButton);

  // 添加AI按钮
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    const button = document.createElement('button');
    button.textContent = `发送到 ${config.name}`;
    button.dataset.ai = aiType;
    button.style.cssText = `
      width: 100%;
      padding: 8px;
      margin: 5px 0;
      background: ${config.color};
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    button.addEventListener('click', () => sendToAI(aiType));
    panel.appendChild(button);
  });

  // 添加一键发送按钮
  const sendAllButton = document.createElement('button');
  sendAllButton.textContent = '一键发送所有AI';
  sendAllButton.style.cssText = `
    width: 100%;
    padding: 8px;
    margin: 10px 0 5px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  sendAllButton.addEventListener('click', sendToAllAIs);
  panel.appendChild(sendAllButton);

  // 添加查看答案按钮
  const viewAnswersButton = document.createElement('button');
  viewAnswersButton.textContent = '查看AI回答';
  viewAnswersButton.style.cssText = `
    width: 100%;
    padding: 8px;
    margin: 5px 0;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  viewAnswersButton.addEventListener('click', showAnswersModal);
  panel.appendChild(viewAnswersButton);

  // 切换面板显示/隐藏
  floatingBtn.addEventListener('click', () => {
    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      floatingBtn.textContent = '收起AI助手';
    } else {
      panel.style.display = 'none';
      floatingBtn.textContent = '展开AI助手';
    }
  });

  // 添加到页面
  document.body.appendChild(floatingBtn);
  document.body.appendChild(panel);
}

function createQuestionCard(question) {
  const card = document.createElement('div');
  card.className = 'question-card';
  card.style.cssText = `
    margin: 15px;
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;

  // 题目标题
  const title = document.createElement('div');
  title.className = 'question-title';
  title.textContent = `${question.number} ${question.type}`;
  title.style.cssText = `
    font-weight: bold;
    margin-bottom: 10px;
    color: #333;
  `;

  // 题目内容
  const content = document.createElement('div');
  content.className = 'question-content';
  content.textContent = question.content;
  content.style.cssText = `
    margin-bottom: 15px;
    line-height: 1.5;
  `;

  // 选项列表(如果有)
  const optionsList = document.createElement('div');
  optionsList.className = 'options-list';
  optionsList.style.cssText = `
    margin-left: 20px;
  `;

  question.options.forEach(opt => {
    const option = document.createElement('div');
    option.className = 'option';
    option.textContent = opt;
    option.style.cssText = `
      margin: 5px 0;
      padding: 5px 10px;
    `;
    optionsList.appendChild(option);
  });

  // 组装卡片
  card.appendChild(title);
  card.appendChild(content);
  if (question.options.length > 0) {
    card.appendChild(optionsList);
  }

  return card;
}

function createQuestionDiv(question) {
  const div = document.createElement('div');
  div.className = 'question-item';
  div.dataset.id = question.id;
  div.style.cssText = `
    padding: 15px;
    border-bottom: 1px solid #eee;
    transition: background-color 0.3s;
  `;

  // 添加复选框和标题
  const titleLabel = document.createElement('label');
  titleLabel.style.cssText = `
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    align-items: flex-start;
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'question-checkbox';
  checkbox.dataset.index = question.index;
  checkbox.checked = true;
  checkbox.addEventListener('change', updateAnswerCard);

  const titleSpan = document.createElement('span');
  titleSpan.style.fontWeight = 'bold';
  titleSpan.textContent = `${question.number} ${question.type}`;

  titleLabel.appendChild(checkbox);
  titleLabel.appendChild(titleSpan);
  div.appendChild(titleLabel);

  // 题目内容
  const content = document.createElement('div');
  content.style.margin = '10px 0';
  content.textContent = question.content;
  div.appendChild(content);

  // 选项
  if (question.options.length > 0) {
    const options = document.createElement('div');
    options.style.marginLeft = '20px';
    options.style.whiteSpace = 'pre-wrap';
    options.textContent = question.options.join('\n');
    div.appendChild(options);
  }

  return div;
} 