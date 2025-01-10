// AI 配置
const AI_CONFIG = {
  kimi: {
    name: 'Kimi',
    color: '#FF6B6B',
    url: 'https://kimi.moonshot.cn/'
  },
  deepseek: {
    name: 'DeepSeek',
    color: '#4ECDC4',
    url: 'https://chat.deepseek.com/'
  },
  tongyi: {
    name: '通义千问',
    color: '#45B7D1',
    url: 'https://tongyi.aliyun.com/'
  },
  chatglm: {
    name: '智谱清言',
    color: '#2454FF',
    url: 'https://chatglm.cn/'
  },
  doubao: {
    name: '豆包',
    color: '#FF6A00',
    url: 'https://www.doubao.com/'
  },
  yiyan: {
    name: '文心一言',
    color: '#4B5CC4',
    url: 'https://yiyan.baidu.com/'
  },
  xinghuo: {
    name: '讯飞星火',
    color: '#1890FF',
    url: 'https://xinghuo.xfyun.cn/desk'
  },
  chatgpt: {
    name: 'ChatGPT',
    color: '#10A37F',
    url: 'https://chatgpt.com/'
  },
  gemini: {
    name: 'Gemini',
    color: '#1A73E8',
    url: 'https://gemini.google.com/'
  }
};

// 存储 AI 标签页 ID
const aiTabs = {};
let currentTabId = null;

// 运行模式
let runningMode = 'stable';  // 'stable' 或 'fast'
let pendingResponses = new Set();  // 用于跟踪待响应的AI

// 初始化 UI
function initUI() {
  const aiSelection = document.getElementById('aiSelection');
  const aiResults = document.getElementById('aiResults');

  // 初始化模式选择
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      runningMode = e.target.value;
    });
  });

  // 创建 AI 选择框
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    const checkbox = document.createElement('label');
    checkbox.className = 'ai-checkbox';
    checkbox.innerHTML = `
      <input type="checkbox" value="${aiType}">
      <span style="color: ${config.color}">${config.name}</span>
    `;
    aiSelection.appendChild(checkbox);

    // 创建结果卡片
    const card = document.createElement('div');
    card.className = 'ai-card';
    card.id = `ai-card-${aiType}`;

    card.innerHTML = `
      <div class="ai-header">
        <div class="ai-name" style="color: ${config.color}">${config.name}</div>
        <div class="ai-status">未就绪</div>
      </div>
      <div class="ai-content"></div>
      <div class="ai-time"></div>
    `;

    aiResults.appendChild(card);
  });

  // 绑定按钮事件
  document.getElementById('testButton').addEventListener('click', startTest);
  document.getElementById('clearButton').addEventListener('click', clearResults);

  // 保存当前标签页ID
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    currentTabId = tabs[0].id;
  });
}

// 更新 AI 状态
function updateAIStatus(aiType, status, message = '') {
  const card = document.getElementById(`ai-card-${aiType}`);
  if (!card) return;

  const statusEl = card.querySelector('.ai-status');
  const contentEl = card.querySelector('.ai-content');
  const timeEl = card.querySelector('.ai-time');

  statusEl.className = `ai-status ${status}`;

  switch (status) {
    case 'ready':
      statusEl.textContent = '就绪';
      break;
    case 'loading':
      statusEl.textContent = '处理中';
      break;
    case 'error':
      statusEl.textContent = '错误';
      contentEl.textContent = message;
      break;
    default:
      statusEl.textContent = '未就绪';
  }

  if (message && status !== 'error') {
    contentEl.textContent = message;
    timeEl.textContent = new Date().toLocaleTimeString();
  }
}

// 模拟激活标签页
async function simulateTabActivation(tabId) {
  try {
    // 激活目标标签页
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update((await chrome.tabs.get(tabId)).windowId, { focused: true });

    // 等待500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error('激活标签页失败:', error);
  }
}

