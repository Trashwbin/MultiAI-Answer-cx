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
    url: 'https://doubao.com/'
  },
  yiyan: {
    name: '文心一言',
    color: '#4B5CC4',
    url: 'https://yiyan.baidu.com/'
  }
};

// 存储 AI 标签页 ID
const aiTabs = {};
let currentTabId = null;

// 初始化 UI
function initUI() {
  const aiSelection = document.getElementById('aiSelection');
  const aiResults = document.getElementById('aiResults');

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
  // 保存当前标签页
  const currentTab = await chrome.tabs.query({ active: true, currentWindow: true });

  // 激活目标标签页
  await chrome.tabs.update(tabId, { active: true });

  // 等待一小段时间让页面更新
  await new Promise(resolve => setTimeout(resolve, 100));

  // 切回原来的标签页
  if (currentTab[0]) {
    await chrome.tabs.update(currentTab[0].id, { active: true });
  }
}

// 获取选中的 AI
function getSelectedAIs() {
  const checkboxes = document.querySelectorAll('.ai-checkbox input:checked');
  return Array.from(checkboxes).map(cb => cb.value);
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

  // 初始化选中的 AI
  for (const aiType of selectedAIs) {
    if (!aiTabs[aiType]) {
      try {
        document.getElementById(`ai-card-${aiType}`).classList.add('active');

        // 创建新窗口，使用更大的尺寸
        const window = await chrome.windows.create({
          url: AI_CONFIG[aiType].url,
          type: 'popup',  // 使用普通窗口而不是弹出窗口
          width: 1280,     // 标准的 1280x800 分辨率
          height: 800,
          state: 'normal', // 确保窗口是正常状态
          focused: false
        });

        // 保存标签页ID
        aiTabs[aiType] = window.tabs[0].id;

        // 等待页面加载完成
        await new Promise((resolve) => {
          const checkReady = async () => {
            try {
              const response = await chrome.tabs.sendMessage(window.tabs[0].id, { type: 'CHECK_READY' });
              if (response && response.ready) {
                updateAIStatus(aiType, 'ready');
                resolve();
              } else {
                setTimeout(checkReady, 1000);
              }
            } catch (error) {
              setTimeout(checkReady, 1000);
            }
          };

          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === window.tabs[0].id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(checkReady, 1000);
            }
          });
        });

      } catch (error) {
        console.error(`初始化 ${AI_CONFIG[aiType].name} 失败:`, error);
        updateAIStatus(aiType, 'error', `初始化失败: ${error.message}`);
      }
    }
  }
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

  // 初始化选中的 AI
  await initSelectedAITabs();

  // 向选中的 AI 发送问题
  for (const aiType of selectedAIs) {
    const tabId = aiTabs[aiType];
    if (tabId) {
      try {
        updateAIStatus(aiType, 'loading', '正在处理问题...');

        await chrome.tabs.sendMessage(tabId, {
          type: 'ASK_QUESTION',
          question: question
        });

      } catch (error) {
        console.error(`发送问题到 ${AI_CONFIG[aiType].name} 失败:`, error);
        updateAIStatus(aiType, 'error', `发送失败: ${error.message}`);
      }
    }
  }

  // 启用按钮
  testButton.disabled = false;
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
  }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initUI();
}); 