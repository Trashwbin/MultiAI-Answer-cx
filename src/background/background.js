// AI 配置
const AI_CONFIG = {
  kimi: {
    url: 'https://www.kimi.com/',
    tabId: null,
    windowId: null
  },
  deepseek: {
    url: 'https://chat.deepseek.com/',
    tabId: null,
    windowId: null
  },
  tongyi: {
    url: 'https://tongyi.aliyun.com/',
    tabId: null,
    windowId: null
  },
  chatglm: {
    url: 'https://chatglm.cn/',
    tabId: null,
    windowId: null
  },
  doubao: {
    url: 'https://doubao.com/',
    tabId: null,
    windowId: null
  },
  yiyan: {
    url: 'https://yiyan.baidu.com/',
    tabId: null,
    windowId: null
  },
  xinghuo: {
    url: 'https://xinghuo.xfyun.cn/desk',
    tabId: null,
    windowId: null
  },
  chatgpt: {
    url: 'https://chatgpt.com/',
    tabId: null,
    windowId: null
  },
  gemini: {
    url: 'https://gemini.google.com/',
    tabId: null,
    windowId: null
  }
};

let questionTabId = null;
let pendingResponses = new Set(); // 用于跟踪待响应的AI
let updateIntervals = {}; // 存储每个AI的更新检查定时器
let hasSwitchedBackInFastMode = false;

// 检查标签页是否存在
async function checkTabExists(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return !!tab;
  } catch (error) {
    return false;
  }
}

// 清理重复的AI窗口
async function cleanupDuplicateWindows(aiType, exceptTabId = null) {
  try {
    const tabs = await chrome.tabs.query({});
    const aiUrl = AI_CONFIG[aiType].url;

    for (const tab of tabs) {
      if (tab.url.includes(new URL(aiUrl).hostname) && tab.id !== exceptTabId) {
        try {
          await chrome.tabs.remove(tab.id);
          //console.log(`已清理重复的 ${aiType} 窗口:`, tab.id);
        } catch (error) {
          //console.error(`清理 ${aiType} 窗口失败:`, error);
        }
      }
    }
  } catch (error) {
    //console.error('清理重复窗口时出错:', error);
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

// 处理问题发送
async function handleQuestion(request, fromTabId, sendResponse) {
  console.log('正在处理问题...', request.aiType, '运行模式:', request.runMode);
  const aiType = request.aiType;
  const config = AI_CONFIG[aiType];
  console.log(chrome.storage.local)
  // 从 storage 获取启用的 AI 配置
  const { AI_CONFIG: storedConfig } = await chrome.storage.local.get('AI_CONFIG');
  const enabledAIs = Object.entries(storedConfig || {})
    .filter(([_, cfg]) => cfg.enabled)
    .sort(([a], [b]) => a.localeCompare(b));

  console.log('启用的 AI:', enabledAIs.map(([type]) => type));
  const currentIndex = enabledAIs.findIndex(([type]) => type === aiType);

  // 如果是第一个 AI，重置切换标记
  if (currentIndex === 0) {
    hasSwitchedBackInFastMode = false;
  }

  if (!config) {
    console.error('未知的 AI 类型:', aiType);
    sendResponse({ success: false, error: '未知的 AI 类型' });
    return;
  }

  let targetTabId = config.tabId;
  let targetWindowId = config.windowId;

  // 检查现有窗口是否可用
  if (targetTabId && targetWindowId) {
    try {
      const tab = await chrome.tabs.get(targetTabId);
      const window = await chrome.windows.get(targetWindowId);

      if (!tab || !tab.url || !tab.url.includes(new URL(config.url).hostname) || !window) {
        targetTabId = null;
        targetWindowId = null;
        config.tabId = null;
        config.windowId = null;
      }
    } catch (error) {
      targetTabId = null;
      targetWindowId = null;
      config.tabId = null;
      config.windowId = null;
    }
  }

  // 如果目标 AI 窗口不存在或不可用，创建一个新窗口
  if (!targetTabId || !targetWindowId) {
    // 清理同URL的其他窗口
    await cleanupDuplicateWindows(aiType);

    // 计算窗口位置
    const position = await calculateWindowPosition(currentIndex, enabledAIs.length);

    const window = await chrome.windows.create({
      url: config.url,
      type: 'popup',
      width: position.width,
      height: position.height,
      left: position.left,
      top: position.top,
      focused: true  // 总是先激活新窗口
    });

    targetTabId = window.tabs[0].id;
    targetWindowId = window.id;
    config.tabId = targetTabId;
    config.windowId = targetWindowId;

    // 等待页面加载和初始化
    await new Promise((resolve) => {
      const checkReady = async () => {
        try {
          const response = await chrome.tabs.sendMessage(targetTabId, { type: 'CHECK_READY' });
          if (response && response.ready) {
            resolve();
          } else {
            setTimeout(checkReady, 1000);
          }
        } catch (error) {
          setTimeout(checkReady, 1000);
        }
      };

      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === targetTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(checkReady, 1000);
        }
      });
    });
  } else {
    // 如果窗口已存在，激活它
    await chrome.tabs.update(targetTabId, { active: true });
    await chrome.windows.update(targetWindowId, { focused: true });
  }

  // 添加到待响应集合
  pendingResponses.add(aiType);

  // 发送消息到目标标签页
  try {
    await chrome.tabs.sendMessage(targetTabId, {
      type: 'ASK_QUESTION',
      question: request.question
    });
    //console.log('发送问题:', request.question);

    // 如果是极速模式且还没有切回题目页面，立即切回
    if (request.runMode === 'fast' && !hasSwitchedBackInFastMode) {
      try {
        // 验证题目标签页是否存在
        const fromTab = await chrome.tabs.get(fromTabId);
        if (fromTab) {
          // 激活题目标签页
          await chrome.tabs.update(fromTabId, { active: true });
          await chrome.windows.update(fromTab.windowId, { focused: true });
          console.log('极速模式：已切回题目页面');
          hasSwitchedBackInFastMode = true;
        }
      } catch (error) {
        console.error('切回题目页面失败:', error);
      }
    }

    // 开始定时更新
    if (updateIntervals[targetTabId]) {
      clearInterval(updateIntervals[targetTabId]);
    }

    updateIntervals[targetTabId] = setInterval(async () => {
      try {
        // 获取当前活动标签页
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // 激活目标标签页
        await chrome.tabs.update(targetTabId, { active: true });

        // 等待一小段时间让页面更新
        await new Promise(resolve => setTimeout(resolve, 100));

        // 切回原来的标签页
        if (currentTab) {
          await chrome.tabs.update(currentTab.id, { active: true });
        }
      } catch (error) {
        console.error('更新标签页失败:', error);
      }
    }, 2000);

    sendResponse({ success: true });
  } catch (error) {
    console.error('发送问题失败:', error);
    config.tabId = null;
    config.windowId = null;
    pendingResponses.delete(aiType);
    if (updateIntervals[targetTabId]) {
      clearInterval(updateIntervals[targetTabId]);
      delete updateIntervals[targetTabId];
    }
    sendResponse({ success: false, error: 'AI 页面未响应' });
  }
}

