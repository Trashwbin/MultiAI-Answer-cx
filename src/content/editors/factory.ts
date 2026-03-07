import { QuestionType } from '../../types';
import type { Question, FinalAnswer } from '../../types';
import { createChoiceEditor } from './choice-editor';
import { createBlankEditor } from './blank-editor';
import { createJudgeEditor } from './judge-editor';
import { createQAEditor } from './qa-editor';

export interface QuestionEditor {
  render(question?: Question, answer?: FinalAnswer | null): HTMLElement;
  getValue(): string | string[];
}

type EditorFactory = (question: Question, answer: FinalAnswer | null) => QuestionEditor;

const editorMap: Record<QuestionType, EditorFactory> = {
  [QuestionType.SINGLE_CHOICE]: createChoiceEditor,
  [QuestionType.MULTIPLE_CHOICE]: createChoiceEditor,
  [QuestionType.FILL_BLANK]: createBlankEditor,
  [QuestionType.JUDGE]: createJudgeEditor,
  [QuestionType.QA]: createQAEditor,
  [QuestionType.WORD_DEFINITION]: createQAEditor,
  [QuestionType.OTHER]: createQAEditor,
  [QuestionType.READING_COMPREHENSION]: createQAEditor,
  [QuestionType.CLOZE]: createQAEditor,
  [QuestionType.SHARED_OPTIONS]: createQAEditor,
  [QuestionType.WORD_FILL]: createQAEditor,
};

export function createEditor(question: Question, answer: FinalAnswer | null): QuestionEditor {
  const factory = editorMap[question.type];
  return factory(question, answer);
}
