function clickElement(el: Element): void {
  try {
    (el as HTMLElement).click();
  } catch {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  }
}

function fillSingleChoice(questionDiv: Element, letter: string): boolean {
  const options = Array.from(questionDiv.querySelectorAll('.answerBg'));
  for (const option of options) {
    const span = option.querySelector('.num_option');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer');

    if (label === letter.toUpperCase() && !isChecked) {
      clickElement(option);
      return true;
    }
  }
  return false;
}

function fillMultipleChoice(
  questionDiv: Element,
  letters: string[],
): boolean {
  const options = Array.from(questionDiv.querySelectorAll('.answerBg'));
  const selected = letters.map((l) => l.toUpperCase());
  let filled = false;

  for (const option of options) {
    const span = option.querySelector('.num_option_dx');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer_dx');

    if (isChecked && !selected.includes(label)) {
      clickElement(option);
    }
  }

  for (const opt of options) {
    const span = opt.querySelector('.num_option_dx');
    if (!span) continue;

    const label = span.textContent?.trim() ?? '';
    const isChecked = span.classList.contains('check_answer_dx');

    if (selected.includes(label) && !isChecked) {
      clickElement(opt);
      filled = true;
    }
  }

  return filled;
}

export function fillChoiceAnswer(
  questionDiv: Element,
  answer: string | string[],
): boolean {
  if (Array.isArray(answer)) {
    return fillMultipleChoice(questionDiv, answer);
  }

  const cleaned = answer.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (cleaned.length > 1) {
    return fillMultipleChoice(questionDiv, cleaned.split(''));
  }

  return fillSingleChoice(questionDiv, cleaned);
}