// 处理AI回答准备就绪
async function handleAnswerReady(request) {
  // 从待响应集合中移除
  pendingResponses.delete(request.aiType);

  // 清除更新定时器
  const aiConfig = AI_CONFIG[request.aiType];
  if (aiConfig && aiConfig.tabId && updateIntervals[aiConfig.tabId]) {
    clearInterval(updateIntervals[aiConfig.tabId]);
    delete updateIntervals[aiConfig.tabId];
  }

  // 获取对话策略
  let chatStrategy = 'continuous';  // 默认为连续对话
  try {
    const result = await chrome.storage.local.get('CHAT_STRATEGY');
    chatStrategy = result.CHAT_STRATEGY || 'continuous';
  } catch (error) {
    console.error('获取对话策略失败:', error);
  }

  // 如果是单次对话模式，关闭AI窗口
  if (chatStrategy === 'single' && aiConfig && aiConfig.windowId) {
    try {
      await chrome.windows.remove(aiConfig.windowId);
      aiConfig.tabId = null;
      aiConfig.windowId = null;
    } catch (error) {
      console.error('关闭AI窗口失败:', error);
    }
  }

  // 如果没有 questionTabId，尝试查找题目页面
  if (!questionTabId) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('mooc1.chaoxing.com')) {
          questionTabId = tab.id;
          break;
        }
      }
    } catch (error) {
      return;
    }
  }

  // 验证题目标签页是否还存在
  let questionTab = null;
  if (questionTabId) {
    try {
      questionTab = await chrome.tabs.get(questionTabId);
      // 确保标签页的窗口也存在
      await chrome.windows.get(questionTab.windowId);
    } catch (error) {
      questionTabId = null;
      return;
    }
  }

  // 如果题目标签页不存在，直接返回
  if (!questionTab) {
    return;
  }

  // 尝试发送答案
  try {
    await chrome.tabs.sendMessage(questionTabId, {
      type: 'SHOW_ANSWER',
      answer: request.answer,
      aiType: request.aiType
    });
  } catch (error) {
    // 如果发送失败，不影响后续操作
  }

  // 从 chrome.storage.local 获取运行模式
  let runMode = 'stable';
  try {
    const result = await chrome.storage.local.get('RUN_MODE');
    runMode = result.RUN_MODE || 'stable';
  } catch (error) {
    // 如果获取失败，使用默认的稳定模式
  }

  // 如果是稳定模式且所有AI都已响应，切回题目页面
  if (runMode === 'stable' && pendingResponses.size === 0) {
    try {
      // 再次验证窗口和标签页是否存在
      const window = await chrome.windows.get(questionTab.windowId);
      const tab = await chrome.tabs.get(questionTabId);

      if (window && tab) {
        // 激活标签页和窗口
        await chrome.tabs.update(questionTabId, { active: true });
        await chrome.windows.update(questionTab.windowId, { focused: true });
      }
    } catch (error) {
      // 如果切换失败，重置 questionTabId
      questionTabId = null;
    }
  }
}

