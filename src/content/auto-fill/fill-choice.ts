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

function getSingleChoiceOptions(questionDiv: Element): Element[] {
  return Array.from(
    questionDiv.querySelectorAll('.answerBg, li[onclick*="addChoice"]'),
  );
}

function getMultipleChoiceOptions(questionDiv: Element): Element[] {
  return Array.from(
    questionDiv.querySelectorAll('.answerBg, li[onclick*="addMultipleChoice"]'),
  );
}

async function fillSingleChoice(
  questionDiv: Element,
  letter: string,
): Promise<boolean> {
  const options = getSingleChoiceOptions(questionDiv);
  for (const option of options) {
    const span = option.querySelector('.num_option');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer');

    if (label === letter.toUpperCase() && !isChecked) {
      clickElement(option);
      await delay(CLICK_DELAY_MS);
      return true;
    }
  }
  return false;
}

async function fillMultipleChoice(
  questionDiv: Element,
  letters: string[],
): Promise<boolean> {
  const options = getMultipleChoiceOptions(questionDiv);
  const selected = letters.map((l) => l.toUpperCase());

  for (const option of options) {
    const span = option.querySelector('.num_option_dx');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer_dx');

    if (isChecked && !selected.includes(label)) {
      clickElement(option);
      await randomDelay(500, 1500);
    }
  }

  let filled = false;
  for (const opt of options) {
    const span = opt.querySelector('.num_option_dx');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer_dx');

    if (selected.includes(label) && !isChecked) {
      clickElement(opt);
      filled = true;
      await randomDelay(500, 1500);
    }
  }

  return filled;
}

export async function fillChoiceAnswer(
  questionDiv: Element,
  answer: string | string[],
): Promise<boolean> {
  if (Array.isArray(answer)) {
    return fillMultipleChoice(questionDiv, answer);
  }

  const cleaned = answer.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned.length > 1) {
    return fillMultipleChoice(questionDiv, cleaned.split(''));
  }

  return fillSingleChoice(questionDiv, cleaned);
}
