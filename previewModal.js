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
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  `;

  // 创建头部区域
  const previewHeader = document.createElement('div');
  previewHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding: 0 20px;
    border-bottom: 1px solid #eee;
    padding-bottom: 15px;
  `;

  // 创建模式选择区域
  const modeSelection = document.createElement('div');
  modeSelection.style.cssText = `
    display: flex;
    align-items: center;
    gap: 20px;
  `;

  // 添加模式选择按钮
  ANSWER_MODES.forEach(mode => {
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
    radio.checked = mode.id === 'concise';

    const span = document.createElement('span');
    span.textContent = mode.label;
    span.style.cssText = `
      font-size: 14px;
      color: #333;
    `;

    label.appendChild(radio);
    label.appendChild(span);
    modeSelection.appendChild(label);
  });

  // 创建按钮区域
  const actionButtons = document.createElement('div');
  actionButtons.style.cssText = `
    display: flex;
    gap: 10px;
  `;

  const closeButton = document.createElement('button');
  closeButton.textContent = '关闭';
  closeButton.style.cssText = `
    padding: 8px 16px;
    background: #666;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  `;
  closeButton.onclick = () => modal.remove();

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

  actionButtons.appendChild(closeButton);
  actionButtons.appendChild(sendSelectedButton);

  // 组装头部
  previewHeader.appendChild(modeSelection);
  previewHeader.appendChild(actionButtons);

  // 创建内容区域
  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    display: flex;
    flex: 1;
    overflow: hidden;
    gap: 20px;
    padding: 0 20px;
  `;

  // 左侧答题卡
  const answerCard = document.createElement('div');
  answerCard.className = 'answer-card';
  answerCard.style.cssText = `
    width: 200px;
    background: #f8f9fa;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    padding: 15px;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    flex-shrink: 0;
    margin-right: 20px;
  `;

  // 右侧题目列表
  const questionsContainer = document.createElement('div');
  questionsContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;

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
    const typeQuestions = categorizedQuestions[type];
    if (typeQuestions.length === 0) return;

    // 创建题型区域
    const typeSection = document.createElement('div');
    typeSection.className = `question-type-section ${type}`;
    typeSection.style.cssText = `
      margin-bottom: 30px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      overflow: hidden;
    `;

    // 题型标题和全选
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
    typeCheckbox.addEventListener('change', (e) => {
      const checkboxes = typeSection.querySelectorAll('.question-checkbox');
      checkboxes.forEach(cb => cb.checked = e.target.checked);
      updateAnswerCard();
    });

    const typeTitle = document.createElement('span');
    typeTitle.textContent = `${config.name} (${typeQuestions.length}题)`;
    typeTitle.style.cssText = `
      font-size: 18px;
      font-weight: 500;
      color: #2d3748;
    `;

    typeHeader.appendChild(typeCheckbox);
    typeHeader.appendChild(typeTitle);
    typeSection.appendChild(typeHeader);

    // 添加题目列表
    typeQuestions.forEach(q => {
      const questionDiv = createQuestionDiv(q);
      typeSection.appendChild(questionDiv);
    });

    questionsContainer.appendChild(typeSection);

    // 添加到答题卡
    const typeCard = document.createElement('div');
    typeCard.style.cssText = `
      margin-bottom: 15px;
    `;

    const typeCardTitle = document.createElement('div');
    typeCardTitle.textContent = config.name;
    typeCardTitle.style.cssText = `
      font-weight: 500;
      margin-bottom: 8px;
      color: #2d3748;
      font-size: 14px;
    `;
    typeCard.appendChild(typeCardTitle);

    const buttonsGrid = document.createElement('div');
    buttonsGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
    `;

    typeQuestions.forEach((q, i) => {
      const btn = document.createElement('button');
      btn.textContent = q.number.replace(/\./g, '');
      btn.className = 'answer-card-btn';
      btn.dataset.questionId = q.id;
      btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: 1px solid #4caf50;
        border-radius: 4px;
        background: #4caf50;
        color: white;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

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
    answerCard.appendChild(typeCard);
  });

  // 修改发送按钮的点击事件处理
  sendSelectedButton.onclick = () => {
    try {
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
      if (!selectedMode) {
        alert('请选择回答模式');
        return;
      }

      const prompt = selectedMode.value;

      // 组装完整问题
      const questionsText = selectedQuestions.map(q => {
        let text = `${q.number} ${q.type}\n${q.content}`;
        if (q.options.length > 0) {
          text += '\n' + q.options.join('\n');
        }
        if (q.type.includes('填空') && q.blankCount > 0) {
          text += `\n(本题共有 ${q.blankCount} 个空)`;
        }
        return text;
      }).join('\n\n');

      // 在发送前显示 AI 配置对话框
      showAIConfigModal(() => {
        const fullQuestion = prompt + '\n\n' + questionsText;

        // 先创建答案模态框
        if (!document.getElementById('ai-answers-modal')) {
          showAnswersModal();
        }

        // 保存当前问题以供重发使用
        const answersModal = document.getElementById('ai-answers-modal');
        if (answersModal) {
          answersModal.dataset.currentQuestion = fullQuestion;
        }

        // 立即关闭题目列表模态框
        modal.remove();

        // 只发送到启用的 AI
        Object.entries(AI_CONFIG)
          .filter(([_, config]) => config.enabled)
          .forEach(([aiType]) => {
            sendToAI(aiType, fullQuestion);
          });
      });

    } catch (error) {
      console.error('处理发送请求时出错:', error);
      alert('发送失败，请刷新页面后重试');
    }
  };

  contentWrapper.appendChild(answerCard);
  contentWrapper.appendChild(questionsContainer);
  previewContent.appendChild(previewHeader);
  previewContent.appendChild(contentWrapper);
  modal.appendChild(previewContent);
  document.body.appendChild(modal);

  // 在模态框创建完成后立即更新状态
  modal.addEventListener('DOMContentLoaded', () => {
    updateAnswerCard();
    // 更新所有题型的全选框状态
    Object.keys(QUESTION_TYPES).forEach(type => {
      const typeSection = document.querySelector(`.question-type-section.${type}`);
      if (typeSection) {
        const typeCheckbox = typeSection.querySelector('input[type="checkbox"]');
        if (typeCheckbox) {
          updateTypeCheckbox(type);
        }
      }
    });
  });
}

