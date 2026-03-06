import { QuestionType } from '../../types';
import type { Question, FinalAnswer } from '../../types';
import type { QuestionEditor } from './factory';

const STANDARD_OPTIONS = ['A', 'B', 'C', 'D'] as const;

function createRadioName(questionId: string): string {
  return `final-choice-${questionId}`;
}

function renderSingleChoice(
  question: Question,
  selectedAnswer: string,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'options-group';

  const options = question.options.length > 0
    ? question.options.map(o => o.label)
    : [...STANDARD_OPTIONS];

  for (const opt of options) {
    const label = document.createElement('label');
    label.className = 'option-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = createRadioName(question.id);
    radio.value = opt;
    if (opt === selectedAnswer) {
      radio.checked = true;
    }

    const span = document.createElement('span');
    span.textContent = opt;

    label.appendChild(radio);
    label.appendChild(span);
    container.appendChild(label);
  }

  return container;
}

function renderMultipleChoice(
  question: Question,
  selectedAnswers: string[],
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'options-group';

  const options = question.options.length > 0
    ? question.options.map(o => o.label)
    : [...STANDARD_OPTIONS];

  for (const opt of options) {
    const label = document.createElement('label');
    label.className = 'option-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = `final-multi-${question.id}`;
    checkbox.value = opt;
    if (selectedAnswers.includes(opt)) {
      checkbox.checked = true;
    }

    const span = document.createElement('span');
    span.textContent = opt;

    label.appendChild(checkbox);
    label.appendChild(span);
    container.appendChild(label);
  }

  return container;
}

function parseChoiceAnswer(answer: FinalAnswer | null, isMultiple: boolean): string[] {
  if (!answer) return [];

  const raw = answer.answer;
  if (Array.isArray(raw)) {
    return raw;
  }

  if (isMultiple) {
    return raw.replace(/[^a-zA-Z]/g, '').toUpperCase().split('');
  }

  return [raw.trim().toUpperCase()];
}

export function createChoiceEditor(question: Question, answer: FinalAnswer | null): QuestionEditor {
  const isMultiple = question.type === QuestionType.MULTIPLE_CHOICE;
  const parsed = parseChoiceAnswer(answer, isMultiple);

  const wrapper = document.createElement('div');
  wrapper.className = 'editable-final-answer';

  const editorEl = isMultiple
    ? renderMultipleChoice(question, parsed)
    : renderSingleChoice(question, parsed[0] ?? '');

  wrapper.appendChild(editorEl);

  return {
    render(): HTMLElement {
      return wrapper;
    },

    getValue(): string | string[] {
      if (isMultiple) {
        const checked = wrapper.querySelectorAll<HTMLInputElement>(
          'input[type="checkbox"]:checked',
        );
        return Array.from(checked)
          .map(cb => cb.value)
          .sort();
      }

      const selected = wrapper.querySelector<HTMLInputElement>(
        'input[type="radio"]:checked',
      );
      return selected?.value ?? '';
    },
  };
}
