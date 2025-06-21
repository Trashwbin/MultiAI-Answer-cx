// 自动填写功能
async function autoFillAnswers() {
  const questionRows = document.querySelectorAll('[class^="question-row-"]');

  for (const row of questionRows) {
    try {
      // 获取题目ID和类型
      const questionId = row.dataset.id;
      const questionNumber = row.dataset.number;

      if (!questionId || !questionNumber) {
        //console.error('未找到题目ID或题号');
        continue;
      }

      // 从保存的题目信息中获取类型
      const questionInfo = getQuestionInfo(questionNumber);
      if (!questionInfo) {
        //console.error('未找到题目信息:', questionNumber);
        continue;
      }

      const type = questionInfo.type;
      //console.log(`处理题目 ID: ${questionId}, 题号: ${questionNumber}, 题型:`, type);

      // 根据题型获取答案
      let answer;
      const finalAnswerCol = row.querySelector('.final-answer');
      if (!finalAnswerCol) {
        //console.error('未找到最终答案列:', questionId);
        continue;
      }

      switch (type) {
        case window.QUESTION_TYPES.SINGLE_CHOICE:
        case window.QUESTION_TYPES.MULTIPLE_CHOICE:
          // 选择题答案获取
          if (type === window.QUESTION_TYPES.MULTIPLE_CHOICE) {
            const multiInput = finalAnswerCol.querySelector('.multiple-choice-input input');
            answer = multiInput?.value || '';
          } else {
            const radioChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
            if (radioChecked && radioChecked.value === 'other') {
              const customInput = finalAnswerCol.querySelector('.custom-option-input');
              answer = customInput?.value || '';
            } else {
              answer = radioChecked?.value || '';
            }
          }
          break;

        case window.QUESTION_TYPES.FILL_BLANK:
          // 填空题答案获取
          const blankInputs = finalAnswerCol.querySelectorAll('.blank-input');
          answer = Array.from(blankInputs).map(input => input.value.trim());
          break;

        case window.QUESTION_TYPES.JUDGE:
          // 判断题答案获取
          const judgeChecked = finalAnswerCol.querySelector('input[type="radio"]:checked');
          answer = judgeChecked?.value || '';
          break;

        case window.QUESTION_TYPES.QA:
        case window.QUESTION_TYPES.WORD_DEFINITION:
        case window.QUESTION_TYPES.OTHER:
          // 问答题和其他题型答案获取
          const textarea = finalAnswerCol.querySelector('.answer-textarea');
          answer = textarea?.value || '';
          break;

        default:
          //console.log('未知题型:', type);
          continue;
      }

      if (!answer || (Array.isArray(answer) && answer.every(a => !a))) {
        //console.log(`题目 ${questionId} 未选择答案`);
        continue;
      }

      //console.log(`题目 ${questionId} 答案:`, answer);

      // 根据题型执行不同的填写逻辑
      await autoFill(questionId, answer, type);
    } catch (error) {
      //console.error('处理题目时出错:', error);
    }
  }

  // 填写完所有题目后，检查是否为作业模块并调用暂时保存
  try {
    // 检查是否存在作业模块的暂时保存按钮
    const saveWorkBtn = document.querySelector('a[onclick="saveWork();"]');
    if (saveWorkBtn) {
      //console.log('检测到作业模块，调用暂时保存');
      // 添加延迟确保所有填写操作完成
      await new Promise(resolve => setTimeout(resolve, 2000));
      saveWorkBtn.click();
      //console.log('已调用暂时保存按钮');
    }
  } catch (error) {
    //console.error('调用暂时保存失败:', error);
  }
}

