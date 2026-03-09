import { QuestionType } from '../../types';
import type { FinalAnswer, Question } from '../../types';
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

const SCROLL_WAIT_MS = 500;
const SAVE_WAIT_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

function findQuestionElement(questionId: string): Element | null {
  return (
    document.querySelector(`.questionLi[data="${questionId}"]`) ??
    document.querySelector(`#sigleQuestionDiv_${questionId}`)
  );
}

function clearQuestionState(questionDiv: Element, questionType: QuestionType): void {
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

async function fillByType(
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

function sortByDomOrder(
  finalAnswers: FinalAnswer[],
  questionByNumber: Map<string, Question>,
): FinalAnswer[] {
  return [...finalAnswers].sort((a, b) => {
    const qA = questionByNumber.get(a.questionNumber);
    const qB = questionByNumber.get(b.questionNumber);
    const orderA = qA?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = qB?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.questionNumber.localeCompare(b.questionNumber, undefined, {
      numeric: true,
    });
  });
}

export async function autoFillAnswers(
  finalAnswers: FinalAnswer[],
  questions: Question[],
): Promise<void> {
  const questionByNumber = new Map(questions.map((q) => [q.number, q]));
  const sorted = sortByDomOrder(finalAnswers, questionByNumber);

  for (const finalAnswer of sorted) {
    const question = questionByNumber.get(finalAnswer.questionNumber);
    if (!question) continue;

    if (
      !finalAnswer.answer ||
      (Array.isArray(finalAnswer.answer) &&
        finalAnswer.answer.every((a) => !a))
    ) {
      continue;
    }

    const questionDiv = findQuestionElement(question.id);
    if (!questionDiv) continue;

    questionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(SCROLL_WAIT_MS);

    await randomDelay(1000, 3000);

    clearQuestionState(questionDiv, question.type);
    await fillByType(questionDiv, finalAnswer.answer, question.type);
  }

  const saveWorkBtn =
    document.querySelector<HTMLElement>('a[onclick="saveWork();"]');
  if (saveWorkBtn) {
    await delay(SAVE_WAIT_MS);
    saveWorkBtn.addEventListener('click', (e) => e.preventDefault(), { once: true });
    saveWorkBtn.click();
  }
}
