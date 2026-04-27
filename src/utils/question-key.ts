import type { Question } from '../types';

export function matchesQuestionKey(
  question: Pick<Question, 'id' | 'number'>,
  key: string,
): boolean {
  return question.id === key || question.number === key;
}

export function buildQuestionLookup(questions: Question[]): Map<string, Question> {
  const lookup = new Map<string, Question>();

  for (const question of questions) {
    lookup.set(question.id, question);
    lookup.set(question.number, question);
  }

  return lookup;
}

export function findQuestionByKey(
  questions: Question[],
  key: string,
): Question | undefined {
  return questions.find((question) => matchesQuestionKey(question, key));
}
