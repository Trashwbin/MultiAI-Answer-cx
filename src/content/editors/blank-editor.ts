import type { Question, FinalAnswer } from '../../types';
import type { QuestionEditor } from './factory';

function parseBlanks(answer: FinalAnswer | null, blankCount: number): string[] {
  const blanks: string[] = new Array<string>(Math.max(blankCount, 1)).fill('');

  if (!answer) return blanks;

  const raw = answer.answer;
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length && i < blanks.length; i++) {
      blanks[i] = raw[i] ?? '';
    }
    return blanks;
  }

  const lines = raw.split('\n').filter(l => l.trim());
  for (const line of lines) {
    const match = line.match(/第(\d+)空[:：]\s*(.+)/);
    if (match) {
      const idx = parseInt(match[1] ?? '0', 10) - 1;
      if (idx >= 0 && idx < blanks.length) {
        blanks[idx] = match[2]?.trim() ?? '';
      }
    }
  }

  const allBlanksEmpty = blanks.every(b => b.length === 0);
  if (lines.length > 0 && allBlanksEmpty) {
    blanks[0] = raw.trim();
  }

  return blanks;
}

export function createBlankEditor(question: Question, answer: FinalAnswer | null): QuestionEditor {
  const count = Math.max(question.blankCount, 1);
  const values = parseBlanks(answer, count);

  const wrapper = document.createElement('div');
  wrapper.className = 'editable-final-answer';

  const group = document.createElement('div');
  group.className = 'blanks-group';

  for (let i = 0; i < count; i++) {
    const item = document.createElement('div');
    item.className = 'blank-item';

    const label = document.createElement('span');
    label.className = 'blank-label';
    label.textContent = `第${i + 1}空:`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'blank-input';
    input.placeholder = '请输入答案';
    input.value = values[i] ?? '';

    item.appendChild(label);
    item.appendChild(input);
    group.appendChild(item);
  }

  wrapper.appendChild(group);

  return {
    render(): HTMLElement {
      return wrapper;
    },

    getValue(): string[] {
      const inputs = wrapper.querySelectorAll<HTMLInputElement>('.blank-input');
      return Array.from(inputs).map(inp => inp.value.trim());
    },
  };
}