// 获取选中的 AI
function getSelectedAIs() {
  const checkboxes = document.querySelectorAll('.ai-checkbox input:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// 清理重复的AI窗口
async function cleanupDuplicateWindows(aiType, exceptTabId = null) {
  try {
    const tabs = await chrome.tabs.query({});
    const aiUrl = AI_CONFIG[aiType].url;

    for (const tab of tabs) {
      // 检查是否是相同URL的标签页，但不是我们当前使用的标签页
      if (tab.url.startsWith(aiUrl) && tab.id !== exceptTabId) {
        try {
          await chrome.tabs.remove(tab.id);
          console.log(`已清理重复的 ${AI_CONFIG[aiType].name} 窗口:`, tab.id);
        } catch (error) {
          console.error(`清理 ${AI_CONFIG[aiType].name} 窗口失败:`, error);
        }
      }
    }
  } catch (error) {
    console.error('清理重复窗口时出错:', error);
  }
}

// 检查AI标签页是否仍然存在
async function checkTabExists(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab;
  } catch (error) {
    return false;
  }
}

// 计算窗口位置
async function calculateWindowPosition(index, totalWindows) {
  // 获取屏幕信息
  const displays = await chrome.system.display.getInfo();
  const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

  // 获取工作区尺寸
  const screenWidth = primaryDisplay.workArea.width;
  const screenHeight = primaryDisplay.workArea.height;

  // 根据窗口总数决定布局
  let cols, rows;
  if (totalWindows <= 2) {
    cols = 2;
    rows = 1;
  } else if (totalWindows <= 4) {
    cols = 2;
    rows = 2;
  } else if (totalWindows <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = 3;
    rows = 3;
  }

  // 计算单个窗口的尺寸
  const horizontalGap = 20;
  const verticalGap = 20;
  const availableWidth = screenWidth - (horizontalGap * (cols + 1));
  const availableHeight = screenHeight - (verticalGap * (rows + 1));

  const windowWidth = Math.floor(availableWidth / cols);
  const windowHeight = Math.floor(availableHeight / rows);

  // 计算当前窗口应该在第几行第几列
  const row = Math.floor(index / cols);
  const col = index % cols;

  // 计算左上角坐标，确保在工作区内
  const left = primaryDisplay.workArea.left + horizontalGap + col * (windowWidth + horizontalGap);
  const top = primaryDisplay.workArea.top + verticalGap + row * (windowHeight + verticalGap);

  return {
    left,
    top,
    width: windowWidth,
    height: windowHeight
  };
}

// 初始化选中的 AI 标签页
async function initSelectedAITabs() {
  const selectedAIs = getSelectedAIs();

  // 关闭未选中的标签页
  for (const [aiType, tabId] of Object.entries(aiTabs)) {
    if (!selectedAIs.includes(aiType) && tabId) {
      try {
        await chrome.tabs.remove(tabId);
        delete aiTabs[aiType];
        updateAIStatus(aiType, 'default');
        document.getElementById(`ai-card-${aiType}`).classList.add('active');
      } catch (error) {
        console.error(`关闭 ${AI_CONFIG[aiType].name} 标签页失败:`, error);
      }
    }
  }

  // 并行初始化所有选中的AI
  await Promise.all(selectedAIs.map(async (aiType, index) => {
    let currentTabId = aiTabs[aiType];

    // 检查现有标签页是否还存在
    if (currentTabId && !(await checkTabExists(currentTabId))) {
      delete aiTabs[aiType];
      currentTabId = null;
    }

    if (!currentTabId) {
      try {
        document.getElementById(`ai-card-${aiType}`).classList.add('active');
        updateAIStatus(aiType, 'loading', '正在初始化...');

        // 清理同URL的其他窗口
        await cleanupDuplicateWindows(aiType);

        // 计算窗口位置，传入总窗口数
        const position = await calculateWindowPosition(index, selectedAIs.length);

        // 创建新窗口
        const window = await chrome.windows.create({
          url: AI_CONFIG[aiType].url,
          type: 'popup',
          width: position.width,
          height: position.height,
          left: position.left,
          top: position.top,
          focused: false
        });

        // 保存标签页ID
        aiTabs[aiType] = window.tabs[0].id;

        // 激活新窗口
        await simulateTabActivation(window.tabs[0].id);

        // 等待页面加载完成并确保内容脚本准备就绪
        await new Promise((resolve, reject) => {
          let retryCount = 0;
          const maxRetries = 30;

          const checkReady = async () => {
            try {
              const response = await chrome.tabs.sendMessage(window.tabs[0].id, { type: 'CHECK_READY' });
              if (response && response.ready) {
                updateAIStatus(aiType, 'ready');
                resolve();
              } else if (retryCount < maxRetries) {
                retryCount++;
                updateAIStatus(aiType, 'loading', `正在等待页面准备就绪... (${retryCount}/${maxRetries})`);
                setTimeout(checkReady, 1000);
              } else {
                reject(new Error('页面加载超时'));
              }
            } catch (error) {
              if (retryCount < maxRetries) {
                retryCount++;
                updateAIStatus(aiType, 'loading', `正在等待页面准备就绪... (${retryCount}/${maxRetries})`);
                setTimeout(checkReady, 1000);
              } else {
                reject(new Error('内容脚本未能成功加载'));
              }
            }
          };

          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === window.tabs[0].id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(checkReady, 2000);
            }
          });
        });

      } catch (error) {
        console.error(`初始化 ${AI_CONFIG[aiType].name} 失败:`, error);
        updateAIStatus(aiType, 'error', `初始化失败: ${error.message}`);
        delete aiTabs[aiType];
      }
    }
  }));
}

