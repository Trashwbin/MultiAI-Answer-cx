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

// 添加从学习通提取题目的函数
function extractQuestionsFromXXT() {
  const questions = [];

  // 获取所有题目容器
  const questionDivs = document.querySelectorAll('.questionLi');

  questionDivs.forEach((div, index) => {
    // 获取题目类型和分数
    const typeSpan = div.querySelector('.colorShallow');
    const typeText = typeSpan ? typeSpan.textContent.match(/\((.*?)\)/) : null;
    const type = typeText ? typeText[1] : '未知类型';

    // 获取题目序号和内容
    const titleDiv = div.querySelector('.mark_name');
    const titleNumber = titleDiv ? titleDiv.firstChild.textContent.trim() : '';
    const contentDiv = titleDiv ? titleDiv.querySelector('div') : null;
    const content = contentDiv ? contentDiv.textContent.trim() : '';

    // 获取选项(如果是选择题)
    const options = [];
    const optionDivs = div.querySelectorAll('.stem_answer .answerBg');
    optionDivs.forEach(optDiv => {
      const optLabel = optDiv.querySelector('.num_option').textContent;
      const optContent = optDiv.querySelector('.answer_p').textContent;
      options.push(`${optLabel}. ${optContent}`);
    });

    // 构建题目对象
    const question = {
      id: div.getAttribute('data'),
      number: titleNumber,
      type: type,
      content: content,
      options: options
    };

    questions.push(question);
  });

  return questions;
}

