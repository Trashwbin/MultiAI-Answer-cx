const CLICK_DELAY_MS = 1000;

const CORRECT_VALUES = new Set(['true', '1', '正确']);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeJudgeAnswer(answer: string): 'true' | 'false' {
  const trimmed = answer.trim();

  if (
    trimmed === 'A' ||
    trimmed.includes('对') ||
    trimmed.includes('√') ||
    CORRECT_VALUES.has(trimmed)
  ) {
    return 'true';
  }

  return 'false';
}

export async function fillJudgeAnswer(
  questionDiv: Element,
  answer: string,
): Promise<boolean> {
  const targetValue = normalizeJudgeAnswer(answer);
  const options = Array.from(questionDiv.querySelectorAll('.answerBg'));

  for (const option of options) {
    const optionSpan = option.querySelector('.num_option');
    if (!optionSpan) continue;

    const optionValue = optionSpan.getAttribute('data');
    const isChecked = optionSpan.classList.contains('check_answer');

    if (optionValue === targetValue && !isChecked) {
      try {
        (option as HTMLElement).click();
      } catch {
        option.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true }),
        );
      }
      await delay(CLICK_DELAY_MS);
      return true;
    }
  }

  return false;
}
