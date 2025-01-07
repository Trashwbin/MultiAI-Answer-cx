document.addEventListener('DOMContentLoaded', function () {
  // 获取按钮元素
  const showQuestionsBtn = document.querySelector('.show-questions');
  const showAnswersBtn = document.querySelector('.show-answers');

  // 显示题目列表按钮点击事件
  showQuestionsBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'showQuestionList' });
    window.close(); // 关闭弹出窗口
  });

  // 显示AI答案按钮点击事件
  showAnswersBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'showAnswers' });
    window.close(); // 关闭弹出窗口
  });
}); 