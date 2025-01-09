// AI 配置
const AI_CONFIG = {
  kimi: {
    url: 'https://kimi.moonshot.cn/',
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
  }
};

let questionTabId = null;

// 存储每个AI的更新检查定时器
const updateIntervals = {};

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

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  //console.log('收到消息:', request.type);

  switch (request.type) {
    case 'GET_QUESTION':
      handleQuestion(request, sender.tab.id, sendResponse);
      return true;

    case 'ANSWER_READY':
      //console.log('收到AI回答:', request.aiType, request.answer);
      handleAnswerReady(request);
      return true;

    case 'QUESTION_PAGE_READY':
      //console.log('题目页面已就绪:', sender.tab.id);
      questionTabId = sender.tab.id;
      return true;

    case 'SWITCH_TAB':
      handleSwitchTab(request.aiType);
      return true;

    case 'START_TAB_UPDATE': {
      const tabId = request.tabId;
      const aiType = request.aiType;

      // 如果已经有定时器在运行，先清除
      if (updateIntervals[tabId]) {
        clearInterval(updateIntervals[tabId]);
      }

      // 创建新的定时器
      updateIntervals[tabId] = setInterval(async () => {
        try {
          // 获取当前活动标签页
          const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

          // 激活目标标签页
          await chrome.tabs.update(tabId, { active: true });

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

      // 返回成功
      sendResponse({ success: true });
      return true;
    }

    case 'STOP_TAB_UPDATE': {
      const tabId = request.tabId;

      // 清除定时器
      if (updateIntervals[tabId]) {
        clearInterval(updateIntervals[tabId]);
        delete updateIntervals[tabId];
      }

      // 返回成功
      sendResponse({ success: true });
      return true;
    }

    case 'ANSWER_READY': {
      const tabId = sender.tab.id;

      // 清除定时器
      if (updateIntervals[tabId]) {
        clearInterval(updateIntervals[tabId]);
        delete updateIntervals[tabId];
      }
      return true;
    }
  }
});

// 处理AI回答准备就绪
async function handleAnswerReady(request) {
  //console.log('当前题目页面 tabId:', questionTabId);

  // 如果没有 questionTabId，尝试查找题目页面
  if (!questionTabId) {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url.includes('mooc1.chaoxing.com')) {
          //console.log('找到题目页面:', tab.id);
          questionTabId = tab.id;
          break;
        }
      }
    } catch (error) {
      //console.error('查找题目页面失败:', error);
    }
  }

  // 如果仍然没有找到题目页面，尝试重试几次
  if (!questionTabId) {
    let retryCount = 0;
    const maxRetries = 3;
    const retryInterval = 1000; // 1秒

    const findQuestionTab = async () => {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.url && tab.url.includes('mooc1.chaoxing.com')) {
            //console.log('重试成功，找到题目页面:', tab.id);
            questionTabId = tab.id;
            // 发送答案
            chrome.tabs.sendMessage(questionTabId, {
              type: 'SHOW_ANSWER',
              answer: request.answer,
              aiType: request.aiType
            });
            return true;
          }
        }
        return false;
      } catch (error) {
        //console.error('重试查找题目页面失败:', error);
        return false;
      }
    };

    const retry = async () => {
      if (retryCount >= maxRetries) {
        //console.error('达到最大重试次数，未找到题目页面');
        return;
      }

      retryCount++;
      //console.log(`第 ${retryCount} 次重试查找题目页面...`);

      if (!await findQuestionTab()) {
        setTimeout(retry, retryInterval);
      }
    };

    retry();
  } else {
    // 直接发送答案
    chrome.tabs.sendMessage(questionTabId, {
      type: 'SHOW_ANSWER',
      answer: request.answer,
      aiType: request.aiType
    });
  }
}

// 处理问题发送
async function handleQuestion(request, fromTabId, sendResponse) {
  //console.log('正在处理问题...', request.aiType);
  const aiType = request.aiType;
  const config = AI_CONFIG[aiType];

  if (!config) {
    //console.error('未知的 AI 类型:', aiType);
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
    const window = await chrome.windows.create({
      url: config.url,
      type: 'popup',
      width: 1280,
      height: 800,
      focused: false
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
    sendResponse({ success: true });
  } catch (error) {
    config.tabId = null;
    config.windowId = null;
    sendResponse({ error: 'AI 页面未响应' });
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