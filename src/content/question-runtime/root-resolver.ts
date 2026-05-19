import type { QuestionRoot } from './types';

const QUESTION_ROOT_SELECTOR = [
  '.questionLi',
  '[id^="sigleQuestionDiv_"]',
  '.singleQuesId[data]',
].join(',');

function hasQuestionDom(doc: Document): boolean {
  return doc.querySelector(QUESTION_ROOT_SELECTOR) !== null;
}

function getFrameDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument ?? frame.contentWindow?.document ?? null;
  } catch {
    return null;
  }
}

function getFrameWindow(frame: HTMLIFrameElement): Window | null {
  try {
    return frame.contentWindow;
  } catch {
    return null;
  }
}

function resolveFromDocument(
  doc: Document,
  win: Window,
  depth: number,
  frame?: HTMLIFrameElement,
): QuestionRoot | null {
  if (hasQuestionDom(doc)) {
    return { doc, win, frame, kind: frame ? 'iframe' : 'direct', depth };
  }

  const frames = Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe'));
  for (const childFrame of frames) {
    const childDoc = getFrameDocument(childFrame);
    const childWin = getFrameWindow(childFrame);
    if (!childDoc || !childWin) continue;

    const found = resolveFromDocument(childDoc, childWin, depth + 1, childFrame);
    if (found) return found;
  }

  return null;
}

export function resolveQuestionRoot(): QuestionRoot | null {
  return resolveFromDocument(document, window, 0);
}
