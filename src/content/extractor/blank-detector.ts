import { QuestionType } from '../../types';

export function detectBlankCount(questionDiv: Element, type?: QuestionType): number {
  if (type === QuestionType.WORD_FILL) {
    return questionDiv.querySelectorAll('.textTarget').length;
  }
  return questionDiv.querySelectorAll('.stem_answer .tiankong').length;
}
