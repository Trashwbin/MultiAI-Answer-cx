import { QuestionType } from '../../types';
import { fillChoiceAnswer } from './fill-choice';
import { fillBlankAnswers } from './fill-blank';
import { fillJudgeAnswer } from './fill-judge';
import { fillQAAnswer } from './fill-qa';
import {
  fillReadingAnswer,
  fillClozeAnswer,
  fillSharedOptionsAnswer,
  fillWordFillAnswer,
} from './fill-composite';

export function clearQuestionState(questionDiv: Element, questionType: QuestionType): void {
  switch (questionType) {
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.JUDGE:
      Array.from(questionDiv.querySelectorAll('.check_answer')).forEach((el) =>
        el.classList.remove('check_answer'),
      );
      break;

    case QuestionType.MULTIPLE_CHOICE:
      Array.from(questionDiv.querySelectorAll('.check_answer_dx')).forEach((el) =>
        el.classList.remove('check_answer_dx'),
      );
      break;

    case QuestionType.READING_COMPREHENSION:
    case QuestionType.CLOZE:
    case QuestionType.SHARED_OPTIONS:
      Array.from(questionDiv.querySelectorAll('.check_answer')).forEach((el) =>
        el.classList.remove('check_answer'),
      );
      Array.from(questionDiv.querySelectorAll('.check_answer_dx')).forEach((el) =>
        el.classList.remove('check_answer_dx'),
      );
      break;

    case QuestionType.WORD_FILL:
      Array.from(questionDiv.querySelectorAll<HTMLSpanElement>('.textTarget')).forEach((blank) => {
        blank.innerHTML = '';
        blank.classList.remove('hasFill');
        delete blank.dataset.chooseName;
        blank.draggable = false;
      });
      break;

    case QuestionType.FILL_BLANK:
    case QuestionType.QA:
    case QuestionType.WORD_DEFINITION:
    case QuestionType.OTHER:
      break;
  }
}

export async function fillByType(
  questionDiv: Element,
  answer: string | string[],
  questionType: QuestionType,
): Promise<boolean> {
  switch (questionType) {
    case QuestionType.SINGLE_CHOICE:
    case QuestionType.MULTIPLE_CHOICE:
      return fillChoiceAnswer(questionDiv, answer);

    case QuestionType.FILL_BLANK:
      return fillBlankAnswers(
        questionDiv,
        Array.isArray(answer) ? answer : [answer],
      );

    case QuestionType.JUDGE:
      return fillJudgeAnswer(
        questionDiv,
        Array.isArray(answer) ? answer[0] ?? '' : answer,
      );

    case QuestionType.QA:
    case QuestionType.WORD_DEFINITION:
    case QuestionType.OTHER:
      return fillQAAnswer(
        questionDiv,
        Array.isArray(answer) ? answer.join('\n') : answer,
      );

    case QuestionType.READING_COMPREHENSION:
      return fillReadingAnswer(questionDiv, answer);

    case QuestionType.CLOZE:
      if (questionDiv.querySelector('.reading_answer')) {
        return fillReadingAnswer(questionDiv, answer);
      }
      return fillClozeAnswer(questionDiv, answer);

    case QuestionType.SHARED_OPTIONS:
      return fillSharedOptionsAnswer(questionDiv, answer);

    case QuestionType.WORD_FILL:
      return fillWordFillAnswer(questionDiv, answer);
  }
}
