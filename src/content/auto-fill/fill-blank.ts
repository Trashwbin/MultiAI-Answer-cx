function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

function setEditorContent(
  answerContainer: Element,
  text: string,
  questionId: string | null,
  blankIndex: number,
): boolean {
  const editorFrame = answerContainer.querySelector<HTMLIFrameElement>(
    '.edui-editor-iframeholder iframe',
  );

  if (!editorFrame) {
    return false;
  }

  editorFrame.click();

  const editorDoc =
    editorFrame.contentDocument ??
    editorFrame.contentWindow?.document;

  if (!editorDoc) {
    return false;
  }

  const editorBody = editorDoc.body;
  editorBody.innerHTML = `<p>${text}</p>`;

  editorBody.dispatchEvent(
    new Event('input', { bubbles: true, cancelable: true }),
  );

  const examDiv = answerContainer.querySelector(
    '.divText.examAnswer, .divText.fl.wid750',
  );
  const searchRoot = examDiv ?? answerContainer;

  let textarea = searchRoot.querySelector<HTMLTextAreaElement>(
    'textarea[name^="answerEditor"]',
  );

  if (!textarea && questionId) {
    const name = `answerEditor${questionId}${blankIndex + 1}`;
    textarea = searchRoot.querySelector<HTMLTextAreaElement>(
      `textarea[name="${name}"]`,
    );
  }

  if (textarea) {
    textarea.value = `<p>${text}</p>`;
    textarea.dispatchEvent(
      new Event('change', { bubbles: true, cancelable: true }),
    );
  }

  const saveBtn = answerContainer.querySelector<HTMLElement>(
    '.savebtndiv .jb_btn, .saveAnswer',
  );
  if (saveBtn) {
    saveBtn.click();
  }

  return true;
}

export async function fillBlankAnswers(
  questionDiv: Element,
  answers: string[],
): Promise<boolean> {
  const answerDivs = questionDiv.querySelectorAll('.sub_que_div, .Answer');
  const questionId = questionDiv.getAttribute('data');
  let filledAny = false;

  for (let i = 0; i < answerDivs.length; i++) {
    const answer = answers[i];
    if (!answer) continue;

    const container = answerDivs[i];
    if (!container) continue;

    if (filledAny) {
      await randomDelay(500, 1500);
    }

    const filled = setEditorContent(container, answer, questionId, i);
    if (filled) {
      filledAny = true;
    }
  }

  return filledAny;
}
