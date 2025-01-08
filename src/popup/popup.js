document.addEventListener('DOMContentLoaded', function () {
  // 获取按钮元素
  const showQuestionsBtn = document.querySelector('.show-questions');
  const showAnswersBtn = document.querySelector('.show-answers');

  // 显示题目列表按钮点击事件
  showQuestionsBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'showQuestionList' }, (response) => {
      if (response && response.success) {
        // 如果成功且没有重定向，关闭弹出窗口
        if (!response.redirected) {
          window.close();
        }
      } else if (response && response.cancelled) {
        // 如果用户取消了跳转，不关闭弹出窗口
        return;
      } else {
        // 如果发生错误，显示错误信息
        console.error('显示题目列表失败:', response?.error);
      }
    });
  });

  // 显示AI答案按钮点击事件
  showAnswersBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'showAnswers' }, (response) => {
      if (response && response.success) {
        window.close();
      } else {
        console.error('显示AI答案失败:', response?.error);
      }
    });
  });
}); 