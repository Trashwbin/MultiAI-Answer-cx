import type { Question } from '../../types';

export interface QuestionRoot {
  doc: Document;
  win: Window;
  frame?: HTMLIFrameElement;
  kind: 'direct' | 'iframe';
  depth: number;
}

export type QuestionPageAdapterId = 'work' | 'exam' | 'chapter-work';

export interface QuestionPageAdapter {
  id: QuestionPageAdapterId;
  detect(root: QuestionRoot): boolean;
  extract(root: QuestionRoot): Question[];
  findQuestion(root: QuestionRoot, questionId: string): Element | null;
  fill(
    root: QuestionRoot,
    question: Question,
    answer: string | string[],
  ): Promise<boolean>;
  submit?(root: QuestionRoot): Promise<void>;
}

export interface QuestionRuntime {
  root: QuestionRoot;
  adapter: QuestionPageAdapter;
}
