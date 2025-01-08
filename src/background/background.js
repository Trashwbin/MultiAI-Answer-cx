// AI 配置
const AI_CONFIG = {
  kimi: {
    url: 'https://kimi.moonshot.cn/',
    tabId: null
  },
  deepseek: {
    url: 'https://chat.deepseek.com/',
    tabId: null
  },
  tongyi: {
    url: 'https://tongyi.aliyun.com/',
    tabId: null
  },
  chatglm: {
    url: 'https://chatglm.cn/',
    tabId: null
  },
  doubao: {
    url: 'https://doubao.com/',
    tabId: null
  }
};

let questionTabId = null;

// 存储每个AI的更新检查定时器
const updateIntervals = {};

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // 查找匹配的 AI
    Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
      if (tab.url.includes(new URL(config.url).hostname)) {
        //console.log(`找到 ${aiType} 标签页:`, tabId);
        config.tabId = tabId;
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
chrome.tabs.onRemoved.addListener((tabId) => {
  // 检查是否是 AI 标签页
  Object.entries(AI_CONFIG).forEach(([aiType, config]) => {
    if (config.tabId === tabId) {
      //console.log(`${aiType} 标签页已关闭，重置 tabId`);
      config.tabId = null;
    }
  });

  // 检查是否是题目标签页
  if (tabId === questionTabId) {
    //console.log('题目标签页已关闭，重置 questionTabId');
    questionTabId = null;
  }

  if (updateIntervals[tabId]) {
    clearInterval(updateIntervals[tabId]);
    delete updateIntervals[tabId];
  }
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

  // 检查现有标签页是否可用
  if (targetTabId) {
    try {
      const tab = await chrome.tabs.get(targetTabId);
      if (!tab || !tab.url || !tab.url.includes(new URL(config.url).hostname)) {
        //console.log(`${aiType} 标签页状态异常，需要重新创建`);
        targetTabId = null;
        config.tabId = null;
      }
    } catch (error) {
      //console.log(`${aiType} 标签页不存在，需要重新创建`);
      targetTabId = null;
      config.tabId = null;
    }
  }

  // 如果目标AI标签页不存在或不可用，创建一个
  if (!targetTabId) {
    //console.log(`正在打开 ${aiType} 页面...`);
    const tab = await chrome.tabs.create({
      url: config.url,
      active: false
    });
    targetTabId = tab.id;
    config.tabId = tab.id;

    // 等待页面完全加载和初始化
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

      const listener = (tabId, changeInfo) => {
        if (tabId === targetTabId && changeInfo.status === 'complete') {
          setTimeout(checkReady, 1000); // 给页面一些额外的初始化时间
        }
      };

      chrome.tabs.onUpdated.addListener(listener);

      // 设置超时，避免无限等待
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30000);
    });
  }

  // 重试发送消息
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(targetTabId, {
          type: 'ASK_QUESTION',
          question: request.question
        }, response => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });

      //console.log('AI页面响应:', response);
      if (response && response.success) {
        sendResponse({ success: true });
        return;
      }
    } catch (error) {
      //console.log(`第 ${retryCount + 1} 次发送失败:`, error);
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // 如果所有重试都失败了
  //console.log(`${aiType} 页面未响应，标记为需要重新创建`);
  config.tabId = null;
  sendResponse({ error: 'AI页面未响应' });
}

// 添加处理切换标签页的函数
async function handleSwitchTab(aiType) {
  const config = AI_CONFIG[aiType];
  if (!config || !config.tabId) {
    //console.error('未找到对应的AI标签页:', aiType);
    return;
  }

  try {
    // 检查标签页是否存在
    const tab = await chrome.tabs.get(config.tabId);
    if (tab) {
      // 激活标签页
      await chrome.tabs.update(config.tabId, { active: true });
      // 如果标签页在其他窗口，也需要激活那个窗口
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } catch (error) {
    //console.error('切换标签页失败:', error);
    // 如果标签页不存在，重置 tabId
    config.tabId = null;
  }
} 