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
  if (parenMatches.length > 0) return parenMatches.map((m) => (m[1] ?? '').toUpperCase());

  // Try "N.X" or "N、X" pattern
  const dotMatches = [...answer.matchAll(/\d+[.、]\s*([A-Za-z]+)/g)];
  if (dotMatches.length > 0) return dotMatches.map((m) => (m[1] ?? '').toUpperCase());

  // Fallback: split by whitespace/newline, filter single letters
  return answer
    .split(/[\s\n,，]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]+$/.test(s));
}

export function fillReadingAnswer(
  questionDiv: Element,
  answer: string | string[],
): boolean {
  const subAnswers = parseSubAnswers(answer);
  const blocks = Array.from(questionDiv.querySelectorAll('.reading_answer'));
  let filled = false;

  blocks.forEach((block, i) => {
    const letter = subAnswers[i];
    if (!letter) return;

    const options = Array.from(block.querySelectorAll('.stem_answer .hoverDiv'));
    for (const option of options) {
      const span = option.querySelector('span[class*="num_option"]');
      if (!span) continue;
      if (span.textContent?.trim().toUpperCase() === letter) {
        clickElement(option);
        filled = true;
        break;
      }
    }
  });

  return filled;
}

export function fillSharedOptionsAnswer(
  questionDiv: Element,
  answer: string | string[],
): boolean {
  const subAnswers = parseSubAnswers(answer);
  const blocks = Array.from(questionDiv.querySelectorAll('.B-answer-ct'));
  let filled = false;

  blocks.forEach((block, i) => {
    const letter = subAnswers[i];
    if (!letter) return;

    const span = block.querySelector(
      `.B-answerCon span[choice_name="${letter}"]`,
    );
    if (span) {
      clickElement(span);
      filled = true;
    }
  });

  return filled;
}

export function fillWordFillAnswer(
  questionDiv: Element,
  answer: string | string[],
): boolean {
  const subAnswers = parseSubAnswers(answer);
  const blanks = Array.from(questionDiv.querySelectorAll('.textTarget'));
  let filled = false;

  blanks.forEach((blank, i) => {
    const letter = subAnswers[i];
    if (!letter) return;
    blank.setAttribute('data-choose-name', letter);
    filled = true;
  });

  const hiddenInput = questionDiv.querySelector(
    'input[name^="answer"]',
  ) as HTMLInputElement | null;
  if (hiddenInput && filled) {
    const values = blanks.map(
      (b) => b.getAttribute('data-choose-name') ?? '',
    );
    hiddenInput.value = values.join(',');
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return filled;
}

export function fillClozeAnswer(
  questionDiv: Element,
  answer: string | string[],
): boolean {
  const subAnswers = parseSubAnswers(answer);
  const containers = Array.from(
    questionDiv.querySelectorAll('.stem_answer'),
  ).filter((c) => c.querySelector('.answerBg'));
  let filled = false;

  containers.forEach((container, i) => {
    const letter = subAnswers[i];
    if (!letter) return;

    const options = Array.from(container.querySelectorAll('.answerBg'));
    for (const option of options) {
      const span = option.querySelector('.num_option');
      if (!span) continue;
      if (span.textContent?.trim().toUpperCase() === letter) {
        clickElement(option);
        filled = true;
        break;
      }
    }
  });

  return filled;
}
