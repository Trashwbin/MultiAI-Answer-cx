import type { Question, FinalAnswer } from '../../types';
import type { QuestionEditor } from './factory';

interface JudgeOption {
  value: string;
  label: string;
}

const JUDGE_OPTIONS: readonly JudgeOption[] = [
  { value: 'A', label: '正确' },
  { value: 'B', label: '错误' },
] as const;

function resolveChecked(answer: FinalAnswer | null): string {
  if (!answer) return '';

  const raw = Array.isArray(answer.answer)
    ? (answer.answer[0] ?? '')
    : answer.answer;

  const normalized = raw.trim().toUpperCase();

  if (normalized === 'A' || raw.includes('对') || raw.includes('正确') || raw.includes('√')) {
    return 'A';
  }
  if (normalized === 'B' || raw.includes('错') || raw.includes('×')) {
    return 'B';
  }

  return normalized;
}

export function createJudgeEditor(question: Question, answer: FinalAnswer | null): QuestionEditor {
  const checked = resolveChecked(answer);

  const wrapper = document.createElement('div');
  wrapper.className = 'editable-final-answer';

  const group = document.createElement('div');
  group.className = 'judge-options-group';

  const radioName = `final-judge-${question.id}`;

  for (const opt of JUDGE_OPTIONS) {
    const label = document.createElement('label');
    label.className = 'judge-option-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = radioName;
    radio.value = opt.value;
    if (opt.value === checked) {
      radio.checked = true;
    }

    const span = document.createElement('span');
    span.textContent = `${opt.value} (${opt.label})`;

    label.appendChild(radio);
    label.appendChild(span);
    group.appendChild(label);
  }

  wrapper.appendChild(group);

  return {
    render(): HTMLElement {
      return wrapper;
    },

    getValue(): string {
      const selected = wrapper.querySelector<HTMLInputElement>(
        'input[type="radio"]:checked',
      );
      return selected?.value ?? '';
    },
  };
}
