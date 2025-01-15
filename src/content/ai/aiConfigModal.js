function showAIConfigModal(callback) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10001;
    backdrop-filter: blur(3px);
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 12px;
    width: 1000px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    animation: modalFadeIn 0.3s ease;
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: auto auto;
    gap: 16px;
  `;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes modalFadeIn {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  // 左侧配置区域
  const leftPanel = document.createElement('div');
  leftPanel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
  `;

  const title = document.createElement('h3');
  title.textContent = 'AI 配置';
  title.style.cssText = `
    margin: 0;
    padding-bottom: 16px;
    border-bottom: 1px solid #eee;
    font-size: 20px;
    color: #1a1a1a;
    font-weight: 600;
  `;

  // 创建通用的配置区域样式
  const createConfigSection = (title, description = '') => {
    const section = document.createElement('div');
    section.style.cssText = `
      background: #f8f9fa;
      border-radius: 8px;
      padding: 12px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      margin-bottom: 8px;
    `;

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.cssText = `
      font-weight: 600;
      color: #2d3748;
      font-size: 16px;
      margin-bottom: ${description ? '8px' : '0'};
    `;

    header.appendChild(titleEl);

    if (description) {
      const desc = document.createElement('div');
      desc.textContent = description;
      desc.style.cssText = `
        font-size: 14px;
        color: #718096;
      `;
      header.appendChild(desc);
    }

    section.appendChild(header);
    return section;
  };

  // 创建通用的选项标签样式
  const createOptionLabel = (isSelected = false) => {
    const label = document.createElement('label');
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: ${isSelected ? '#e9ecef' : 'white'};
      border: 1px solid ${isSelected ? '#4a5568' : '#e2e8f0'};
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      user-select: none;
      position: relative;

      &:hover {
        background: #e9ecef;
        border-color: #4a5568;
      }
    `;

    // 添加点击事件更新样式
    label.addEventListener('click', () => {
      // 获取同组的所有标签
      const groupLabels = label.closest('.option-list').querySelectorAll('label');
      // 更新所有标签样式
      groupLabels.forEach(l => {
        l.style.background = 'white';
        l.style.borderColor = '#e2e8f0';
      });
      // 更新当前标签样式
      label.style.background = '#e9ecef';
      label.style.borderColor = '#4a5568';
    });

    return label;
  };

  // 创建通用的选项样式
  const createOptionList = () => {
    const list = document.createElement('div');
    list.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    list.className = 'option-list';  // 添加类名以便选择器查找
    return list;
  };

  // 运行模式部分
  const runModeSection = createConfigSection('运行模式', '选择 AI 的运行方式');
  const runModeList = createOptionList();

  Object.values(window.RUN_MODES).forEach(mode => {
    const label = createOptionLabel(mode.id === 'stable');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'run-mode';
    radio.value = mode.id;
    radio.checked = mode.id === 'stable';
    radio.style.cssText = `
      width: 16px;
      height: 16px;
      accent-color: #4a5568;
    `;

    const span = document.createElement('span');
    span.textContent = mode.name;
    span.style.cssText = `
      font-size: 14px;
      color: #2d3748;
    `;

    const tooltip = document.createElement('div');
    tooltip.textContent = mode.description;
    tooltip.style.cssText = `
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #2d3748;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);

      &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #2d3748;
      }
    `;

    label.appendChild(radio);
    label.appendChild(span);
    label.appendChild(tooltip);

    label.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
    label.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    runModeList.appendChild(label);
  });

  runModeSection.appendChild(runModeList);

  // 对话策略部分
  const chatStrategySection = createConfigSection('对话策略', '选择与 AI 的对话方式');
  const chatStrategyList = createOptionList();

  Object.values(window.CHAT_STRATEGIES).forEach(strategy => {
    const label = createOptionLabel(strategy.id === 'single');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'chat-strategy';
    radio.value = strategy.id;
    radio.checked = strategy.id === 'single';
    radio.style.cssText = `
      width: 16px;
      height: 16px;
      accent-color: #4a5568;
    `;

    const span = document.createElement('span');
    span.textContent = strategy.name;
    span.style.cssText = `
      font-size: 14px;
      color: #2d3748;
    `;

    const tooltip = document.createElement('div');
    tooltip.textContent = strategy.description;
    tooltip.style.cssText = `
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #2d3748;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);

      &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #2d3748;
      }
    `;

    label.appendChild(radio);
    label.appendChild(span);
    label.appendChild(tooltip);

    label.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
    label.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    chatStrategyList.appendChild(label);
  });

  chatStrategySection.appendChild(chatStrategyList);

  // 添加左侧配置区域
  leftPanel.appendChild(title);
  leftPanel.appendChild(runModeSection);
  leftPanel.appendChild(chatStrategySection);

  // 右侧 AI 选择区域
  const rightPanel = document.createElement('div');
  rightPanel.style.cssText = `
    background: #f8f9fa;
    border-radius: 12px;
    padding: 16px;
  `;

  const aiTitle = document.createElement('div');
  aiTitle.textContent = 'AI 选择';
  aiTitle.style.cssText = `
    font-weight: 600;
    color: #2d3748;
    font-size: 16px;
    margin-bottom: 8px;
  `;

  const aiDesc = document.createElement('div');
  aiDesc.textContent = '选择要启用的 AI 并设置权重';
  aiDesc.style.cssText = `
    font-size: 14px;
    color: #718096;
    margin-bottom: 16px;
  `;

  // 创建权重选择器
  const weightSelector = document.createElement('div');
  weightSelector.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #2d3748;
    border-radius: 8px;
    color: white;
    margin-bottom: 16px;
  `;

  const weightLabel = document.createElement('div');
  weightLabel.textContent = '权重 AI:';
  weightLabel.style.cssText = `
    font-size: 14px;
    font-weight: 500;
  `;

  const weightSelect = document.createElement('select');
  weightSelect.style.cssText = `
    flex: 1;
    padding: 6px 12px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 14px;
    cursor: pointer;
    outline: none;
    transition: all 0.2s;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 28px;

    &:hover {
      background-color: rgba(255, 255, 255, 0.15);
    }

    &:focus {
      border-color: rgba(255, 255, 255, 0.3);
      background-color: rgba(255, 255, 255, 0.2);
    }
  `;

  // 添加全局样式以修复下拉选项的背景色
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    #weight-select {
      background-color: rgba(255, 255, 255, 0.1);
    }
    #weight-select option {
      background-color: #2d3748;
      color: white;
      padding: 8px;
    }
    #weight-select option:disabled {
      color: rgba(255, 255, 255, 0.5);
      background-color: #1a202c;
    }
  `;
  document.head.appendChild(styleSheet);

  weightSelect.id = 'weight-select';  // 添加 ID 以匹配样式

  // 添加默认选项
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '请选择权重 AI';
  defaultOption.style.cssText = `
    color: rgba(255, 255, 255, 0.7);
  `;
  weightSelect.appendChild(defaultOption);

  // AI 卡片网格容器
  const aiGrid = document.createElement('div');
  aiGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  `;

  // AI 卡片列表
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    // 添加到权重选择器
    const option = document.createElement('option');
    option.value = aiType;
    option.textContent = config.name;
    if (config.weight > 1) {
      option.selected = true;
    }
    weightSelect.appendChild(option);

    // 创建 AI 卡片
    const aiCard = document.createElement('div');
    aiCard.style.cssText = `
      position: relative;
      padding: 12px;
      background: white;
      border: 2px solid ${config.enabled ? config.color : '#e2e8f0'};
      border-radius: 12px;
      transition: all 0.2s;
      cursor: pointer;
      overflow: hidden;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }

      ${config.weight > 1 ? `
        &::before {
          content: '权重 AI';
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 2px 8px;
          background: ${config.color};
          color: white;
          font-size: 12px;
          border-radius: 4px;
          opacity: 0.9;
        }
      ` : ''}
    `;

    // 创建内容容器
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    // AI 名称和图标
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const nameWrapper = document.createElement('div');
    nameWrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    const aiIcon = document.createElement('div');
    aiIcon.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: ${config.color}20;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: ${config.color};
    `;
    aiIcon.textContent = config.name[0];

    const nameLabel = document.createElement('div');
    nameLabel.textContent = config.name;
    nameLabel.style.cssText = `
      font-weight: 500;
      color: ${config.enabled ? config.color : '#94a3b8'};
      font-size: 16px;
    `;

    const enableCheck = document.createElement('input');
    enableCheck.type = 'checkbox';
    enableCheck.checked = config.enabled;
    enableCheck.style.cssText = `
      width: 20px;
      height: 20px;
      accent-color: ${config.color};
    `;

    // 更新权重选择器状态
    const updateWeightSelector = () => {
      if (!config.enabled && weightSelect.value === aiType) {
        weightSelect.value = '';
        Object.values(AI_CONFIG).forEach(c => c.weight = 1);
      }
      weightSelect.querySelector(`option[value="${aiType}"]`).disabled = !config.enabled;
    };

    // 更新卡片样式
    const updateCardStyle = () => {
      aiCard.style.border = `2px solid ${config.enabled ? config.color : '#e2e8f0'}`;
      aiCard.style.opacity = config.enabled ? '1' : '0.6';
      nameLabel.style.color = config.enabled ? config.color : '#94a3b8';
    };

    // 点击卡片切换启用状态
    aiCard.onclick = (e) => {
      if (e.target !== enableCheck) {
        enableCheck.checked = !enableCheck.checked;
        config.enabled = enableCheck.checked;
        updateCardStyle();
        updateWeightSelector();
      }
    };

    // 复选框状态改变
    enableCheck.onchange = (e) => {
      e.stopPropagation();
      config.enabled = enableCheck.checked;
      updateCardStyle();
      updateWeightSelector();
    };

    // 初始化卡片样式
    updateCardStyle();
    updateWeightSelector();

    nameWrapper.appendChild(aiIcon);
    nameWrapper.appendChild(nameLabel);
    header.appendChild(nameWrapper);
    header.appendChild(enableCheck);
    contentWrapper.appendChild(header);
    aiCard.appendChild(contentWrapper);
    aiGrid.appendChild(aiCard);
  });

  // 权重选择器事件处理
  weightSelect.onchange = () => {
    const selectedAiType = weightSelect.value;
    // 重置所有 AI 权重
    Object.values(AI_CONFIG).forEach(c => c.weight = 1);
    // 设置选中的 AI 权重
    if (selectedAiType) {
      AI_CONFIG[selectedAiType].weight = 2;
    }
  };

  weightSelector.appendChild(weightLabel);
  weightSelector.appendChild(weightSelect);

  rightPanel.appendChild(aiTitle);
  rightPanel.appendChild(aiDesc);
  rightPanel.appendChild(weightSelector);
  rightPanel.appendChild(aiGrid);

  // 按钮区域
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #eee;
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    color: #4a5568;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;

    &:hover {
      background: #f8f9fa;
      border-color: #cbd5e0;
    }
  `;
  cancelBtn.onclick = () => modal.remove();

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确定';
  confirmBtn.style.cssText = `
    padding: 8px 24px;
    border: none;
    border-radius: 6px;
    background: #4caf50;
    color: white;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s;

    &:hover {
      background: #43a047;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  `;

  // 修改确认按钮的点击事件处理
  confirmBtn.onclick = async () => {
    try {
      // 获取选中的运行模式、对话策略和回答模式
      const selectedMode = document.querySelector('input[name="run-mode"]:checked').value;
      const selectedStrategy = document.querySelector('input[name="chat-strategy"]:checked').value;
      const selectedAnswerMode = document.querySelector('input[name="answer-mode"]:checked');

      // 检查是否至少选择了一个 AI
      const hasEnabledAI = Object.values(window.AI_CONFIG).some(config => config.enabled);
      if (!hasEnabledAI) {
        showNotification('请至少选择一个 AI', 'warning');
        return;
      }

      // 检查是否选择了权重 AI
      const hasWeightAI = Object.values(window.AI_CONFIG).some(config => config.weight > 1);
      if (!hasWeightAI) {
        showNotification('请选择一个权重 AI', 'warning');
        return;
      }

      // 获取实际的提示词内容
      let actualPrompt;
      if (selectedAnswerMode.id === 'custom') {
        actualPrompt = customPromptInput.value; // 使用存储的自定义提示词值
      } else {
        actualPrompt = window.ANSWER_MODES.find(mode => mode.id === selectedAnswerMode.id).prompt;
      }

      // 保存配置
      await chrome.storage.local.set({
        'AI_CONFIG': window.AI_CONFIG,
        'RUN_MODE': selectedMode,
        'CHAT_STRATEGY': selectedStrategy,
        'ANSWER_MODE': actualPrompt,
        'ANSWER_MODE_TYPE': selectedAnswerMode.id
      });

      // 关闭配置模态框
      modal.remove();

      // 如果有回调函数，执行它
      if (callback) callback();
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  buttons.appendChild(cancelBtn);
  buttons.appendChild(confirmBtn);

  // 回答模式部分
  const answerModeSection = createConfigSection('回答模式', '选择 AI 的回答方式');
  answerModeSection.style.cssText = `
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
  `;

  const modeList = document.createElement('div');
  modeList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 200px;
  `;
  modeList.className = 'option-list';

  // 获取简洁模式的提示词作为默认值
  const defaultPrompt = window.ANSWER_MODES.find(mode => mode.id === 'concise').prompt;

  // 创建提示词显示区域
  const promptContainer = document.createElement('div');
  promptContainer.style.cssText = `
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
    height: 150px;
    display: flex;
    flex-direction: column;
  `;

  const promptHeader = document.createElement('div');
  promptHeader.style.cssText = `
    padding: 8px 12px;
    background: #f8f9fa;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13px;
    color: #4a5568;
    font-weight: 500;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;

  const headerText = document.createElement('span');
  headerText.textContent = '提示词预览';

  const editButton = document.createElement('button');
  editButton.textContent = '编辑';
  editButton.style.cssText = `
    padding: 2px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: white;
    color: #4a5568;
    font-size: 12px;
    cursor: pointer;
    
    &:hover {
      background: #f8f9fa;
    }
  `;

  promptHeader.appendChild(headerText);
  promptHeader.appendChild(editButton);

  const promptContent = document.createElement('div');
  promptContent.style.cssText = `
    padding: 12px;
    font-size: 14px;
    color: #2d3748;
    line-height: 1.5;
    flex: 1;
    overflow-y: auto;
    white-space: pre-wrap;
    cursor: pointer;
  `;

  // 创建弹出式编辑框
  function createPromptEditor(content, onSave) {
    const editorModal = document.createElement('div');
    editorModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10002;
    `;

    const editorContent = document.createElement('div');
    editorContent.style.cssText = `
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 800px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
    `;

    const editorHeader = document.createElement('div');
    editorHeader.textContent = '编辑提示词';
    editorHeader.style.cssText = `
      font-size: 18px;
      font-weight: 600;
      color: #2d3748;
    `;

    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.style.cssText = `
      width: 100%;
      height: 300px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 14px;
      line-height: 1.5;
      resize: none;
      font-family: inherit;

      &:focus {
        outline: none;
        border-color: #4a5568;
      }
    `;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
      color: #4a5568;
      cursor: pointer;
      font-size: 14px;

      &:hover {
        background: #f8f9fa;
      }
    `;

    const saveButton = document.createElement('button');
    saveButton.textContent = '保存';
    saveButton.style.cssText = `
      padding: 8px 24px;
      border: none;
      border-radius: 6px;
      background: #4caf50;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;

      &:hover {
        background: #43a047;
      }
    `;

    cancelButton.onclick = () => editorModal.remove();
    saveButton.onclick = () => {
      const newContent = textarea.value;
      // 更新所有相关的值
      promptContent.textContent = newContent;
      customPromptInput.value = newContent;

      // 更新自定义模式的 radio 值
      const customRadio = document.querySelector('input[name="answer-mode"][id="custom"]');
      if (customRadio) {
        customRadio.value = newContent;
      }

      onSave(newContent);
      editorModal.remove();
    };

    buttonGroup.appendChild(cancelButton);
    buttonGroup.appendChild(saveButton);

    editorContent.appendChild(editorHeader);
    editorContent.appendChild(textarea);
    editorContent.appendChild(buttonGroup);
    editorModal.appendChild(editorContent);

    return editorModal;
  }

  // 监听编辑按钮点击
  editButton.onclick = () => {
    const currentContent = customPromptInput.style.display === 'none' ?
      promptContent.textContent :
      customPromptInput.value;

    const editor = createPromptEditor(currentContent, (newContent) => {
      if (customPromptInput.style.display === 'none') {
        promptContent.textContent = newContent;
      } else {
        customPromptInput.value = newContent;
        const customRadio = document.querySelector('input[name="answer-mode"][id="custom"]');
        if (customRadio && customRadio.checked) {
          customRadio.value = newContent;
        }
      }
    });

    document.body.appendChild(editor);
  };

  // 点击内容区域也可以打开编辑器
  promptContent.onclick = editButton.onclick;

  // 创建自定义提示词输入框（保持隐藏状态，仅用于存储值）
  const customPromptInput = document.createElement('textarea');
  customPromptInput.style.cssText = `display: none;`;
  customPromptInput.value = defaultPrompt;

  // 添加所有模式选项
  [...window.ANSWER_MODES, {
    id: 'custom',
    label: '自定义提示词',
    prompt: defaultPrompt,
    description: '使用自定义提示词来指导 AI 回答'
  }].forEach(mode => {
    const label = createOptionLabel(mode.id === 'concise');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer-mode';
    radio.id = mode.id;
    radio.value = mode.id === 'custom' ? customPromptInput.value : mode.prompt;
    radio.checked = mode.id === 'concise';
    radio.style.cssText = `
      width: 16px;
      height: 16px;
      accent-color: #4a5568;
    `;

    // 监听单选框变化
    radio.addEventListener('change', () => {
      if (radio.checked) {
        if (mode.id === 'custom') {
          promptContent.textContent = customPromptInput.value;
          radio.value = customPromptInput.value; // 设置为当前自定义内容
        } else {
          promptContent.textContent = mode.prompt;
          radio.value = mode.prompt;
        }
      }
    });

    const span = document.createElement('span');
    span.textContent = mode.label;
    span.style.cssText = `
      font-size: 14px;
      color: #2d3748;
    `;

    const tooltip = document.createElement('div');
    tooltip.textContent = mode.description;
    tooltip.style.cssText = `
      display: none;
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #2d3748;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);

      &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: #2d3748;
      }
    `;

    label.appendChild(radio);
    label.appendChild(span);
    label.appendChild(tooltip);

    label.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
    label.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    modeList.appendChild(label);
  });

  // 监听自定义提示词输入
  customPromptInput.addEventListener('input', () => {
    const customRadio = document.querySelector('input[name="answer-mode"][id="custom"]');
    if (customRadio && customRadio.checked) {
      promptContent.textContent = customPromptInput.value;
      customRadio.value = customPromptInput.value;
    }
  });

  promptContainer.appendChild(promptHeader);
  promptContainer.appendChild(promptContent);
  promptContainer.appendChild(customPromptInput);

  const answerModeContent = document.createElement('div');
  answerModeContent.style.cssText = `
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 16px;
    margin-top: 12px;
  `;

  answerModeContent.appendChild(modeList);
  answerModeContent.appendChild(promptContainer);
  answerModeSection.appendChild(answerModeContent);

  // 初始化显示默认模式的提示词
  promptContent.textContent = defaultPrompt;

  content.appendChild(leftPanel);
  content.appendChild(rightPanel);
  content.appendChild(answerModeSection);
  content.appendChild(buttons);
  modal.appendChild(content);
  document.body.appendChild(modal);
} 