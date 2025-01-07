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
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 20px;
    border-radius: 8px;
    width: 400px;
  `;

  const title = document.createElement('h3');
  title.textContent = 'AI 配置';
  title.style.cssText = `
    margin: 0 0 20px 0;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  `;

  const aiList = document.createElement('div');
  aiList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;

  // 创建每个 AI 的选择项
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    const aiItem = document.createElement('div');
    aiItem.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 10px;
      border: 1px solid #eee;
      border-radius: 4px;
    `;

    // 启用/禁用复选框
    const enableCheck = document.createElement('input');
    enableCheck.type = 'checkbox';
    enableCheck.checked = config.enabled;
    enableCheck.style.cssText = `
      width: 16px;
      height: 16px;
    `;
    enableCheck.onchange = () => {
      config.enabled = enableCheck.checked;
      // 如果取消启用，同时取消权重选择
      if (!enableCheck.checked && weightRadio.checked) {
        weightRadio.checked = false;
        config.weight = 1;
      }
      weightRadio.disabled = !enableCheck.checked;
    };

    // AI 名称
    const nameLabel = document.createElement('div');
    nameLabel.textContent = config.name;
    nameLabel.style.cssText = `
      flex: 1;
      color: ${config.color};
      font-weight: 500;
    `;

    // 权重单选按钮
    const weightRadio = document.createElement('input');
    weightRadio.type = 'radio';
    weightRadio.name = 'weight-ai';
    weightRadio.checked = config.weight > 1;
    weightRadio.disabled = !config.enabled;
    weightRadio.style.cssText = `
      width: 16px;
      height: 16px;
    `;
    weightRadio.onchange = () => {
      if (weightRadio.checked) {
        // 重置所有 AI 权重为 1
        Object.values(AI_CONFIG).forEach(c => c.weight = 1);
        // 设置选中的 AI 权重为 2
        config.weight = 2;
      }
    };

    const weightLabel = document.createElement('span');
    weightLabel.textContent = '权重';
    weightLabel.style.cssText = `
      font-size: 14px;
      color: #666;
      margin-left: 8px;
    `;

    aiItem.appendChild(enableCheck);
    aiItem.appendChild(nameLabel);
    aiItem.appendChild(weightRadio);
    aiItem.appendChild(weightLabel);
    aiList.appendChild(aiItem);
  });

  // 按钮区域
  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 20px;
  `;

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = '确定';
  confirmBtn.style.cssText = `
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: #4caf50;
    color: white;
    cursor: pointer;
  `;

  // 添加保存配置函数
  function saveConfig() {
    try {
      // 检查是否至少选择了一个 AI
      const hasEnabledAI = Object.values(window.AI_CONFIG).some(config => config.enabled);
      if (!hasEnabledAI) {
        throw new Error('请至少选择一个 AI');
      }

      // 检查是否选择了权重 AI
      const hasWeightAI = Object.values(window.AI_CONFIG).some(config => config.weight > 1);
      if (!hasWeightAI) {
        throw new Error('请选择一个权重 AI');
      }

      // 保存配置到 localStorage
      localStorage.setItem('AI_CONFIG', JSON.stringify(window.AI_CONFIG));
      console.log('AI 配置已保存:', window.AI_CONFIG);
    } catch (error) {
      console.error('保存配置失败:', error);
      throw error;
    }
  }

  // 修改确认按钮的点击事件处理
  confirmBtn.onclick = async () => {
    try {
      // 保存配置
      saveConfig();

      // 关闭配置模态框
      modal.style.display = 'none';

      // 显示答案模态框
      try {
        await window.showAnswersModal();
      } catch (error) {
        console.error('显示答案模态框时出错:', error);
        alert('显示答案时出错，请重试');
      }

      // 如果有回调函数，执行它
      if (callback) callback();
    } catch (error) {
      alert(error.message);
    }
  };

  buttons.appendChild(confirmBtn);
  content.appendChild(title);
  content.appendChild(aiList);
  content.appendChild(buttons);
  modal.appendChild(content);
  document.body.appendChild(modal);
} 