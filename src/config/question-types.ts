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
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.SINGLE_CHOICE]: '单选题',
  [QuestionType.MULTIPLE_CHOICE]: '多选题',
  [QuestionType.FILL_BLANK]: '填空题',
  [QuestionType.JUDGE]: '判断题',
  [QuestionType.QA]: '简答题',
  [QuestionType.WORD_DEFINITION]: '名词解释',
  [QuestionType.OTHER]: '其他',
};

// Detection patterns ordered from most specific to least specific
const DETECTION_RULES: ReadonlyArray<{ pattern: RegExp; type: QuestionType }> = [
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