// 开始测试
async function startTest() {
  const selectedAIs = getSelectedAIs();
  if (selectedAIs.length === 0) {
    alert('请至少选择一个 AI 进行测试');
    return;
  }

  const input = document.getElementById('testInput');
  const question = input.value.trim();

  if (!question) {
    alert('请输入测试问题');
    return;
  }

  // 禁用按钮
  const testButton = document.getElementById('testButton');
  testButton.disabled = true;

  try {
    // 保存当前测试窗口
    const currentTestWindow = await chrome.windows.getCurrent();
    const currentTestTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    // 重置待响应集合
    pendingResponses = new Set(selectedAIs);

    // 并行处理所有选中的AI
    selectedAIs.forEach(async (aiType, index) => {
      try {
        let currentTabId = aiTabs[aiType];

        // 检查现有标签页是否还存在
        if (currentTabId && !(await checkTabExists(currentTabId))) {
          delete aiTabs[aiType];
          currentTabId = null;
        }

        if (!currentTabId) {
          document.getElementById(`ai-card-${aiType}`).classList.add('active');
          updateAIStatus(aiType, 'loading', '正在初始化...');

          // 清理同URL的其他窗口
          await cleanupDuplicateWindows(aiType);

          // 计算窗口位置，传入总窗口数
          const position = await calculateWindowPosition(index, selectedAIs.length);

          // 创建新窗口
          const window = await chrome.windows.create({
            url: AI_CONFIG[aiType].url,
            type: 'popup',
            width: position.width,
            height: position.height,
            left: position.left,
            top: position.top,
            focused: false
          });

          // 保存标签页ID
          aiTabs[aiType] = window.tabs[0].id;

          // 激活新窗口
          await simulateTabActivation(window.tabs[0].id);

          // 等待页面加载完成并确保内容脚本准备就绪
          try {
            await new Promise((resolve, reject) => {
              let retryCount = 0;
              const maxRetries = 30;

              const checkReady = async () => {
                try {
                  const response = await chrome.tabs.sendMessage(window.tabs[0].id, { type: 'CHECK_READY' });
                  if (response && response.ready) {
                    updateAIStatus(aiType, 'ready');
                    resolve();
                  } else if (retryCount < maxRetries) {
                    retryCount++;
                    updateAIStatus(aiType, 'loading', `正在等待页面准备就绪... (${retryCount}/${maxRetries})`);
                    setTimeout(checkReady, 1000);
                  } else {
                    reject(new Error('页面加载超时'));
                  }
                } catch (error) {
                  if (retryCount < maxRetries) {
                    retryCount++;
                    updateAIStatus(aiType, 'loading', `正在等待页面准备就绪... (${retryCount}/${maxRetries})`);
                    setTimeout(checkReady, 1000);
                  } else {
                    reject(new Error('内容脚本未能成功加载'));
                  }
                }
              };

              chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
                if (tabId === window.tabs[0].id && changeInfo.status === 'complete') {
                  chrome.tabs.onUpdated.removeListener(listener);
                  setTimeout(checkReady, 2000);
                }
              });
            });

            // AI 准备就绪后立即发送问题
            updateAIStatus(aiType, 'loading', '正在处理问题...');
            await chrome.tabs.sendMessage(window.tabs[0].id, {
              type: 'ASK_QUESTION',
              question: question
            });

            // 根据模式决定是否立即切回测试窗口
            if (runningMode === 'fast') {
              await chrome.tabs.update(currentTestTab.id, { active: true });
              await chrome.windows.update(currentTestWindow.id, { focused: true });
            }

          } catch (error) {
            console.error(`初始化 ${AI_CONFIG[aiType].name} 失败:`, error);
            updateAIStatus(aiType, 'error', `初始化失败: ${error.message}`);
            delete aiTabs[aiType];
            pendingResponses.delete(aiType);
          }
        } else {
          // 如果标签页已存在，直接发送问题
          try {
            // 激活AI窗口
            await chrome.tabs.update(currentTabId, { active: true });
            await chrome.windows.update((await chrome.tabs.get(currentTabId)).windowId, { focused: true });

            // 等待一小段时间确保窗口已激活
            await new Promise(resolve => setTimeout(resolve, 100));

            updateAIStatus(aiType, 'loading', '正在处理问题...');
            await chrome.tabs.sendMessage(currentTabId, {
              type: 'ASK_QUESTION',
              question: question
            });

            // 根据模式决定是否立即切回测试窗口
            if (runningMode === 'fast') {
              await chrome.tabs.update(currentTestTab.id, { active: true });
              await chrome.windows.update(currentTestWindow.id, { focused: true });
            }
          } catch (error) {
            console.error(`处理 ${AI_CONFIG[aiType].name} 失败:`, error);
            updateAIStatus(aiType, 'error', `处理失败: ${error.message}`);
            pendingResponses.delete(aiType);
          }
        }
      } catch (error) {
        console.error(`处理 ${AI_CONFIG[aiType].name} 失败:`, error);
        updateAIStatus(aiType, 'error', `处理失败: ${error.message}`);
        pendingResponses.delete(aiType);
      }
    });

  } finally {
    // 启用按钮
    testButton.disabled = false;
  }
}

// 清除结果
function clearResults() {
  const selectedAIs = getSelectedAIs();
  selectedAIs.forEach(aiType => {
    const card = document.getElementById(`ai-card-${aiType}`);
    if (card) {
      card.querySelector('.ai-content').textContent = '';
      card.querySelector('.ai-time').textContent = '';
      updateAIStatus(aiType, 'ready');
    }
  });
}

// 监听来自 AI 页面的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ANSWER_READY') {
    const { aiType, answer } = request;
    updateAIStatus(aiType, 'ready', answer);

    // 从待响应集合中移除已响应的AI
    pendingResponses.delete(aiType);

    // 如果是稳定模式且所有AI都已响应，切回测试页面
    if (runningMode === 'stable' && pendingResponses.size === 0) {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const currentTestTab = tabs[0];
        const currentTestWindow = await chrome.windows.getCurrent();
        await chrome.tabs.update(currentTestTab.id, { active: true });
        await chrome.windows.update(currentTestWindow.id, { focused: true });
      });
    }
  }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initUI();
}); 