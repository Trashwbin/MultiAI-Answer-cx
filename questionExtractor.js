function extractQuestionsFromXXT() {
  const questions = [];
  const questionDivs = document.querySelectorAll('.questionLi');

  questionDivs.forEach((div, index) => {
    // 获取题目类型和分数
    const typeSpan = div.querySelector('.colorShallow');
    const typeText = typeSpan ? typeSpan.textContent.match(/\((.*?)\)/) : null;
    const type = typeText ? typeText[1] : '未知类型';

    // 获取题目序号和内容
    const titleDiv = div.querySelector('.mark_name');
    const titleNumber = titleDiv ? titleDiv.firstChild.textContent.trim() : '';
    const contentDiv = titleDiv ? titleDiv.querySelector('div') : null;
    const content = contentDiv ? contentDiv.textContent.trim() : '';

    // 获取选项(如果是选择题)
    const options = [];
    const optionDivs = div.querySelectorAll('.stem_answer .answerBg');
    optionDivs.forEach(optDiv => {
      const optLabel = optDiv.querySelector('.num_option').textContent;
      const optContent = optDiv.querySelector('.answer_p').textContent;
      options.push(`${optLabel}. ${optContent}`);
    });

    // 检查填空题的空数
    const blankCount = div.querySelectorAll('.Answer.sub_que_div').length;

    // 构建题目对象
    const question = {
      id: div.getAttribute('data'),
      number: titleNumber,
      type: type,
      content: content,
      options: options,
      blankCount: blankCount // 添加空的数量
    };

    questions.push(question);
  });

  return questions;
}

function getQuestionType(typeStr) {
  for (const [type, config] of Object.entries(QUESTION_TYPES)) {
    if (config.subtypes.some(subtype => typeStr.includes(subtype))) {
      return type;
    }
  }
  return 'other';
} 