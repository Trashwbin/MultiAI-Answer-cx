function formatAsHtml(answer: string): string {
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');
}

export function fillQAAnswer(
  questionDiv: Element,
  answer: string,
): boolean {
  const answerDiv = questionDiv.querySelector(
    '.stem_answer.examAnswer, .stem_answer',
  );
  if (!answerDiv) {
    return false;
  }

  const editorFrame = answerDiv.querySelector<HTMLIFrameElement>(
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

  const formatted = formatAsHtml(answer);
  const editorBody = editorDoc.body;
  editorBody.innerHTML = formatted;

  editorBody.dispatchEvent(
    new Event('input', { bubbles: true, cancelable: true }),
  );

  const textarea = answerDiv.querySelector<HTMLTextAreaElement>(
    'textarea[name^="answer"]',
  );
  if (textarea) {
    textarea.value = formatted;
    textarea.dispatchEvent(
      new Event('change', { bubbles: true, cancelable: true }),
    );
  }

  const saveBtn = answerDiv.querySelector<HTMLElement>(
    '.savebtndiv .jb_btn',
  );
  if (saveBtn) {
    saveBtn.click();
  }

  return true;
}
