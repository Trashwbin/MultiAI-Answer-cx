import { QuestionType } from '../../types';
import type { Question } from '../../types';
import { QUESTION_TYPE_MAP } from '../../config/question-types';
import { parseOptions } from './option-parser';
import { detectBlankCount } from './blank-detector';

function extractRawType(div: Element, typeSpan: Element | null): string {
  const typeNameInput = div.querySelector<HTMLInputElement>('input[name^="typeName"]');
  if (typeNameInput?.value) {
    return typeNameInput.value;
  }

  const typeFromAttr = div.getAttribute('typename');
  if (typeFromAttr) {
    return typeFromAttr;
  }

  if (typeSpan?.textContent) {
    const typeText = typeSpan.textContent.trim();
    // Match content inside parens before comma/space: "(单选题, 2分)" → "单选题"
    const typeMatch = typeText.match(/\((.*?)(?:,|，|\s)/);
    if (typeMatch?.[1]) {
      return typeMatch[1];
    }
  }

  return '其他';
}

function extractContent(titleElem: Element, questionType: QuestionType): string {
  const contentDiv = titleElem.querySelector('div');
  let content: string;

  if (contentDiv) {
    content = contentDiv.textContent?.trim() ?? '';
  } else {
    const fullText = titleElem.textContent ?? '';
    const typeIndex = fullText.indexOf('(');
    if (typeIndex === -1) {
      content = fullText.trim();
    } else {
      const withoutNumber = fullText.split('.').slice(1).join('.').trim();
      const closingParen = withoutNumber.indexOf(')');
      content = closingParen === -1
        ? withoutNumber.trim()
        : withoutNumber.substring(closingParen + 1).trim();
    }
  }

  if (questionType === QuestionType.FILL_BLANK) {
    content = content.replace(/_{3,}/g, '____');
    content = content.replace(/\s{3,}/g, '____');
    content = content.replace(/_{2,}/g, '____');
  }

  return content;
}

export function extractQuestionsFromXXT(): Question[] {
  const questions: Question[] = [];
  let questionNumber = 1;

  const questionDivs = document.querySelectorAll('.questionLi');

  questionDivs.forEach((div) => {
    const titleElem = div.querySelector('.mark_name');
    if (!titleElem) {
      return;
    }

    const typeSpan = titleElem.querySelector('.colorShallow');
    const rawType = extractRawType(div, typeSpan);
    const questionType = QUESTION_TYPE_MAP[rawType] ?? QuestionType.OTHER;

    const content = extractContent(titleElem, questionType);
    const options = parseOptions(div);
    const blankCount = questionType === QuestionType.FILL_BLANK
      ? detectBlankCount(div)
      : 0;

    const question: Question = {
      id: div.getAttribute('data') ?? '',
      number: questionNumber.toString(),
      type: questionType,
      content,
      options,
      blankCount,
    };

    questions.push(question);
    questionNumber++;
  });

  return questions;
}
