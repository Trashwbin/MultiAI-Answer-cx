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

const FILL_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findQuestionElement(questionId: string): Element | null {
  return (
    document.querySelector(`.questionLi[data="${questionId}"]`) ??
    document.querySelector(`#sigleQuestionDiv_${questionId}`)
  );
}

function fillByType(
  questionDiv: Element,
  answer: string | string[],
  questionType: QuestionType,
): boolean {
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
      return fillClozeAnswer(questionDiv, answer);

    case QuestionType.SHARED_OPTIONS:
      return fillSharedOptionsAnswer(questionDiv, answer);

    case QuestionType.WORD_FILL:
      return fillWordFillAnswer(questionDiv, answer);
  }
}

export async function autoFillAnswers(
  finalAnswers: FinalAnswer[],
  questions: Question[],
): Promise<void> {
  const questionById = new Map(questions.map((q) => [q.number, q]));

  for (const finalAnswer of finalAnswers) {
    const question = questionById.get(finalAnswer.questionNumber);
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

    fillByType(questionDiv, finalAnswer.answer, question.type);

    await delay(FILL_DELAY_MS);
  }
}
