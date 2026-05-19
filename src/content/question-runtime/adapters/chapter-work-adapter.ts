import { QuestionType } from '../../../types';
import type { Question, QuestionOption } from '../../../types';
import { clearQuestionState, fillByType } from '../../auto-fill/fill-by-type';
import type { QuestionPageAdapter, QuestionRoot } from '../types';

const CHAPTER_TYPE_MAP: Record<string, QuestionType> = {
  '0': QuestionType.SINGLE_CHOICE,
  '1': QuestionType.MULTIPLE_CHOICE,
  '3': QuestionType.JUDGE,
  '4': QuestionType.QA,
};

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function formatAsHtml(answer: string): string {
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');
}

function findChapterQuestion(root: QuestionRoot, questionId: string): Element | null {
  return Array.from(root.doc.querySelectorAll('.singleQuesId[data]'))
    .find((el) => el.getAttribute('data') === questionId) ?? null;
}

function extractTitleContent(div: Element): { content: string; displayNumber: string } {
  const title = div.querySelector('.Zy_TItle');
  if (!title) return { content: '', displayNumber: '' };

  const number = normalizeInlineText(title.querySelector('i')?.textContent ?? '');
  const clone = title.cloneNode(true) as Element;
  clone.querySelector('i')?.remove();
  clone.querySelector('.newZy_TItle')?.remove();

  return {
    content: normalizeInlineText(clone.textContent ?? ''),
    displayNumber: number,
  };
}

function extractOptionText(optionNode: Element): string {
  return normalizeInlineText(optionNode.closest('li')?.querySelector('.after')?.textContent ?? '');
}

function extractOptions(div: Element, questionType: QuestionType): QuestionOption[] {
  const optionSelector = questionType === QuestionType.MULTIPLE_CHOICE
    ? '.num_option_dx'
    : '.num_option';

  return Array.from(div.querySelectorAll(optionSelector))
    .map((optionNode) => {
      const label = normalizeInlineText(optionNode.textContent ?? optionNode.getAttribute('data') ?? '');
      const value = optionNode.getAttribute('data') ?? '';
      const text = questionType === QuestionType.JUDGE
        ? value === 'true'
          ? '正确'
          : value === 'false'
            ? '错误'
            : extractOptionText(optionNode)
        : extractOptionText(optionNode);

      return { label, text };
    })
    .filter((option) => option.label && option.text);
}

function extractChapterQuestions(root: QuestionRoot): Question[] {
  return Array.from(root.doc.querySelectorAll('.singleQuesId[data]'))
    .map((div, index): Question | null => {
      const id = div.getAttribute('data') ?? '';
      const rawType = div.querySelector('.TiMu[data]')?.getAttribute('data') ?? '';
      const questionType = CHAPTER_TYPE_MAP[rawType] ?? QuestionType.OTHER;
      const { content, displayNumber } = extractTitleContent(div);
      if (!id || !content) return null;

      return {
        id,
        number: (index + 1).toString(),
        displayNumber: displayNumber || (index + 1).toString(),
        globalOrder: index,
        type: questionType,
        content,
        options: extractOptions(div, questionType),
        blankCount: 0,
      };
    })
    .filter((question): question is Question => question !== null);
}

function dispatchValueEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

function setChapterTextarea(questionDiv: Element, questionId: string, html: string): boolean {
  const textarea =
    questionDiv.querySelector<HTMLTextAreaElement>(`textarea#answer${questionId}`) ??
    questionDiv.querySelector<HTMLTextAreaElement>(`textarea[name="answer${questionId}"]`);
  if (!textarea) return false;

  textarea.value = html;
  dispatchValueEvents(textarea);
  return true;
}

function setChapterEditor(root: QuestionRoot, questionDiv: Element, questionId: string, answer: string): boolean {
  const html = formatAsHtml(answer);
  let filled = false;

  const maybeUE = (root.win as Window & {
    UE?: { getEditor?: (id: string) => { setContent?: (content: string) => void; focus?: () => void } };
  }).UE;
  const editor = maybeUE?.getEditor?.(`answer${questionId}`);
  if (editor?.setContent) {
    editor.setContent(html);
    editor.focus?.();
    filled = true;
  }

  const editorFrame = questionDiv.querySelector<HTMLIFrameElement>('.edui-editor-iframeholder iframe');
  const editorDoc = editorFrame?.contentDocument ?? editorFrame?.contentWindow?.document;
  if (editorDoc?.body) {
    editorDoc.body.innerHTML = html;
    editorDoc.body.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    filled = true;
  }

  filled = setChapterTextarea(questionDiv, questionId, html) || filled;
  return filled;
}

async function fillChapterQuestion(
  root: QuestionRoot,
  question: Question,
  answer: string | string[],
): Promise<boolean> {
  const questionDiv = findChapterQuestion(root, question.id);
  if (!questionDiv) return false;

  if (question.type === QuestionType.QA || question.type === QuestionType.WORD_DEFINITION || question.type === QuestionType.OTHER) {
    return setChapterEditor(
      root,
      questionDiv,
      question.id,
      Array.isArray(answer) ? answer.join('\n') : answer,
    );
  }

  clearQuestionState(questionDiv, question.type);
  return fillByType(questionDiv, answer, question.type);
}

async function submitChapterWork(root: QuestionRoot): Promise<void> {
  const submitBtn = root.doc.querySelector<HTMLElement>('.btnSubmit');
  if (submitBtn) {
    submitBtn.click();
    return;
  }

  const submitFn = (root.win as Window & { btnBlueSubmit?: () => void }).btnBlueSubmit;
  submitFn?.();
}

export const chapterWorkAdapter: QuestionPageAdapter = {
  id: 'chapter-work',

  detect(root) {
    return root.doc.querySelector('.singleQuesId[data]') !== null;
  },

  extract: extractChapterQuestions,

  findQuestion: findChapterQuestion,

  fill: fillChapterQuestion,

  submit: submitChapterWork,
};
