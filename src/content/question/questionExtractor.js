// 定义题型常量
window.QUESTION_TYPES = {
  SINGLE_CHOICE: '单选题',
  MULTIPLE_CHOICE: '多选题',
  FILL_BLANK: '填空题',
  JUDGE: '判断题',
  QA: '简答题',
  WORD_DEFINITION: '名词解释',
  OTHER: '其他'
};

// 从题目页面提取选项
function extractOptionsFromQuestion(questionDiv, questionType) {
  //console.log(`\n开始提取选项，题型: ${questionType}`);
  const options = [];

  // 处理常规选项
  //console.log('处理常规选项');
  const optionDivs = questionDiv.querySelectorAll('.stem_answer .answerBg');
  //console.log(`找到 ${optionDivs.length} 个选项元素`);

  optionDivs.forEach((optionDiv, index) => {
    const optionSpan = optionDiv.querySelector('span[data]');
    const optionLabel = optionSpan?.textContent?.trim();
    const optionText = optionDiv.querySelector('.answer_p')?.textContent?.trim();

    //console.log(`选项 ${index + 1}:`, {
    //   label: optionLabel,
    //     text: optionText,
    //       data: optionSpan?.getAttribute('data')
    // });

    if (optionLabel && optionText) {
      options.push(`${optionLabel}. ${optionText}`);
    }
  });

  //console.log('提取到的所有选项:', options);
  return options;
}

// 获取填空题空的数量
function getBlankCount(questionDiv) {
  //console.log('开始获取填空题空的数量');
  // 查找所有填空题的空
  const blankSpans = questionDiv.querySelectorAll('.stem_answer .tiankong');
  const blankCount = blankSpans.length;
  //console.log(`找到 ${blankCount} 个填空`);
  return blankCount;
}

// 添加复制按钮到题目
function addCopyButton(questionDiv) {
  // 检查是否启用复制按钮功能
  if (!window.copyBtnEnabled) return;

  const copyButton = document.createElement('button');
  copyButton.className = 'copy-question-btn';
  copyButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;

  copyButton.style.cssText = `
    position: absolute;
    left: -20px;
    top: 10px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
    color: #666;
    z-index: 1000;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;

  // 添加悬浮效果
  questionDiv.style.position = 'relative';

  questionDiv.addEventListener('mouseenter', () => {
    copyButton.style.opacity = '1';
    copyButton.style.transform = 'scale(1)';
  });

  questionDiv.addEventListener('mouseleave', () => {
    copyButton.style.opacity = '0';
    copyButton.style.transform = 'scale(0.95)';
  });

  copyButton.addEventListener('mouseenter', () => {
    copyButton.style.backgroundColor = '#f5f5f5';
    copyButton.style.transform = 'scale(1.05)';
  });

  copyButton.addEventListener('mouseleave', () => {
    copyButton.style.backgroundColor = 'white';
    copyButton.style.transform = 'scale(1)';
  });

  // 点击事件
  copyButton.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (copyButton.disabled) return;
    await window.copyQuestionAsImage(questionDiv, copyButton);
  });

  questionDiv.appendChild(copyButton);
}

// 修改原有的提取题目函数
function extractQuestionsFromXXT() {
  const questions = [];
  let globalQuestionNumber = 1;

  //console.log('开始提取题目...');

  // 获取所有题目
  const questionDivs = document.querySelectorAll('.questionLi');
  //console.log(`找到 ${questionDivs.length} 个题目`);

  questionDivs.forEach((div, index) => {
    // 获取题目基本信息
    const titleElem = div.querySelector('.mark_name');
    if (!titleElem) {
      //console.log('未找到题目标题元素，跳过');
      return;
    }

    // 添加复制按钮
    addCopyButton(div);

    const titleText = titleElem.textContent.trim();
    const [number, ...rest] = titleText.split('.');
    const type = rest.join('.').match(/\((.*?)[,，]/)?.[1]?.trim() || '其他';

    //   console.log('题目信息:', {    titleText,
    //     number: number.trim(),
    //       type
    // });

    // 获取题目内容
    const contentDiv = titleElem.querySelector('div');
    const content = contentDiv?.textContent?.trim() || '';
    //console.log('题目内容:', content);

    // 获取题目类型
    const questionType = getQuestionType(type);
    //console.log('识别的题型:', questionType);

    // 获取选项
    const options = extractOptionsFromQuestion(div, questionType);
    //console.log('提取的选项:', options);

    // 获取填空题空的数量
    let blankCount = 0;
    if (questionType === window.QUESTION_TYPES.FILL_BLANK) {
      blankCount = getBlankCount(div);
      //console.log('填空数量:', blankCount);
    }

    // 创建题目对象
    const question = {
      id: div.getAttribute('data'),
      number: globalQuestionNumber.toString(),
      originalNumber: number.trim() + '.',
      type: type,
      questionType: questionType,
      content: content,
      options: options,
      optionsHtml: options.map(opt => `<div class="option-item">${opt}</div>`).join(''),
      blankCount: blankCount
    };

    //console.log('处理完成的题目对象:', question);
    questions.push(question);
    globalQuestionNumber++;
  });

  //console.log('\n题目提取完成，总共提取到', questions.length, '个题目');
  //console.log('完整题目列表:', questions);

  // 保存到全局变量
  window.extractedQuestions = questions;

  return questions;
}

// 判断题目类型
function getQuestionType(typeStr) {
  if (!typeStr) return window.QUESTION_TYPES.OTHER;

  const typeText = typeStr.toLowerCase();

  if (typeText.includes('单选题')) {
    return window.QUESTION_TYPES.SINGLE_CHOICE;
  } else if (typeText.includes('多选题')) {
    return window.QUESTION_TYPES.MULTIPLE_CHOICE;
  } else if (typeText.includes('填空题')) {
    return window.QUESTION_TYPES.FILL_BLANK;
  } else if (typeText.includes('判断题')) {
    return window.QUESTION_TYPES.JUDGE;
  } else if (typeText.includes('简答题')) {
    return window.QUESTION_TYPES.QA;
  } else if (typeText.includes('名词解释')) {
    return window.QUESTION_TYPES.WORD_DEFINITION;
  }

  return window.QUESTION_TYPES.OTHER;
}

// 确保在使用前已定义
if (!window.QUESTION_TYPES) {
  //console.error('QUESTION_TYPES not defined!');
}

// 恢复水印移除功能
function removeWatermarks() {
  const watermarks = document.querySelectorAll('div[id^="mask_div"]');
  watermarks.forEach(watermark => {
    watermark.remove();
  });
}

document.addEventListener('DOMContentLoaded', removeWatermarks);
setInterval(removeWatermarks, 2000);

// 其他函数也通过 window 导出
window.extractQuestionsFromXXT = extractQuestionsFromXXT;
window.getQuestionType = getQuestionType; 