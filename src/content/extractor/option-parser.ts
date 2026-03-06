import type { QuestionOption } from '../../types';

export function parseOptions(questionDiv: Element): QuestionOption[] {
  const options: QuestionOption[] = [];
  const optionDivs = questionDiv.querySelectorAll('.stem_answer .answerBg');

  optionDivs.forEach((optionDiv) => {
    const optionSpan = optionDiv.querySelector('span[data]');
    const label = optionSpan?.textContent?.trim() ?? '';
    const text = optionDiv.querySelector('.answer_p')?.textContent?.trim() ?? '';

    if (label && text) {
      options.push({ label, text });
    }
  });

  return options;
}
