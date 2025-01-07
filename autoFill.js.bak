// 自动填写功能主函数
async function autoFillAnswers() {
  const questionRows = document.querySelectorAll('[class^="question-row-"]');

  for (const row of questionRows) {
    const questionNum = row.className.match(/question-row-(\d+)/)[1];
    const type = getQuestionTypeFromNumber(questionNum);
    console.log(`处理第 ${questionNum} 题，题型:`, type);

    // 获取最终答案
    const finalAnswerCol = row.querySelector('.final-answer');
    if (!finalAnswerCol) {
      console.error('未找到最终答案列:', questionNum);
      continue;
    }

    // 根据题型获取答案
    const handler = QuestionHandlerFactory.getHandler(type, questionNum, '');
    if (!handler) {
      console.error('未找到对应的处理器:', type);
      continue;
    }

    const answer = handler.getAnswer();
    if (!answer) {
      console.log(`第 ${questionNum} 题未选择答案`);
      continue;
    }

    console.log(`第 ${questionNum} 题答案:`, answer);

    // 添加随机延迟
    const delay = Math.floor(Math.random() * 3000) + 2000;
    console.log(`等待 ${delay}ms 后填写题目 ${questionNum}`);
    await new Promise(resolve => setTimeout(resolve, delay));

    // 执行填写
    await autoFillQuestion(questionNum, answer, type);
  }
}

// 根据题型执行填写
async function autoFillQuestion(questionNum, answer, type) {
  // 查找题目元素
  const questionElement = findQuestionElement(questionNum);
  if (!questionElement) {
    console.error('未找到题目:', questionNum);
    return;
  }

  switch (type) {
    case window.QUESTION_TYPES.SINGLE_CHOICE:
      await fillSingleChoice(questionElement, answer);
      break;

    case window.QUESTION_TYPES.MULTIPLE_CHOICE:
      await fillMultipleChoice(questionElement, answer);
      break;

    case window.QUESTION_TYPES.FILL_BLANK:
      await fillBlank(questionElement, answer);
      break;

    case window.QUESTION_TYPES.JUDGE:
      await fillJudge(questionElement, answer);
      break;

    case window.QUESTION_TYPES.QA:
    case window.QUESTION_TYPES.WORD_DEFINITION:
    case window.QUESTION_TYPES.OTHER:
      await fillQA(questionElement, answer);
      break;

    default:
      console.error('未知题型:', type);
  }
}

// 查找题目元素
function findQuestionElement(questionNum) {
  // 按优先级尝试不同的查找方式
  return (
    document.querySelector(`.questionLi[data="${questionNum}"]`) ||
    document.querySelector(`#sigleQuestionDiv_${questionNum}`) ||
    Array.from(document.querySelectorAll('.questionLi')).find(q => {
      const titleNumber = q.querySelector('.mark_name')?.textContent?.trim()?.split('.')[0];
      return titleNumber === questionNum.toString();
    })
  );
}

// 填写单选题
async function fillSingleChoice(questionElement, answer) {
  const options = questionElement.querySelectorAll('.answerBg');
  let found = false;

  options.forEach(option => {
    const optionLabel = option.querySelector('.num_option_dx')?.textContent?.trim();
    if (optionLabel === answer) {
      found = true;
      clickElement(option);
    }
  });

  if (!found) {
    console.log('未找到匹配选项:', answer);
  }
}

// 填写多选题
async function fillMultipleChoice(questionElement, answer) {
  const options = questionElement.querySelectorAll('.answerBg');
  const answerLetters = answer.split('');
  let foundCount = 0;

  options.forEach(option => {
    const optionLabel = option.querySelector('.num_option_dx')?.textContent?.trim();
    if (answerLetters.includes(optionLabel)) {
      foundCount++;
      clickElement(option);
    }
  });

  if (foundCount !== answerLetters.length) {
    console.log('部分选项未找到:', answer);
  }
}

// 填写填空题
async function fillBlank(questionElement, answer) {
  const answers = answer.split('\n')
    .map(line => {
      const match = line.match(/第(\d+)空[:：](.+)/);
      return match ? { index: parseInt(match[1]), content: match[2].trim() } : null;
    })
    .filter(Boolean);

  for (const { index, content } of answers) {
    const answerDiv = questionElement.querySelector(`.Answer.sub_que_div[dataid="${questionElement.getAttribute('data')}${index}"]`);
    if (!answerDiv) continue;

    await fillEditor(answerDiv, content);
  }
}

// 填写判断题
async function fillJudge(questionElement, answer) {
  const options = questionElement.querySelectorAll('.answerBg');
  options.forEach(option => {
    const optionText = option.textContent.trim();
    if ((answer === 'A' && optionText.includes('正确')) ||
      (answer === 'B' && optionText.includes('错误'))) {
      clickElement(option);
    }
  });
}

// 填写问答题
async function fillQA(questionElement, answer) {
  const answerDiv = questionElement.querySelector('.stem_answer.examAnswer');
  if (!answerDiv) return;

  await fillEditor(answerDiv, answer);
}

// 通用编辑器填写函数
async function fillEditor(answerDiv, content) {
  try {
    // 点击答题区域激活编辑器
    answerDiv.click();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 找到并填写编辑器
    const editorFrame = answerDiv.querySelector('.edui-editor-iframeholder iframe');
    if (!editorFrame) return;

    const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
    const editorBody = editorDoc.body;
    editorBody.innerHTML = `<p>${content}</p>`;

    // 触发编辑器事件
    editorBody.dispatchEvent(new Event('input', { bubbles: true }));

    // 点击保存
    const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn');
    if (saveBtn) {
      saveBtn.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.error('填写答案失败:', error);
  }
}

// 安全的元素点击函数
function clickElement(element) {
  try {
    element.click();
  } catch (error) {
    try {
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    } catch (dispatchError) {
      console.error('点击事件触发失败:', dispatchError);
    }
  }
}

// 导出函数
window.autoFillAnswers = autoFillAnswers; 