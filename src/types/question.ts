// Values are the exact Chinese strings extracted from 学习通 DOM by questionExtractor
export enum QuestionType {
  SINGLE_CHOICE = '单选题',
  MULTIPLE_CHOICE = '多选题',
  FILL_BLANK = '填空题',
  JUDGE = '判断题',
  QA = '简答题',
  WORD_DEFINITION = '名词解释',
  OTHER = '其他',
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  number: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  blankCount: number;
}