// 创建浮动按钮和面板
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

  // 添加AI按钮
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    const button = document.createElement('button');
    button.textContent = `发送到 ${config.name}`;
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

  // 添加预览题目按钮
  const previewQuestionsButton = document.createElement('button');
  previewQuestionsButton.textContent = '预览题目列表';
  previewQuestionsButton.style.cssText = `
    width: 100%;
    padding: 8px;
    margin: 5px 0;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  previewQuestionsButton.addEventListener('click', showPreviewModal);
  panel.appendChild(previewQuestionsButton);

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

// 修改发送到AI的函数
function sendToAI(type) {
  const questions = extractQuestionsFromXXT();
  if (questions.length === 0) {
    alert('未找到题目');
    return;
  }

  // 将题目转换为文本格式
  const questionsText = questions.map(q => {
    let text = `${q.number} ${q.type}\n${q.content}`;
    if (q.options.length > 0) {
      text += '\n' + q.options.join('\n');
    }
    return text;
  }).join('\n\n');

  // 生成带提示词的完整问题
  const promptedQuestion = generatePrompt(questionsText);

  // 发送到AI
  chrome.runtime.sendMessage({
    type: 'GET_QUESTION',
    question: promptedQuestion,
    aiType: type
  });

  loadingState.updateUI(type, true);
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

// 题型分类配置
const QUESTION_TYPES = {
  'choice': {
    name: '选择题',
    subtypes: ['单选题', '多选题', '共用选项题']
  },
  'blank': {
    name: '填空题',
    subtypes: ['填空题', '选词填空']
  },
  'judge': {
    name: '判断题',
    subtypes: ['判断题']
  },
  'qa': {
    name: '问答题',
    subtypes: ['简答题', '名词解释', '论述题']
  },
  'calc': {
    name: '计算题',
    subtypes: ['计算题']
  },
  'sort': {
    name: '排序题',
    subtypes: ['排序题', '连线题']
  },
  'reading': {
    name: '阅读题',
    subtypes: ['阅读理解', '完型填空']
  },
  'oral': {
    name: '口语题',
    subtypes: ['口语题', '听力题']
  },
  'other': {
    name: '其他',
    subtypes: ['测评题', '选做题', '其它']
  }
};

// 显示题目预览
function showPreviewModal() {
  // 如果已存在则移除旧的模态框
  const existingModal = document.getElementById('questions-preview-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.id = 'questions-preview-modal';
  modal.style.cssText = `
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
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

  // 创建左侧题目列表和右侧答题卡的容器
  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    display: flex;
    flex: 1;
    overflow: hidden;
  `;

  // 左侧题目列表 - 只在这里声明一次
  const previewQuestionsContainer = document.createElement('div');
  previewQuestionsContainer.style.cssText = `
    flex: 1;
    padding: 20px 40px;
    padding-right: 260px;
    overflow-y: auto;
  `;

  // 右侧答题卡
  const answerCard = document.createElement('div');
  answerCard.className = 'answer-card';
  answerCard.style.cssText = `
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 220px;
    background: #f8f9fa;
    border-left: 1px solid #e0e0e0;
    padding: 20px 15px;
    overflow-y: auto;
    transition: transform 0.3s ease;
    z-index: 1;
  `;

  // 优化答题卡折叠按钮
  const collapseBtn = document.createElement('button');
  collapseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
  collapseBtn.style.cssText = `
    position: absolute;
    left: -16px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border-radius: 16px;
    border: 1px solid #e0e0e0;
    background: white;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    transition: all 0.3s ease;
  `;

  let isCollapsed = false;
  collapseBtn.onclick = () => {
    if (isCollapsed) {
      answerCard.style.transform = 'translateX(0)';
      collapseBtn.style.transform = 'translateY(-50%) rotate(0deg)';
    } else {
      answerCard.style.transform = 'translateX(calc(100% - 16px))';
      collapseBtn.style.transform = 'translateY(-50%) rotate(180deg)';
    }
    isCollapsed = !isCollapsed;
  };

  // 优化答题卡内容布局
  const answerCardContent = document.createElement('div');
  answerCardContent.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  // 添加答题卡标题
  const cardTitle = document.createElement('div');
  cardTitle.textContent = '答题卡';
  cardTitle.style.cssText = `
    font-size: 16px;
    font-weight: bold;
    color: #333;
    padding-bottom: 10px;
    border-bottom: 2px solid #4caf50;
    margin-bottom: 5px;
  `;
  answerCardContent.appendChild(cardTitle);

  // 修改题型区域样式
  Object.entries(QUESTION_TYPES).forEach(([type, config]) => {
    const questions = categorizedQuestions[type];
    if (questions.length === 0) return;

    const typeCard = document.createElement('div');
    typeCard.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    const typeHeader = document.createElement('div');
    typeHeader.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      color: #333;
      font-weight: 500;
    `;
    typeHeader.innerHTML = `
      <span>${config.name}</span>
      <span class="question-count">${questions.length}题</span>
    `;
    typeCard.appendChild(typeHeader);

    const buttonsGrid = document.createElement('div');
    buttonsGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
    `;

    questions.forEach((q, i) => {
      const btn = document.createElement('button');
      btn.textContent = i + 1;
      btn.className = 'answer-card-btn';
      btn.dataset.questionId = q.id;
      btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        background: white;
        color: #666;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      btn.addEventListener('mouseenter', () => {
        if (!btn.classList.contains('selected')) {
          btn.style.background = '#f5f5f5';
        }
      });

      btn.addEventListener('mouseleave', () => {
        if (!btn.classList.contains('selected')) {
          btn.style.background = 'white';
        }
      });

      btn.onclick = () => {
        const target = document.querySelector(`[data-id="${q.id}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.style.backgroundColor = '#e8f5e9';
          setTimeout(() => {
            target.style.backgroundColor = 'transparent';
          }, 1500);
        }
      };

      buttonsGrid.appendChild(btn);
    });

    typeCard.appendChild(buttonsGrid);
    answerCardContent.appendChild(typeCard);
  });

  answerCard.appendChild(collapseBtn);
  answerCard.appendChild(answerCardContent);

  // 获取并分类题目
  const questions = extractQuestionsFromXXT();
  const categorizedQuestions = {};

  // 初始化分类
  Object.keys(QUESTION_TYPES).forEach(type => {
    categorizedQuestions[type] = [];
  });

  // 对题目进行分类
  questions.forEach((q, index) => {
    const type = getQuestionType(q.type);
    if (categorizedQuestions[type]) {
      categorizedQuestions[type].push({ ...q, index });
    } else {
      categorizedQuestions.other.push({ ...q, index });
    }
  });

  // 渲染题目和答题卡
  Object.entries(QUESTION_TYPES).forEach(([type, config]) => {
    const questions = categorizedQuestions[type];
    if (questions.length === 0) return;

    const typeSection = document.createElement('div');
    typeSection.className = `question-type-section ${type}`;
    typeSection.style.cssText = `
      margin-bottom: 30px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      overflow: hidden;
    `;

    // 优化题型标题区域
    const typeHeader = document.createElement('div');
    typeHeader.style.cssText = `
      display: flex;
      align-items: center;
      padding: 15px 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #edf2f7;
    `;

    const typeCheckbox = document.createElement('input');
    typeCheckbox.type = 'checkbox';
    typeCheckbox.checked = true;
    typeCheckbox.className = `type-checkbox-${type}`;
    typeCheckbox.style.cssText = `
      width: 18px;
      height: 18px;
      margin-right: 12px;
      cursor: pointer;
    `;

    const typeTitle = document.createElement('span');
    typeTitle.textContent = `${config.name} (${questions.length}题)`;
    typeTitle.style.cssText = `
      font-size: 16px;
      font-weight: 500;
      color: #2d3748;
    `;

    typeHeader.appendChild(typeCheckbox);
    typeHeader.appendChild(typeTitle);
    typeSection.appendChild(typeHeader);

    // 添加题目列表
    const questionsWrapper = document.createElement('div');
    questionsWrapper.style.cssText = `
      padding: 0 20px;
    `;

    questions.forEach(q => {
      const questionDiv = createQuestionDiv(q);
      questionsWrapper.appendChild(questionDiv);
    });

    typeSection.appendChild(questionsWrapper);
    previewQuestionsContainer.appendChild(typeSection);
  });

  // 修改发送按钮事件处理
  sendSelectedButton.onclick = () => {
    const selectedQuestions = [];
    document.querySelectorAll('.question-checkbox:checked').forEach(cb => {
      const questionDiv = cb.closest('.question-item');
      const questionId = questionDiv.dataset.id;
      const question = questions.find(q => q.id === questionId);
      if (question) {
        selectedQuestions.push(question);
      }
    });

    if (selectedQuestions.length === 0) {
      alert('请至少选择一个题目');
      return;
    }

    // 获取选中的模式提示词
    const selectedMode = document.querySelector('input[name="answer-mode"]:checked');
    const prompt = selectedMode.value;

    // 组装完整问题
    const questionsText = selectedQuestions.map(q => {
      let text = `${q.number} ${q.type}\n${q.content}`;
      if (q.options.length > 0) {
        text += '\n' + q.options.join('\n');
      }
      return text;
    }).join('\n\n');

    const fullQuestion = prompt + '\n\n' + questionsText;

    // 发送到所有AI
    Object.keys(AI_CONFIG).forEach(aiType => {
      chrome.runtime.sendMessage({
        type: 'GET_QUESTION',
        aiType: aiType,
        question: fullQuestion
      });
      loadingState.updateUI(aiType, true);
    });

    modal.remove();
  };

  contentWrapper.appendChild(previewQuestionsContainer);
  contentWrapper.appendChild(answerCard);
  previewContent.appendChild(contentWrapper);

  // 创建头部区域
  const previewHeader = document.createElement('div');
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
  closePreviewButton.onclick = () => modal.remove();

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

  // 组装头部
  previewHeader.appendChild(selectAllLabel);        // 左侧
  previewHeader.appendChild(modeSelection);         // 中间靠右
  previewHeader.appendChild(actionButtons);         // 最右侧

  previewContent.appendChild(previewHeader);
  modal.appendChild(previewContent);
  document.body.appendChild(modal);
}