// 添加自动填写的具体实现函数
async function autoFill(questionId, answer, type) {
  //console.log(`处理题目 ID: ${questionId}，题型: ${type}`);

  // 找到题目元素
  const questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`) ||
    document.querySelector(`.questionLi[data="${questionId}"]`);

  if (questionDiv) {
    // 滚动到题目位置，添加一些偏移以确保题目完全可见
    questionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 等待滚动完成
    await new Promise(resolve => setTimeout(resolve, 500));
    // 添加随机延迟
    const delay = Math.floor(Math.random() * 2000) + 1000;
    //console.log(`等待 ${delay}ms 后填写题目 ${questionId}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    // 根据题型执行不同的填写逻辑
    switch (type) {
      case window.QUESTION_TYPES.SINGLE_CHOICE:
      case window.QUESTION_TYPES.MULTIPLE_CHOICE:
        await autoFillChoice(questionId, answer);
        break;

      case window.QUESTION_TYPES.FILL_BLANK:
        await autoFillBlank(questionId, answer);
        break;

      case window.QUESTION_TYPES.JUDGE:
        await autoFillJudge(questionId, answer);
        break;

      case window.QUESTION_TYPES.QA:
      case window.QUESTION_TYPES.WORD_DEFINITION:
      case window.QUESTION_TYPES.OTHER:
        await autoFillQA(questionId, answer);
        break;

      default:
      //console.log('未知题型:', type);
    }
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改选择题填写函数
async function autoFillChoice(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillChoiceAnswer(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改填空题填写函数
async function autoFillBlank(questionId, answers) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillBlankAnswers(questionDiv, answers);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改判断题填写函数
async function fillJudgeAnswers(questionDiv, answer) {
  try {
    //console.log('开始填写判断题答案:', answer);

    // 查找所有选项
    const options = questionDiv.querySelectorAll('.answerBg');
    if (!options || options.length === 0) {
      //console.error('未找到选项');
      return;
    }

    // 处理答案格式
    let processedAnswer = answer;
    if (answer === 'A' || answer.includes('对') || answer.includes('√')) {
      processedAnswer = 'true';
    } else if (answer === 'B' || answer.includes('错') || answer.includes('×')) {
      processedAnswer = 'false';
    }

    //console.log('处理后的答案:', processedAnswer);

    // 遍历选项找到匹配的
    let found = false;
    options.forEach(option => {
      const optionSpan = option.querySelector('.num_option');
      if (!optionSpan) return;

      const optionValue = optionSpan.getAttribute('data');
      const isChecked = optionSpan.classList.contains('check_answer');

      if (optionValue === processedAnswer && !isChecked) {
        found = true;
        //console.log('选择选项:', optionValue);
        try {
          option.click();
        } catch (error) {
          //console.error('点击选项失败，尝试使用事件分发:', error);
          try {
            option.dispatchEvent(new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            }));
          } catch (dispatchError) {
            //console.error('分发点击事件失败:', dispatchError);
          }
        }
      }
    });

    if (!found) {
      //console.log('未找到需要选择的选项:', answer);
    }

  } catch (error) {
    //console.error('填写判断题答案失败:', error);
  }
}

// 修改判断题自动填写函数
async function autoFillJudge(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillJudgeAnswers(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

// 修改问答题填写函数
async function autoFillQA(questionId, answer) {
  // 优先使用 data 属性查找
  let questionDiv = document.querySelector(`.questionLi[data="${questionId}"]`);

  // 如果找不到，尝试使用 id
  if (!questionDiv) {
    questionDiv = document.querySelector(`#sigleQuestionDiv_${questionId}`);
  }

  if (questionDiv) {
    //console.log('找到题目:', questionDiv);
    await fillQAAnswers(questionDiv, answer);
  } else {
    //console.error('未找到题目:', questionId);
  }
}

async function fillQAAnswers(questionDiv, answer) {
  try {
    // 1. 找到答题区域 - 兼容考试和作业模块
    const answerDiv = questionDiv.querySelector('.stem_answer.examAnswer, .stem_answer');
    if (!answerDiv) {
      //console.error('未找到答题区域');
      return;
    }

    // 2. 找到编辑器的 iframe
    const editorFrame = answerDiv.querySelector('.edui-editor-iframeholder iframe');
    if (!editorFrame) {
      //console.error('未找到编辑器 iframe');
      return;
    }

    // 3. 点击编辑区域激活编辑器
    editorFrame.click();
    //console.log('点击编辑区域');
    await new Promise(resolve => setTimeout(resolve, 100));

    // 4. 在编辑器中输入内容，确保每个点都单独一行
    const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
    const editorBody = editorDoc.body;

    // 处理答案，确保每个点都在新的一行
    const formattedAnswer = answer.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p>${line}</p>`)
      .join('');

    editorBody.innerHTML = formattedAnswer;
    //console.log('设置答案内容');

    // 5. 触发编辑器的 input 事件
    editorBody.dispatchEvent(new Event('input', {
      bubbles: true,
      cancelable: true
    }));

    // 6. 查找textarea并更新其值（作业模块需要）
    const textarea = answerDiv.querySelector('textarea[name^="answer"]');
    if (textarea) {
      textarea.value = formattedAnswer;
      // 触发textarea的change事件
      textarea.dispatchEvent(new Event('change', {
        bubbles: true,
        cancelable: true
      }));
    }

    // 7. 触发contentChange事件（作业模块特有）
    const editorInstance = window.UE.getEditor(textarea?.id);
    if (editorInstance) {
      editorInstance.fireEvent('contentChange');
    }

    // 8. 处理保存
    // 对于考试页面，使用保存按钮
    const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn');
    if (saveBtn) {
      //console.log('点击保存按钮');
      saveBtn.click();
    } else {
      // 对于作业页面，触发答案变更函数
      if (typeof window.loadEditorAnswerd === 'function') {
        const questionId = questionDiv.getAttribute('data');
        window.loadEditorAnswerd(questionId, 4); // 4表示简答题类型
      }
      if (typeof window.answerContentChange === 'function') {
        window.answerContentChange();
      }
    }

    // 等待保存完成
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    //console.error('填写答案失败:', error);
  }
}

// 添加填空题答案填写函数
async function fillBlankAnswers(questionDiv, answers) {
  try {
    //console.log('开始填写填空题答案:', answers);

    // 确保答案数组格式正确
    let processedAnswers = answers;
    if (typeof answers === 'string') {
      // 如果是字符串，尝试解析答案
      processedAnswers = answers.split('\n')
        .map(line => {
          const match = line.match(/第(\d+)空[:：](.+)/);
          return match ? match[2].trim() : null;
        })
        .filter(Boolean);
    }

    console.log('处理后的答案:', processedAnswers);

    // 查找所有填空的编辑器区域
    // 支持考试和作业页面的不同结构
    const answerDivs = questionDiv.querySelectorAll('.sub_que_div, .Answer');
    console.log('找到填空数量:', answerDivs.length);

    for (let i = 0; i < answerDivs.length; i++) {
      try {
        const answerDiv = answerDivs[i];
        const answer = processedAnswers[i];
        console.log(`处理第 ${i + 1} 空，答案:`, answer);

        if (!answer) {
          console.log(`第 ${i + 1} 空没有答案，跳过`);
          continue;
        }

        // 添加随机延迟
        const delay = Math.floor(Math.random() * 1000) + 500;
        await new Promise(resolve => setTimeout(resolve, delay));

        // 1. 找到答题区域 - 支持不同的页面结构
        const examAnswerDiv = answerDiv.querySelector('.divText.examAnswer, .divText.fl.wid750');
        if (!examAnswerDiv) {
          console.log(`第 ${i + 1} 空未找到答题区域`);
          continue;
        }

        // 2. 找到编辑器的 iframe
        const editorFrame = examAnswerDiv.querySelector('.edui-editor-iframeholder iframe');
        if (!editorFrame) {
          console.log(`第 ${i + 1} 空未找到编辑器 iframe`);
          continue;
        }

        console.log(`开始填写第 ${i + 1} 空，答案: ${answer}`);

        // 3. 点击编辑区域激活编辑器
        editorFrame.click();
        //console.log('点击编辑区域');
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. 在编辑器中输入内容
        const editorDoc = editorFrame.contentDocument || editorFrame.contentWindow.document;
        const editorBody = editorDoc.body;
        editorBody.innerHTML = `<p>${answer}</p>`;
        //console.log(`设置第 ${i + 1} 空的答案:`, answer);

        // 5. 触发编辑器的 input 事件
        editorBody.dispatchEvent(new Event('input', {
          bubbles: true,
          cancelable: true
        }));

        // 6. 查找textarea并更新其值（作业模块需要）
        const questionId = questionDiv.getAttribute('data');
        let textarea = examAnswerDiv.querySelector('textarea[name^="answerEditor"]');

        // 对于作业模块的多空题，尝试精确匹配textarea
        if (!textarea && questionId) {
          // 构建精确的textarea name: answerEditor{questionId}{空序号}
          const textareaName = `answerEditor${questionId}${i + 1}`;
          textarea = examAnswerDiv.querySelector(`textarea[name="${textareaName}"]`);
        }

        if (textarea) {
          textarea.value = `<p>${answer}</p>`;
          // 触发textarea的change事件
          textarea.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: true
          }));

          // 7. 触发contentChange事件（作业模块特有）
          if (window.UE && typeof window.UE.getEditor === 'function') {
            const editorInstance = window.UE.getEditor(textarea.id);
            if (editorInstance) {
              editorInstance.fireEvent('contentChange');
            }
          } else {
            console.log('UEditor不可用，跳过contentChange事件');
          }
        }

        // 8. 处理保存
        // 对于考试页面，使用保存按钮
        const saveBtn = answerDiv.querySelector('.savebtndiv .jb_btn, .saveAnswer');
        if (saveBtn) {
          //console.log('点击保存按钮');
          saveBtn.click();
        } else {
          // 对于作业页面，触发答案变更函数
          if (typeof window.loadEditorAnswerd === 'function') {
            const questionId = questionDiv.getAttribute('data');
            window.loadEditorAnswerd(questionId, 2);
          }
          if (typeof window.answerContentChange === 'function') {
            window.answerContentChange();
          }
        }

        // 等待保存完成
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log(`第 ${i + 1} 空处理完成`);
      } catch (singleError) {
        console.error(`第 ${i + 1} 空处理失败:`, singleError);
      }
    }

    console.log('所有填空处理完成');

  } catch (error) {
    console.error('填写填空题答案失败:', error);
  }
}

// 添加选择题答案填写函数
async function fillChoiceAnswer(questionDiv, answer) {
  try {
    //console.log('开始填写选择题答案:', answer);
    const options = questionDiv.querySelectorAll('.answerBg');
    let found = false;

    // 处理多选题答案
    if (answer.includes(';') || answer.length > 1) {
      // 将答案转换为大写字母数组
      const selectedOptions = Array.isArray(answer) ? answer :
        answer.replace(/[^A-Za-z]/g, '').toUpperCase().split('');
      //console.log('多选题选项:', selectedOptions);

      // 先处理需要取消选择的选项
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option_dx');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer_dx');
        const shouldBeSelected = selectedOptions.includes(optionLabel);

        // 如果已选但不应该被选中，则取消选择
        if (isChecked && !shouldBeSelected) {
          //console.log('取消选择选项:', optionLabel);
          await clickWithDelay(option);
          // 添加随机延迟
          const delay = Math.floor(Math.random() * 1000) + 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // 再处理需要选择的选项
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option_dx');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer_dx');

        if (selectedOptions.includes(optionLabel) && !isChecked) {
          found = true;
          //console.log('选择选项:', optionLabel);
          await clickWithDelay(option);
          // 添加随机延迟
          const delay = Math.floor(Math.random() * 1000) + 500;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } else {
      // 处理单选题答案
      //console.log('单选题答案:', answer);
      for (const option of options) {
        const optionSpan = option.querySelector('.num_option');
        if (!optionSpan) continue;

        const optionLabel = optionSpan.textContent.trim();
        const isChecked = optionSpan.classList.contains('check_answer');

        if (optionLabel === answer.toUpperCase() && !isChecked) {
          found = true;
          //console.log('选择选项:', optionLabel);
          await clickWithDelay(option);
        }
      }
    }

    if (!found) {
      //console.log('未找到需要选择的选项:', answer);
    }
  } catch (error) {
    //console.error('填写选择题答案失败:', error);
  }
}

// 添加点击延迟函数
async function clickWithDelay(element) {
  try {
    // 尝试直接点击
    element.click();
  } catch (error) {
    //console.error('点击选项失败，尝试使用事件分发:', error);
    try {
      // 如果直接点击失败，尝试使用事件分发
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    } catch (dispatchError) {
      //console.error('分发点击事件失败:', dispatchError);
    }
  }
  // 添加点击后的延迟
  await new Promise(resolve => setTimeout(resolve, 1000));
}

// 导出函数
window.autoFillAnswers = autoFillAnswers;
window.autoFill = autoFill; 