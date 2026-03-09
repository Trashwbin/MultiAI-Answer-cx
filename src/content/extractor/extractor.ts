import { QuestionType } from '../../types';
import type { Question, QuestionOption } from '../../types';
import { QUESTION_TYPE_MAP } from '../../config/question-types';
import { parseOptionsForType } from './option-parser';
import { detectBlankCount } from './blank-detector';

interface CompositeResult {
  content: string;
  subQuestions: Array<{
    index: number;
    content: string;
    options: QuestionOption[];
    type?: QuestionType;
  }>;
}

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

function parseOptionsFromRows(rows: Element[]): QuestionOption[] {
  return rows.map((row) => {
    const label = row.querySelector('span[data]')?.textContent?.trim() ?? '';
    const text = row.querySelector('.answer_p')?.textContent?.trim() ?? '';
    return { label, text };
  }).filter((option) => option.label && option.text);
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractReadingContent(div: Element): CompositeResult {
  const passage = div.querySelector('.mark_name div')?.textContent?.trim() ?? '';
  const childIds = Array.from(div.querySelectorAll<HTMLInputElement>('input[name="readCompreHension-childId"]'))
    .map((input) => input.value.trim());
  const readingBlocks = Array.from(div.querySelectorAll('.reading_answer'));

  const subQuestions = readingBlocks.map((block, index) => {
    const titleElem = block.querySelector('.reader_answer_tit');
    const titleClone = titleElem?.cloneNode(true) as Element | null;
    titleClone?.querySelector('.read_type')?.remove();
    const rawTitle = normalizeInlineText(titleClone?.textContent ?? titleElem?.textContent ?? '');
    const content = rawTitle.replace(/^\(\d+\)\s*/, '').trim();
    const optionRows = Array.from(block.querySelectorAll('.stem_answer .hoverDiv'));
    const options = parseOptionsFromRows(optionRows);
    const childId = childIds[index];

    return {
      index: index + 1,
      content: childId ? `[${childId}] ${content}` : content,
      options,
      type: QuestionType.SINGLE_CHOICE,
    };
  });

  const contentLines = [`[阅读理解]`, passage];
  subQuestions.forEach((subQuestion) => {
    const optionLine = subQuestion.options.map((option) => `${option.label}. ${option.text}`).join(' ');
    contentLines.push(`(${subQuestion.index}) ${subQuestion.content}`);
    if (optionLine) {
      contentLines.push(optionLine);
    }
  });

  return {
    content: contentLines.filter((line) => line).join('\n'),
    subQuestions,
  };
}

function extractClozeContent(div: Element): CompositeResult {
  const passage = div.querySelector('.mark_name div')?.textContent?.trim() ?? '';
  const answerContainers = Array.from(div.querySelectorAll('.stem_answer')).filter((container) =>
    container.querySelector('.answerBg') !== null,
  );

  const optionGroups = answerContainers.length > 0
    ? answerContainers.map((container) => Array.from(container.querySelectorAll('.answerBg')))
    : [Array.from(div.querySelectorAll('.stem_answer .answerBg'))];

  const subQuestions = optionGroups
    .map((rows, index) => ({
      index: index + 1,
      content: `第${index + 1}空`,
      options: parseOptionsFromRows(rows),
      type: QuestionType.SINGLE_CHOICE,
    }))
    .filter((subQuestion) => subQuestion.options.length > 0);

  const contentLines = [`[完形填空]`, passage];
  subQuestions.forEach((subQuestion) => {
    const optionLine = subQuestion.options.map((option) => `${option.label}. ${option.text}`).join(' ');
    contentLines.push(`(${subQuestion.index}) ${optionLine}`);
  });

  return {
    content: contentLines.filter((line) => line).join('\n'),
    subQuestions,
  };
}

function extractSharedOptionsContent(div: Element): CompositeResult {
  const sharedOptionRows = Array.from(div.querySelectorAll('.stem_answer.padBom20 .clearfix'));
  const sharedOptions = sharedOptionRows.map((row) => {
    const label = row.querySelector('span.fl')?.textContent?.trim().replace(/\.$/, '') ?? '';
    const text = row.querySelector('.p_wid805')?.textContent?.trim() ?? '';
    return { label, text };
  }).filter((option) => option.label && option.text);

  const subQuestions = Array.from(div.querySelectorAll('.B-answer-ct')).map((block, index) => {
    const title = normalizeInlineText(block.querySelector('.B-tit')?.textContent ?? '').replace(/^\(\d+\)\s*/, '').trim();
    return {
      index: index + 1,
      content: title,
      options: sharedOptions,
      type: QuestionType.SHARED_OPTIONS,
    };
  });

  const sharedLine = sharedOptions.map((option) => `${option.label}. ${option.text}`).join(' ');
  const contentLines = [`[共用选项题]`, `共用选项: ${sharedLine}`];
  subQuestions.forEach((subQuestion) => {
    contentLines.push(`(${subQuestion.index}) ${subQuestion.content}`);
  });

  return {
    content: contentLines.filter((line) => line).join('\n'),
    subQuestions,
  };
}

function extractWordFillContent(div: Element): CompositeResult {
  const textContentDiv = div.querySelector('.textContent');
  let passage = '';

  if (textContentDiv) {
    const clone = textContentDiv.cloneNode(true) as Element;
    const targets = Array.from(clone.querySelectorAll('.textTarget'));
    targets.forEach((target, index) => {
      const marker = document.createTextNode(`____${index + 1}____`);
      target.parentNode?.replaceChild(marker, target);
    });
    passage = normalizeInlineText(clone.textContent ?? '');
  }

  const wordBank = parseOptionsForType(div, QuestionType.WORD_FILL);

  const blankCount = div.querySelectorAll('.textTarget').length;
  const subQuestions = Array.from({ length: blankCount }, (_, index) => ({
    index: index + 1,
    content: `第${index + 1}空`,
    options: wordBank,
    type: QuestionType.WORD_FILL,
  }));

  const wordLine = wordBank.map((word) => `${word.label}. ${word.text}`).join(' ');
  const contentLines = [`[选词填空]`, passage, `词库: ${wordLine}`];

  return {
    content: contentLines.filter((line) => line).join('\n'),
    subQuestions,
  };
}

export function extractQuestionsFromXXT(): Question[] {
  const questions: Question[] = [];

  const questionDivs = document.querySelectorAll('.questionLi');

  questionDivs.forEach((div) => {
    const titleElem = div.querySelector('.mark_name');
    if (!titleElem) {
      return;
    }

    const typeSpan = titleElem.querySelector('.colorShallow');
    const rawType = extractRawType(div, typeSpan);
    const questionType = QUESTION_TYPE_MAP[rawType] ?? QuestionType.OTHER;
    const startVal = parseInt(div.querySelector<HTMLInputElement>('input[name="start"]')?.value ?? '0', 10);

    let content = extractContent(titleElem, questionType);
    let options: QuestionOption[] = [];
    let subQuestions: Question['subQuestions'];

    switch (questionType) {
      case QuestionType.READING_COMPREHENSION: {
        const compositeResult = extractReadingContent(div);
        content = compositeResult.content;
        subQuestions = compositeResult.subQuestions;
        break;
      }
      case QuestionType.CLOZE: {
        const compositeResult = div.querySelector('.reading_answer')
          ? extractReadingContent(div)
          : extractClozeContent(div);
        content = compositeResult.content;
        subQuestions = compositeResult.subQuestions;
        break;
      }
      case QuestionType.SHARED_OPTIONS: {
        const compositeResult = extractSharedOptionsContent(div);
        content = compositeResult.content;
        subQuestions = compositeResult.subQuestions;
        break;
      }
      case QuestionType.WORD_FILL: {
        const compositeResult = extractWordFillContent(div);
        content = compositeResult.content;
        subQuestions = compositeResult.subQuestions;
        break;
      }
      default: {
        options = parseOptionsForType(div, questionType);
        break;
      }
    }

    const blankCount = questionType === QuestionType.FILL_BLANK
      ? detectBlankCount(div, questionType)
      : questionType === QuestionType.WORD_FILL
        ? detectBlankCount(div, questionType)
      : 0;

    const question: Question = {
      id: div.getAttribute('data') ?? '',
      number: (startVal + 1).toString(),
      globalOrder: startVal,
      type: questionType,
      content,
      options,
      blankCount,
      subQuestions,
    };

    questions.push(question);
  });

  return questions;
}