// 创建题目div
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

// 获取题目类型
function getQuestionType(typeStr) {
  for (const [type, config] of Object.entries(QUESTION_TYPES)) {
    if (config.subtypes.some(subtype => typeStr.includes(subtype))) {
      return type;
    }
  }
  return 'other';
}

// 更新答题卡状态
function updateAnswerCard() {
  const buttons = document.querySelectorAll('.answer-card-btn');
  buttons.forEach(btn => {
    const questionId = btn.dataset.questionId;
    const checkbox = document.querySelector(`[data-id="${questionId}"] .question-checkbox`);
    if (checkbox && checkbox.checked) {
      btn.style.background = '#4caf50';
      btn.style.color = 'white';
      btn.style.borderColor = '#4caf50';
    } else {
      btn.style.background = 'white';
      btn.style.color = '#666';
      btn.style.borderColor = '#ddd';
    }
  });
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

// 创建题目展示卡片
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

// 初始化题目展示页面
function initQuestionPage() {
  // 提取题目
  const questions = extractQuestionsFromXXT();

  // 创建容器
  const container = document.createElement('div');
  container.id = 'questions-container';
  container.style.cssText = `
    max-width: 800px;
    margin: 20px auto;
    padding: 20px;
  `;

  // 创建操作按钮区
  const actionBar = document.createElement('div');
  actionBar.style.cssText = `
    display: flex;
    justify-content: space-between;
    margin-bottom: 20px;
  `;

  // 添加预览按钮
  const previewBtn = document.createElement('button');
  previewBtn.textContent = '预览并发送';
  previewBtn.onclick = showPreviewModal;
  previewBtn.style.cssText = `
    padding: 8px 16px;
    background: #4caf50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;

  actionBar.appendChild(previewBtn);
  container.appendChild(actionBar);

  // 添加题目卡片
  questions.forEach(q => {
    const card = createQuestionCard(q);
    container.appendChild(card);
  });

  // 清空并添加新内容
  document.body.innerHTML = '';
  document.body.appendChild(container);
}

// 在页面加载完成后初始化
window.addEventListener('load', () => {
  // 检查是否在学习通题目页面
  if (document.querySelector('.questionLi')) {
    createFloatingPanel();
  }
}); 