import type { Question } from '../../../types';
import { extractWorkQuestions } from '../../extractor/extractor';
import { clearQuestionState, fillByType } from '../../auto-fill/fill-by-type';
import type { QuestionPageAdapter, QuestionRoot } from '../types';

function findWorkQuestion(root: QuestionRoot, questionId: string): Element | null {
  return Array.from(root.doc.querySelectorAll('.questionLi'))
    .find((el) => el.getAttribute('data') === questionId) ?? null;
}

async function saveWork(root: QuestionRoot): Promise<void> {
  const saveWorkBtn = root.doc.querySelector<HTMLElement>('a[onclick="saveWork();"]');
  if (!saveWorkBtn) return;

  saveWorkBtn.addEventListener('click', (e) => e.preventDefault(), { once: true });
  saveWorkBtn.click();
}

export const workAdapter: QuestionPageAdapter = {
  id: 'work',

  detect(root) {
    return root.doc.querySelector('.questionLi') !== null;
  },

  extract(root) {
    return extractWorkQuestions(root.doc);
  },

  findQuestion: findWorkQuestion,

  async fill(root, question: Question, answer: string | string[]): Promise<boolean> {
    const questionDiv = findWorkQuestion(root, question.id);
    if (!questionDiv) return false;

    clearQuestionState(questionDiv, question.type);
    return fillByType(questionDiv, answer, question.type);
  },

  submit: saveWork,
};