// 添加处理切换标签页的函数
async function handleSwitchTab(aiType) {
  const config = AI_CONFIG[aiType];
  if (!config || !config.windowId) {
    return;
  }

  try {
    // 激活窗口
    await chrome.windows.update(config.windowId, {
      focused: true,
      state: 'normal'
    });
  } catch (error) {
    config.tabId = null;
    config.windowId = null;
  }
}

// 监听标签页更新
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tabId === questionTabId) {
    // 题目页面正在刷新,关闭所有 AI 窗口
    try {
      for (const [aiType, config] of Object.entries(AI_CONFIG)) {
        if (config.windowId) {
          try {
            await chrome.windows.remove(config.windowId);
          } catch (error) {
            //console.error(`关闭 ${aiType} 窗口失败:`, error);
          }
          // 重置配置
          config.tabId = null;
          config.windowId = null;
        }
      }
    } catch (error) {
      //console.error('清理 AI 窗口时出错:', error);
    }
  }

  if (changeInfo.status === 'complete' && tab.url) {
    // 查找匹配的 AI
    Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
      if (tab.url.includes(new URL(config.url).hostname)) {
        config.tabId = tabId;
        // 保存窗口 ID
        chrome.tabs.get(tabId, (tabInfo) => {
          config.windowId = tabInfo.windowId;
        });
      }
    });

    // 检查是否是题目页面
    if (tab.url.includes('mooc1.chaoxing.com')) {
      //console.log('找到题目标签页:', tabId);
      questionTabId = tabId;
    }
  }
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // 检查是否是题目标签页
  if (tabId === questionTabId) {
    //console.log('题目标签页已关闭，清理相关窗口');
    questionTabId = null;

    // 关闭所有 AI 窗口
    try {
      for (const [aiType, config] of Object.entries(AI_CONFIG)) {
        if (config.windowId) {
          try {
            await chrome.windows.remove(config.windowId);
          } catch (error) {
            //console.error(`关闭 ${aiType} 窗口失败:`, error);
          }
          // 重置配置
          config.tabId = null;
          config.windowId = null;
        }
      }
    } catch (error) {
      //console.error('清理 AI 窗口时出错:', error);
    }
  }

  // 检查是否是 AI 标签页
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    if (config.tabId === tabId) {
      //console.log(`${aiType} 标签页已关闭，重置 tabId`);
      config.tabId = null;
      config.windowId = null;
    }
  });

  // 清理更新检查定时器
  if (updateIntervals[tabId]) {
    clearInterval(updateIntervals[tabId]);
    delete updateIntervals[tabId];
  }
});

// 添加窗口关闭监听
chrome.windows.onRemoved.addListener((windowId) => {
  // 检查是否是 AI 窗口
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    if (config.windowId === windowId) {
      //console.log(`${aiType} 窗口已关闭，重置配置`);
      config.tabId = null;
      config.windowId = null;
    }
  });
});

