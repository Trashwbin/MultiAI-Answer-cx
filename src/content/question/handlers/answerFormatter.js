// 格式化答案和解析
function formatAnswerWithAnalysis(answer) {
  // 初始化结果对象
  const result = {
    answer: '',
    analysis: ''
  };

  // 如果没有答案，直接返回空结果
  if (!answer || typeof answer !== 'string') {
    return result;
  }

  // 提取答案和解析
  // 首先尝试匹配"答案："后面的内容
  const answerMatch = answer.match(/答案[:：]\s*([\s\S]+?)(?=\s*解析[:：]|$)/);
  const analysisMatch = answer.match(/解析[:：]\s*([\s\S]+)$/);

  // 设置答案
  if (answerMatch) {
    result.answer = answerMatch[1].trim();
  } else {
    // 如果没有找到"答案："标记，尝试直接提取第一部分内容
    const firstPart = answer.split(/\s*解析[:：]/)[0];
    result.answer = firstPart.trim();
  }

  // 设置解析
  if (analysisMatch) {
    result.analysis = analysisMatch[1].trim();
  }

  return result;
}

// 导出函数
window.formatAnswerWithAnalysis = formatAnswerWithAnalysis;
