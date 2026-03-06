import type { Question, FinalAnswer } from '../../types';
import type { QuestionEditor } from './factory';

function extractText(answer: FinalAnswer | null): string {
  if (!answer) return '';

  const raw = answer.answer;
  if (Array.isArray(raw)) {
    return raw.join('\n');
  }

  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

export function createQAEditor(_question: Question, answer: FinalAnswer | null): QuestionEditor {
  const text = extractText(answer);

  const wrapper = document.createElement('div');
  wrapper.className = 'editable-final-answer';

  const editorDiv = document.createElement('div');
  editorDiv.className = 'qa-editor';

  const textarea = document.createElement('textarea');
  textarea.className = 'answer-textarea';
  textarea.rows = 6;
  textarea.style.whiteSpace = 'pre-wrap';
  textarea.value = text;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  });

  setTimeout(() => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, 0);

  editorDiv.appendChild(textarea);
  wrapper.appendChild(editorDiv);

  return {
    render(): HTMLElement {
      return wrapper;
    },

    getValue(): string {
      return textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n');
    },
  };
}
