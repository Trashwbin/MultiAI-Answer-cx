import { resolveQuestionRoot } from '../root-resolver';
import type { QuestionRuntime, QuestionPageAdapter } from '../types';
import { chapterWorkAdapter } from './chapter-work-adapter';
import { examAdapter } from './exam-adapter';
import { workAdapter } from './work-adapter';

const ADAPTERS: QuestionPageAdapter[] = [
  chapterWorkAdapter,
  examAdapter,
  workAdapter,
];

export function resolveQuestionRuntime(): QuestionRuntime | null {
  const root = resolveQuestionRoot();
  if (!root) return null;

  const adapter = ADAPTERS.find((candidate) => candidate.detect(root));
  if (!adapter) return null;

  return { root, adapter };
}

export { ADAPTERS };
