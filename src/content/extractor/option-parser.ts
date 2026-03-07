import type { QuestionOption } from '../../types';
import { QuestionType } from '../../types';

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

export function parseOptionsForType(questionDiv: Element, type: QuestionType): QuestionOption[] {
  switch (type) {
    case QuestionType.WORD_FILL: {
      // 选词填空: word bank spans with data-choose-name
      const spans = questionDiv.querySelectorAll('.blanksBox span[draggable]');
      return Array.from(spans).map((s) => ({
        label: s.getAttribute('data-choose-name') ?? '',
        text: s.textContent?.trim() ?? '',
      })).filter((o) => o.label && o.text);
    }
    case QuestionType.SHARED_OPTIONS: {
      // 共用选项题: shared options in .padBom20 clearfix rows
      const rows = questionDiv.querySelectorAll('.stem_answer.padBom20 .clearfix');
      return Array.from(rows).map((row) => ({
        label: row.querySelector('span.fl')?.textContent?.trim().replace(/\.$/, '') ?? '',
        text: row.querySelector('.p_wid805')?.textContent?.trim() ?? '',
      })).filter((o) => o.label && o.text);
    }
    default:
      // Basic choice types (单选/多选/阅读理解 sub-Qs all use .answerBg structure)
      return parseOptions(questionDiv);
  }
}
