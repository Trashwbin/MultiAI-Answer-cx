const CLICK_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

function clickElement(el: Element): void {
  try {
    (el as HTMLElement).click();
  } catch {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  }
}

function parseSubAnswers(answer: string | string[]): string[] {
  if (Array.isArray(answer)) return answer;

  // Try "(N) X" pattern first
  const parenMatches = [...answer.matchAll(/\(\d+\)\s*([A-Za-z]+)/g)];
  if (parenMatches.length > 0)
    return parenMatches.map((m) => (m[1] ?? '').toUpperCase());

  // Try "N.X" or "N、X" pattern
  const dotMatches = [...answer.matchAll(/\d+[.、]\s*([A-Za-z]+)/g)];
  if (dotMatches.length > 0)
    return dotMatches.map((m) => (m[1] ?? '').toUpperCase());

  // Fallback: split by whitespace/newline, filter single letters
  return answer
    .split(/[\s\n,，]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]+$/.test(s));
}

export async function fillReadingAnswer(
  questionDiv: Element,
  answer: string | string[],
): Promise<boolean> {
  const subAnswers = parseSubAnswers(answer);
  const blocks = Array.from(questionDiv.querySelectorAll('.reading_answer'));
  let filled = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const letter = subAnswers[i];
    if (!block || !letter) continue;

    if (filled) {
      await randomDelay(500, 1500);
    }

    const options = Array.from(
      block.querySelectorAll('.stem_answer .hoverDiv'),
    );
    for (const option of options) {
      const span = option.querySelector('span[class*="num_option"]');
      if (!span) continue;
      if (span.textContent?.trim().toUpperCase() === letter) {
        clickElement(option);
        await delay(CLICK_DELAY_MS);
        filled = true;
        break;
      }
    }
  }

  return filled;
}

export async function fillSharedOptionsAnswer(
  questionDiv: Element,
  answer: string | string[],
): Promise<boolean> {
  const subAnswers = parseSubAnswers(answer);
  const blocks = Array.from(questionDiv.querySelectorAll('.B-answer-ct'));
  let filled = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const letter = subAnswers[i];
    if (!block || !letter) continue;

    if (filled) {
      await randomDelay(500, 1500);
    }

    const span = block.querySelector(
      `.B-answerCon span[choice_name="${letter}"]`,
    );
    if (span) {
      clickElement(span);
      await delay(CLICK_DELAY_MS);
      filled = true;
    }
  }

  return filled;
}

function resolveWordFillQuestionId(questionDiv: Element): string {
  return (
    questionDiv.getAttribute('data') ??
    questionDiv.querySelector('.fillBlanksChoose')?.getAttribute('data') ??
    questionDiv.querySelector('.textTarget')?.getAttribute('data-qid') ??
    ''
  );
}

export async function fillWordFillAnswer(
  questionDiv: Element,
  answer: string | string[],
): Promise<boolean> {
  const subAnswers = parseSubAnswers(answer);
  const questionId = resolveWordFillQuestionId(questionDiv);
  const blanks = Array.from(
    questionDiv.querySelectorAll<HTMLSpanElement>('.textTarget'),
  );
  let filled = false;

  const fillBlanksJson: Array<{ name: number; content: string }> = [];

  for (let i = 0; i < blanks.length; i++) {
    const blank = blanks[i];
    const letter = subAnswers[i] ?? '';
    if (!blank) continue;

    if (filled) {
      await randomDelay(500, 1500);
    }

    const optionSpan = questionDiv.querySelector<HTMLSpanElement>(
      `.blanksBox span[data-choose-name="${letter}"]`,
    );
    const wordText = optionSpan?.textContent ?? letter;

    blank.innerHTML = wordText;
    blank.classList.add('hasFill');
    blank.dataset.chooseName = letter;
    blank.draggable = true;
    filled = true;

    fillBlanksJson.push({ name: i + 1, content: letter });
  }

  if (filled && questionId) {
    const hiddenInput = document.querySelector<HTMLInputElement>(
      `#answer${questionId}, input[name="answer${questionId}"]`,
    );
    if (hiddenInput) {
      hiddenInput.value = JSON.stringify(fillBlanksJson);
    }

    chrome.runtime.sendMessage({
      type: 'EXEC_PAGE_FUNC',
      funcName: 'saveFillinBlanks',
      args: [questionId],
    }).catch(() => {});
  }

  return filled;
}

export async function fillClozeAnswer(
  questionDiv: Element,
  answer: string | string[],
): Promise<boolean> {
  const subAnswers = parseSubAnswers(answer);
  const containers = Array.from(
    questionDiv.querySelectorAll('.stem_answer'),
  ).filter((c) => c.querySelector('.answerBg'));
  let filled = false;

  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    const letter = subAnswers[i];
    if (!container || !letter) continue;

    if (filled) {
      await randomDelay(500, 1500);
    }

    const options = Array.from(container.querySelectorAll('.answerBg'));
    for (const option of options) {
      const span = option.querySelector('.num_option');
      if (!span) continue;
      if (span.textContent?.trim().toUpperCase() === letter) {
        clickElement(option);
        await delay(CLICK_DELAY_MS);
        filled = true;
        break;
      }
    }
  }

  return filled;
}
