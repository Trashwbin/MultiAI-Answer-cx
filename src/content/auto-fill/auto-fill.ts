import type { FinalAnswer, Question } from '../../types';
import { buildQuestionLookup } from '../../utils/question-key';
import { resolveQuestionRuntime } from '../question-runtime/adapters';
import type { QuestionRuntime } from '../question-runtime/types';

const SCROLL_WAIT_MS = 500;
const SAVE_WAIT_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

function sortByDomOrder(
  finalAnswers: FinalAnswer[],
  questionLookup: Map<string, Question>,
): FinalAnswer[] {
  return [...finalAnswers].sort((a, b) => {
    const qA = questionLookup.get(a.id);
    const qB = questionLookup.get(b.id);
    const orderA = qA?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = qB?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export async function autoFillAnswers(
  finalAnswers: FinalAnswer[],
  questions: Question[],
  runtime: QuestionRuntime | null = resolveQuestionRuntime(),
): Promise<void> {
  if (!runtime) return;

  const questionLookup = buildQuestionLookup(questions);
  const sorted = sortByDomOrder(finalAnswers, questionLookup);

  for (const finalAnswer of sorted) {
    const question = questionLookup.get(finalAnswer.id);
    if (!question) continue;

    if (
      !finalAnswer.answer ||
      (Array.isArray(finalAnswer.answer) &&
        finalAnswer.answer.every((a) => !a))
    ) {
      continue;
    }

    const questionDiv = runtime.adapter.findQuestion(runtime.root, question.id);
    if (!questionDiv) continue;

    questionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await delay(SCROLL_WAIT_MS);

    await randomDelay(1000, 3000);

    await runtime.adapter.fill(runtime.root, question, finalAnswer.answer);
  }

  if (runtime.adapter.submit) {
    await delay(SAVE_WAIT_MS);
    await runtime.adapter.submit(runtime.root);
  }
}
