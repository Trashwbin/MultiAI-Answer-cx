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

  // 初始化所有题型的分类
  Object.values(window.QUESTION_TYPES).forEach(type => {
    categorizedQuestions[type] = [];
  });

  // 对题目进行分类
  questions.forEach((q, index) => {
    const type = q.questionType || window.QUESTION_TYPES.OTHER;
    if (!categorizedQuestions[type]) {
      categorizedQuestions[type] = [];
    }
    categorizedQuestions[type].push({ ...q, index });
  });

  // 渲染题目和答题卡
  Object.entries(window.QUESTION_TYPES_CONFIG).forEach(([type, config]) => {
    // 确保 typeQuestions 存在
    const typeQuestions = categorizedQuestions[type] || [];
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

    // 题型标题和全选（只为非"其他"类型添加全选框）
    const typeHeader = document.createElement('div');
    typeHeader.style.cssText = `
      display: flex;
      align-items: center;
      padding: 15px 20px;
      background: #f8f9fa;
      border-bottom: 1px solid #edf2f7;
    `;

    if (type !== window.QUESTION_TYPES.OTHER) {
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
      typeHeader.appendChild(typeCheckbox);
    }

    const typeTitle = document.createElement('span');
    typeTitle.textContent = `${config.name} (${typeQuestions.length}题)`;
    typeTitle.style.cssText = `
      font-size: 18px;
      font-weight: 500;
      color: #2d3748;
    `;

    typeHeader.appendChild(typeTitle);
    typeSection.appendChild(typeHeader);

    // 添加题目列表
    typeQuestions.forEach(q => {
      const questionDiv = createQuestionDiv(q);
      typeSection.appendChild(questionDiv);
    });

    questionsContainer.appendChild(typeSection);

    // 只为非"其他"类型添加答题卡
    if (type !== window.QUESTION_TYPES.OTHER) {
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
    }
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

      // 在发送前显示 AI 配置对话框
      showAIConfigModal(async () => {
        try {
          // 从 storage 获取最新的配置
          const result = await chrome.storage.local.get(['ANSWER_MODE', 'ANSWER_MODE_TYPE']);
          const prompt = result.ANSWER_MODE;

          if (!prompt) {
            alert('未找到回答模式配置');
            return;
          }

          // 组装完整问题
          const questionsText = selectedQuestions.map(q => {
            let text = `${q.number} ${q.type}\n${q.content}`;
            if (q.options.length > 0) {
              text += '\n' + q.options.join('\n');
            }
            // 如果是填空题，添加空的数量信息
            if (q.questionType === window.QUESTION_TYPES.FILL_BLANK && q.blankCount > 0) {
              text += `\n(本题共有 ${q.blankCount} 个空，请按顺序填写)`;
            }
            return text;
          }).join('\n\n');

          const fullQuestion = prompt + '\n\n' + questionsText;

          // 获取启用的 AI 列表
          const enabledAIs = Object.entries(AI_CONFIG).filter(([_, config]) => config.enabled);

          // 如果答案模态框已存在，先移除它
          const existingModal = document.getElementById('ai-answers-modal');
          if (existingModal && existingModal.parentNode) {
            existingModal.parentNode.removeChild(existingModal);
          }

          // 保存选中的题目列表到 window 对象
          window.selectedQuestions = selectedQuestions;

          // 创建新的答案模态框
          await showAnswersModal();

          // 保存当前问题以供重发使用
          const answersModal = document.getElementById('ai-answers-modal');
          if (answersModal) {
            answersModal.dataset.currentQuestion = fullQuestion;
          }

          // 立即关闭题目列表模态框
          if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }

          sendToAllAIs();
        } catch (error) {
          console.error('处理发送请求时出错:', error);
          alert('发送失败，请刷新页面后重试' + error.message);
        }
      });

    } catch (error) {
      console.error('处理发送请求时出错:', error);
      alert('发送失败，请刷新页面后重试' + error.message);
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

  // 只为非"其他"类型的题目添加复选框
  if (q.questionType !== window.QUESTION_TYPES.OTHER) {
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
  }

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
  const container = document.createElement('div');
  container.style.cssText = `
    display: inline-block;
    vertical-align: top;
    width: calc(100% - 30px);
  `;

  // 题目标题
  const titleDiv = document.createElement('div');
  titleDiv.style.cssText = `
    margin-bottom: 8px;
    color: #666;
    font-size: 14px;
  `;
  titleDiv.textContent = `${q.originalNumber} ${q.type}`;
  container.appendChild(titleDiv);

  // 题目内容
  const contentDiv = document.createElement('div');
  contentDiv.style.cssText = `
    margin-bottom: 8px;
    color: #2D3748;
  `;
  contentDiv.textContent = q.content;
  container.appendChild(contentDiv);

  // 根据题型展示不同内容
  switch (q.questionType) {
    case window.QUESTION_TYPES.SINGLE_CHOICE:
    case window.QUESTION_TYPES.MULTIPLE_CHOICE:
      // 选择题选项
      const optionsDiv = document.createElement('div');
      optionsDiv.style.cssText = `
        color: #4A5568;
        padding-left: 20px;
      `;
      q.options.forEach(option => {
        const optionDiv = document.createElement('div');
        optionDiv.style.cssText = `
          margin-bottom: 4px;
          line-height: 1.4;
        `;
        optionDiv.textContent = option;
        optionsDiv.appendChild(optionDiv);
      });
      container.appendChild(optionsDiv);
      break;

    case window.QUESTION_TYPES.FILL_BLANK:
      // 填空题空数显示
      if (q.blankCount > 0) {
        const blankInfo = document.createElement('div');
        blankInfo.style.cssText = `
          color: #718096;
          font-size: 14px;
          margin-top: 8px;
        `;
        blankInfo.textContent = `本题共有 ${q.blankCount} 个空`;
        container.appendChild(blankInfo);
      }
      break;

    case window.QUESTION_TYPES.CLOZE:
      // 完形填空题子题目
      if (q.subQuestions && q.subQuestions.length > 0) {
        const subQuestionsDiv = document.createElement('div');
        subQuestionsDiv.style.cssText = `
          margin-top: 12px;
          padding-left: 20px;
        `;
        q.subQuestions.forEach((subQ, idx) => {
          const subQDiv = document.createElement('div');
          subQDiv.style.cssText = `
            margin-bottom: 12px;
          `;
          subQDiv.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 4px;">第 ${idx + 1} 空：</div>
            <div style="color: #4A5568;">${subQ.content}</div>
          `;
          if (subQ.options && subQ.options.length > 0) {
            const optionsDiv = document.createElement('div');
            optionsDiv.style.cssText = `
              padding-left: 16px;
              margin-top: 4px;
            `;
            subQ.options.forEach(opt => {
              const optDiv = document.createElement('div');
              optDiv.textContent = opt;
              optionsDiv.appendChild(optDiv);
            });
            subQDiv.appendChild(optionsDiv);
          }
          subQuestionsDiv.appendChild(subQDiv);
        });
        container.appendChild(subQuestionsDiv);
      }
      break;

    case window.QUESTION_TYPES.READING:
      // 阅读理解子题目
      if (q.subQuestions && q.subQuestions.length > 0) {
        const subQuestionsDiv = document.createElement('div');
        subQuestionsDiv.style.cssText = `
          margin-top: 16px;
          border-top: 1px solid #E2E8F0;
          padding-top: 12px;
        `;
        q.subQuestions.forEach((subQ, idx) => {
          const subQDiv = document.createElement('div');
          subQDiv.style.cssText = `
            margin-bottom: 16px;
          `;
          subQDiv.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 8px;">问题 ${idx + 1}：${subQ.content}</div>
          `;
          if (subQ.options && subQ.options.length > 0) {
            const optionsDiv = document.createElement('div');
            optionsDiv.style.cssText = `
              padding-left: 20px;
            `;
            subQ.options.forEach(opt => {
              const optDiv = document.createElement('div');
              optDiv.style.marginBottom = '4px';
              optDiv.textContent = opt;
              optionsDiv.appendChild(optDiv);
            });
            subQDiv.appendChild(optionsDiv);
          }
          subQuestionsDiv.appendChild(subQDiv);
        });
        container.appendChild(subQuestionsDiv);
      }
      break;

    case window.QUESTION_TYPES.WORD_SELECTION:
      // 选词填空词库
      if (q.options && q.options.length > 0) {
        const wordBankDiv = document.createElement('div');
        wordBankDiv.style.cssText = `
          margin-top: 12px;
          padding: 12px;
          background: #F7FAFC;
          border-radius: 6px;
        `;
        wordBankDiv.innerHTML = `
          <div style="font-weight: 500; margin-bottom: 8px;">词库：</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${q.options.map(word => `
              <span style="
                padding: 4px 8px;
                background: white;
                border: 1px solid #E2E8F0;
                border-radius: 4px;
                font-size: 14px;
              ">${word}</span>
            `).join('')}
          </div>
        `;
        container.appendChild(wordBankDiv);
      }
      break;

    case window.QUESTION_TYPES.SHARED_OPTIONS:
      // 共用选项题选项
      if (q.options && q.options.length > 0) {
        const sharedOptionsDiv = document.createElement('div');
        sharedOptionsDiv.style.cssText = `
          margin-top: 12px;
          padding: 12px;
          background: #F7FAFC;
          border-radius: 6px;
        `;
        sharedOptionsDiv.innerHTML = `
          <div style="font-weight: 500; margin-bottom: 8px;">共用选项：</div>
          <div style="padding-left: 16px;">
            ${q.options.map(opt => `
              <div style="margin-bottom: 4px;">${opt}</div>
            `).join('')}
          </div>
        `;
        container.appendChild(sharedOptionsDiv);
      }
      break;
  }

  return container;
} 