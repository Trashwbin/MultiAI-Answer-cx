import type { Question } from '../../../types';
import { extractQuestionsFromElements } from '../../extractor/extractor';
import { clearQuestionState, fillByType } from '../../auto-fill/fill-by-type';
import type { QuestionPageAdapter, QuestionRoot } from '../types';

function findExamQuestion(root: QuestionRoot, questionId: string): Element | null {
  return root.doc.getElementById(`sigleQuestionDiv_${questionId}`);
}

function getExamQuestionElements(root: QuestionRoot): Element[] {
  return Array.from(root.doc.querySelectorAll('[id^="sigleQuestionDiv_"]'));
}

export const examAdapter: QuestionPageAdapter = {
  id: 'exam',

  detect(root) {
    return root.doc.querySelector('[id^="sigleQuestionDiv_"]') !== null;
  },

  extract(root) {
    return extractQuestionsFromElements(getExamQuestionElements(root));
  },

  findQuestion: findExamQuestion,

  async fill(root, question: Question, answer: string | string[]): Promise<boolean> {
    const questionDiv = findExamQuestion(root, question.id);
    if (!questionDiv) return false;

    clearQuestionState(questionDiv, question.type);
    return fillByType(questionDiv, answer, question.type);
  },
};
