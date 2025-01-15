document.addEventListener('DOMContentLoaded', async function () {
  // 获取按钮和容器元素
  const mainContent = document.getElementById('mainContent');
  const bigSwitchContainer = document.getElementById('bigSwitchContainer');
  const enableExtensionBtn = document.getElementById('enableExtension');
  const disableExtensionBtn = document.getElementById('disableExtension');

  // 获取其他按钮元素
  const showQuestionsBtn = document.querySelector('.show-questions');
  const showAnswersBtn = document.querySelector('.show-answers');
  const removePasteLimitSwitch = document.getElementById('remove-paste-limit');
  const enableCopyBtnSwitch = document.getElementById('enable-copy-btn');
  const enableTextSelectSwitch = document.getElementById('enable-text-select');

  // 从存储中加载所有开关状态
  const {
    extensionEnabled = true,
    pasteLimitDisabled = true,
    copyBtnEnabled = true,
    textSelectEnabled = true
  } = await chrome.storage.local.get([
    'extensionEnabled',
    'pasteLimitDisabled',
    'copyBtnEnabled',
    'textSelectEnabled'
  ]);

  // 设置开关初始状态
  removePasteLimitSwitch.checked = pasteLimitDisabled;
  enableCopyBtnSwitch.checked = copyBtnEnabled;
  enableTextSelectSwitch.checked = textSelectEnabled;

  // 根据总开关状态显示相应界面
  if (extensionEnabled) {
    mainContent.style.display = 'block';
    bigSwitchContainer.style.display = 'none';
  } else {
    mainContent.style.display = 'none';
    bigSwitchContainer.style.display = 'flex';
  }

  // 监听总开关
  enableExtensionBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ extensionEnabled: true });
    mainContent.style.display = 'block';
    bigSwitchContainer.style.display = 'none';

    // 通知所有标签页
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleExtension',
        enabled: true
      }).catch(() => {/* 忽略错误 */ });
    });
  });

  disableExtensionBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ extensionEnabled: false });
    mainContent.style.display = 'none';
    bigSwitchContainer.style.display = 'flex';

    // 通知所有标签页
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleExtension',
        enabled: false
      }).catch(() => {/* 忽略错误 */ });
    });
  });

  // 监听其他开关变化
  removePasteLimitSwitch.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    await chrome.storage.local.set({ pasteLimitDisabled: isChecked });

    // 向当前标签页发送消息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'togglePasteLimit',
      enabled: isChecked
    });
  });

  enableCopyBtnSwitch.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    await chrome.storage.local.set({ copyBtnEnabled: isChecked });

    // 向当前标签页发送消息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'toggleCopyBtn',
      enabled: isChecked
    });
  });

  enableTextSelectSwitch.addEventListener('change', async (e) => {
    const isChecked = e.target.checked;
    await chrome.storage.local.set({ textSelectEnabled: isChecked });

    // 向当前标签页发送消息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, {
      action: 'toggleTextSelect',
      enabled: isChecked
    });
  });

  // 显示题目列表按钮点击事件
  showQuestionsBtn.addEventListener('click', async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        showNotification('显示题目列表失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (!tabs || !tabs[0]) {
        showNotification('显示题目列表失败: 未找到当前标签页', 'error');
        return;
      }

      // 检查是否在学习通题目页面
      const url = tabs[0].url;
      if (!url.includes('.chaoxing.com/')) {
        showNotification('请在学习通题目页面使用此功能', 'warning');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: 'showQuestionList' }, (response) => {
        if (chrome.runtime.lastError) {
          showNotification('显示题目列表失败: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (!response || !response.success) {
          if (response?.cancelled) {
            return;
          }
          showNotification('显示题目列表失败: ' + (response?.error || '未知错误'), 'error');
          return;
        }

        window.close();
      });
    });
  });

  // 显示AI答案按钮点击事件
  showAnswersBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showNotification('显示AI答案失败: 未找到当前标签页', 'error');
        return;
      }

      // 检查是否在学习通题目页面
      if (!tab.url.includes('.chaoxing.com/')) {
        showNotification('请在学习通题目页面使用此功能', 'warning');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'showAnswers' }, (response) => {
        if (chrome.runtime.lastError) {
          showNotification('显示AI答案失败: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (!response || !response.success) {
          showNotification('显示AI答案失败: ' + (response?.error || '未知错误'), 'error');
          return;
        }

        window.close();
      });
    } catch (error) {
      showNotification('显示AI答案失败: ' + error.message, 'error');
    }
  });

  // 使用说明相关
  const showUsageBtn = document.getElementById('showUsage');
  const usageModal = document.getElementById('usageModal');
  const closeUsageBtn = document.getElementById('closeUsage');

  showUsageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    usageModal.classList.add('show');
  });

  closeUsageBtn.addEventListener('click', () => {
    usageModal.classList.remove('show');
  });

  // 点击模态框背景关闭
  usageModal.addEventListener('click', (e) => {
    if (e.target === usageModal) {
      usageModal.classList.remove('show');
    }
  });

  // 按ESC键关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && usageModal.classList.contains('show')) {
      usageModal.classList.remove('show');
    }
  });
}); 