// 更新答题卡状态
function updateAnswerCard() {
  const buttons = document.querySelectorAll('.answer-card-btn');
  buttons.forEach(btn => {
    const questionId = btn.dataset.questionId;
    const checkbox = document.querySelector(`[data-id="${questionId}"] .question-checkbox`);
    if (checkbox && checkbox.checked) {
      btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: 1px solid #4caf50;
        border-radius: 4px;
        background: #4caf50;
        color: white;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
    } else {
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
    }
  });
}

// 修改创建题目 div 的部分
function createQuestionDiv(q) {
  const div = document.createElement('div');
  div.className = 'question-item';
  div.dataset.id = q.id;
  div.style.cssText = `
    padding: 15px 20px;
    border-bottom: 1px solid #edf2f7;
    cursor: pointer;
    font-size: 16px;
    line-height: 1.6;
  `;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'question-checkbox';
  checkbox.checked = true; // 默认选中
  checkbox.style.cssText = `
    width: 18px;
    height: 18px;
    margin-right: 12px;
    cursor: pointer;
    vertical-align: top;
    margin-top: 3px;
  `;

  // 监听复选框变化
  checkbox.addEventListener('change', () => {
    updateTypeCheckbox(q.type);
    updateAnswerCard();
  });

  // 点击整个容器都可以选择
  div.addEventListener('click', (e) => {
    if (e.target !== checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    }
  });

  div.appendChild(checkbox);
  div.appendChild(createQuestionContent(q));
  return div;
}

// 更新题型全选框状态
function updateTypeCheckbox(type) {
  const typeSection = document.querySelector(`.question-type-section.${getQuestionType(type)}`);
  if (!typeSection) return;

  const typeCheckbox = typeSection.querySelector(`input[type="checkbox"]`);
  const questionCheckboxes = typeSection.querySelectorAll('.question-checkbox');
  const checkedCount = Array.from(questionCheckboxes).filter(cb => cb.checked).length;

  if (checkedCount === 0) {
    typeCheckbox.checked = false;
    typeCheckbox.indeterminate = false;
  } else if (checkedCount === questionCheckboxes.length) {
    typeCheckbox.checked = true;
    typeCheckbox.indeterminate = false;
  } else {
    typeCheckbox.checked = false;
    typeCheckbox.indeterminate = true;
  }
}

// 创建题目内容
function createQuestionContent(q) {
  const content = document.createElement('div');
  content.style.cssText = `
    display: inline-block;
    vertical-align: top;
    width: calc(100% - 30px);
  `;

  // 题号和类型
  const header = document.createElement('div');
  header.style.cssText = `
    margin-bottom: 8px;
    color: #666;
    font-size: 14px;
  `;
  header.textContent = `${q.number} ${q.type}`;
  content.appendChild(header);

  // 题目内容
  const questionText = document.createElement('div');
  questionText.style.cssText = `
    margin-bottom: 8px;
    color: #2d3748;
  `;
  questionText.textContent = q.content;
  content.appendChild(questionText);

  // 如果有选项，添加选项
  if (q.options && q.options.length > 0) {
    const optionsDiv = document.createElement('div');
    optionsDiv.style.cssText = `
      color: #4a5568;
      padding-left: 20px;
    `;
    q.options.forEach(option => {
      const optionDiv = document.createElement('div');
      optionDiv.textContent = option;
      optionsDiv.appendChild(optionDiv);
    });
    content.appendChild(optionsDiv);
  }

  // 如果是填空题，显示空的数量
  if (q.type.includes('填空') && q.blankCount > 0) {
    const blankInfo = document.createElement('div');
    blankInfo.style.cssText = `
      color: #718096;
      font-size: 14px;
      margin-top: 8px;
    `;
    blankInfo.textContent = `共 ${q.blankCount} 个空`;
    content.appendChild(blankInfo);
  }

  return content;
} 