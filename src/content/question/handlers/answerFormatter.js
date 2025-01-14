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
  const answerMatch = answer.match(/答案[:：]\s*([^解析]+)(?=解析|$)/);
  const analysisMatch = answer.match(/解析[:：]\s*([\s\S]+)$/);

  // 设置答案
  if (answerMatch) {
    result.answer = answerMatch[1].trim();
  } else {
    result.answer = answer.trim();
  }

  // 设置解析
  if (analysisMatch) {
    result.analysis = analysisMatch[1].trim();
  }

  return result;
}

// 导出函数
window.formatAnswerWithAnalysis = formatAnswerWithAnalysis;
