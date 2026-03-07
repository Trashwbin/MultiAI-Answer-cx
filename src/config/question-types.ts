import { QuestionType } from '../types/question';

export { QuestionType };

export const QUESTION_TYPE_MAP: Record<string, QuestionType> = {
  '单选题': QuestionType.SINGLE_CHOICE,
  '单选': QuestionType.SINGLE_CHOICE,
  '多选题': QuestionType.MULTIPLE_CHOICE,
  '多选': QuestionType.MULTIPLE_CHOICE,
  '填空题': QuestionType.FILL_BLANK,
  '填空': QuestionType.FILL_BLANK,
  '判断题': QuestionType.JUDGE,
  '判断': QuestionType.JUDGE,
  '是非题': QuestionType.JUDGE,
  '简答题': QuestionType.QA,
  '简答': QuestionType.QA,
  '问答题': QuestionType.QA,
  '论述题': QuestionType.QA,
  '计算题': QuestionType.QA,
  '名词解释': QuestionType.WORD_DEFINITION,
  '其他': QuestionType.OTHER,
  '阅读理解': QuestionType.READING_COMPREHENSION,
  '完形填空': QuestionType.CLOZE,
  '完型填空': QuestionType.CLOZE,
  '共用选项题': QuestionType.SHARED_OPTIONS,
  '共用选项': QuestionType.SHARED_OPTIONS,
  '选词填空': QuestionType.WORD_FILL,
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.SINGLE_CHOICE]: '单选题',
  [QuestionType.MULTIPLE_CHOICE]: '多选题',
  [QuestionType.FILL_BLANK]: '填空题',
  [QuestionType.JUDGE]: '判断题',
  [QuestionType.QA]: '简答题',
  [QuestionType.WORD_DEFINITION]: '名词解释',
  [QuestionType.OTHER]: '其他',
  [QuestionType.READING_COMPREHENSION]: '阅读理解',
  [QuestionType.CLOZE]: '完形填空',
  [QuestionType.SHARED_OPTIONS]: '共用选项题',
  [QuestionType.WORD_FILL]: '选词填空',
};

// Detection patterns ordered from most specific to least specific
const DETECTION_RULES: ReadonlyArray<{ pattern: RegExp; type: QuestionType }> = [
  { pattern: /阅读理解/, type: QuestionType.READING_COMPREHENSION },
  { pattern: /完[形型]填空/, type: QuestionType.CLOZE },
  { pattern: /共用选项/, type: QuestionType.SHARED_OPTIONS },
  { pattern: /选词填空/, type: QuestionType.WORD_FILL },
  { pattern: /多选/, type: QuestionType.MULTIPLE_CHOICE },
  { pattern: /单选/, type: QuestionType.SINGLE_CHOICE },
  { pattern: /判断|是非/, type: QuestionType.JUDGE },
  { pattern: /填空/, type: QuestionType.FILL_BLANK },
  { pattern: /名词解释/, type: QuestionType.WORD_DEFINITION },
  { pattern: /简答|问答|论述|计算/, type: QuestionType.QA },
];

export function detectQuestionType(text: string): QuestionType {
  const directMatch = QUESTION_TYPE_MAP[text.trim()];
  if (directMatch !== undefined) {
    return directMatch;
  }

  for (const rule of DETECTION_RULES) {
    if (rule.pattern.test(text)) {
      return rule.type;
    }
  }

  return QuestionType.OTHER;
}