// 处理批量问题发送
async function handleQuestions(request, fromTabId, sendResponse) {
  console.log('正在处理批量问题...', request.aiList, '运行模式:', request.runMode);

  try {
    // 获取启用的 AI 列表
    const enabledAIs = request.aiList;
    console.log('启用的 AI:', enabledAIs);

    // 重置切换标记
    hasSwitchedBackInFastMode = false;

    // 重置待响应集合
    pendingResponses = new Set(enabledAIs);

    // 并行处理所有 AI
    await Promise.all(enabledAIs.map(async (aiType, index) => {
      const config = AI_CONFIG[aiType];
      if (!config) return;

      let targetTabId = config.tabId;
      let targetWindowId = config.windowId;

      // 检查现有窗口是否可用
      if (targetTabId && targetWindowId) {
        try {
          const tab = await chrome.tabs.get(targetTabId);
          const window = await chrome.windows.get(targetWindowId);

          if (!tab || !tab.url || !tab.url.includes(new URL(config.url).hostname) || !window) {
            targetTabId = null;
            targetWindowId = null;
            config.tabId = null;
            config.windowId = null;
          }
        } catch (error) {
          targetTabId = null;
          targetWindowId = null;
          config.tabId = null;
          config.windowId = null;
        }
      }

      // 如果目标 AI 窗口不存在或不可用，创建一个新窗口
      if (!targetTabId || !targetWindowId) {
        // 清理同URL的其他窗口
        await cleanupDuplicateWindows(aiType);

        // 计算窗口位置
        const position = await calculateWindowPosition(index, enabledAIs.length);

        const window = await chrome.windows.create({
          url: config.url,
          type: 'popup',
          width: position.width,
          height: position.height,
          left: position.left,
          top: position.top,
          focused: true
        });

        targetTabId = window.tabs[0].id;
        targetWindowId = window.id;
        config.tabId = targetTabId;
        config.windowId = targetWindowId;

        // 等待页面加载和初始化
        await new Promise((resolve) => {
          const checkReady = async () => {
            try {
              const response = await chrome.tabs.sendMessage(targetTabId, { type: 'CHECK_READY' });
              if (response && response.ready) {
                resolve();
              } else {
                setTimeout(checkReady, 1000);
              }
            } catch (error) {
              setTimeout(checkReady, 1000);
            }
          };

          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === targetTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              setTimeout(checkReady, 1000);
            }
          });
        });
      }

      // 发送消息到目标标签页
      try {
        await chrome.tabs.sendMessage(targetTabId, {
          type: 'ASK_QUESTION',
          question: request.question
        });

        // 开始定时更新
        if (updateIntervals[targetTabId]) {
          clearInterval(updateIntervals[targetTabId]);
        }

        updateIntervals[targetTabId] = setInterval(async () => {
          try {
            // 获取当前活动标签页
            const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // 激活目标标签页
            await chrome.tabs.update(targetTabId, { active: true });

            // 等待一小段时间让页面更新
            await new Promise(resolve => setTimeout(resolve, 100));

            // 切回原来的标签页
            if (currentTab) {
              await chrome.tabs.update(currentTab.id, { active: true });
            }
          } catch (error) {
            console.error('更新标签页失败:', error);
          }
        }, 2000);

      } catch (error) {
        console.error(`发送问题到 ${aiType} 失败:`, error);
        config.tabId = null;
        config.windowId = null;
        pendingResponses.delete(aiType);
        if (updateIntervals[targetTabId]) {
          clearInterval(updateIntervals[targetTabId]);
          delete updateIntervals[targetTabId];
        }
      }
    }));

    // 如果是极速模式，立即切回题目页面
    if (request.runMode === 'fast') {
      try {
        const fromTab = await chrome.tabs.get(fromTabId);
        if (fromTab) {
          await chrome.tabs.update(fromTabId, { active: true });
          await chrome.windows.update(fromTab.windowId, { focused: true });
          console.log('极速模式：已切回题目页面');
          hasSwitchedBackInFastMode = true;
        }
      } catch (error) {
        console.error('切回题目页面失败:', error);
      }
    }

    sendResponse({ success: true });
  } catch (error) {
    console.error('处理批量问题失败:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request.type);

  switch (request.type) {
    case 'GET_QUESTIONS':  // 新增：处理批量问题
      handleQuestions(request, sender.tab.id, sendResponse);
      return true;

    case 'GET_QUESTION':  // 保留原有的单个问题处理，用于重试功能
      handleQuestion(request, sender.tab.id, sendResponse);
      return true;

    case 'ANSWER_READY':
      handleAnswerReady(request);
      return true;

    case 'QUESTION_PAGE_READY':
      questionTabId = sender.tab.id;
      return true;

    case 'SWITCH_TAB':
      handleSwitchTab(request.aiType);
      return true;
  }
}); 