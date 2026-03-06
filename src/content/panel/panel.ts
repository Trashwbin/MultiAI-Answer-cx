import type { Question, FinalAnswer } from '../../types';
import { createEditor } from '../editors/factory';
import { showLoading, hideLoading } from './loading';

const PANEL_ID = 'ai-answers-panel';

export interface AnswerPanelState {
  questions: Question[];
  finalAnswers: FinalAnswer[];
  isLoading: boolean;
}

export type AutoFillCallback = () => void;

let currentPanel: HTMLElement | null = null;
let onAutoFill: AutoFillCallback | null = null;

export function setAutoFillCallback(cb: AutoFillCallback): void {
  onAutoFill = cb;
}

export function showAnswerPanel(state: AnswerPanelState): void {
  hideAnswerPanel();

  const panel = buildPanel(state);
  document.body.appendChild(panel);
  currentPanel = panel;

  if (state.isLoading) {
    showLoading();
  }
}

export function updateAnswerPanel(finalAnswers: FinalAnswer[]): void {
  hideLoading();

  const body = currentPanel?.querySelector<HTMLElement>('.ai-panel-body');
  if (!body || !currentPanel) return;

  const questions = getQuestionsFromPanel(currentPanel);

  body.innerHTML = '';
  renderQuestionRows(body, questions, finalAnswers);
}

export function hideAnswerPanel(): void {
  currentPanel?.remove();
  currentPanel = null;
}

function buildPanel(state: AnswerPanelState): HTMLElement {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position: fixed',
    'top: 60px',
    'right: 20px',
    'width: 420px',
    'max-height: calc(100vh - 80px)',
    'background: white',
    'border-radius: 8px',
    'box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15)',
    'z-index: 999999',
    'display: flex',
    'flex-direction: column',
    'font-family: system-ui, -apple-system, sans-serif',
    'font-size: 14px',
    'color: #2d3748',
    'overflow: hidden',
  ].join(';');

  panel.appendChild(buildHeader());

  const body = document.createElement('div');
  body.className = 'ai-panel-body';
  body.style.cssText = [
    'flex: 1',
    'overflow-y: auto',
    'padding: 12px 16px',
  ].join(';');

  storeQuestionsOnPanel(panel, state.questions);
  renderQuestionRows(body, state.questions, state.finalAnswers);

  panel.appendChild(body);
  injectPanelStyles();

  return panel;
}

function buildHeader(): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText = [
    'display: flex',
    'align-items: center',
    'justify-content: space-between',
    'padding: 10px 16px',
    'border-bottom: 1px solid #e2e8f0',
    'background: #f7fafc',
    'border-radius: 8px 8px 0 0',
  ].join(';');

  const title = document.createElement('span');
  title.style.cssText = 'font-weight: 600; font-size: 15px; color: #2d3748;';
  title.textContent = 'AI 答案';
  header.appendChild(title);

  const btnGroup = document.createElement('div');
  btnGroup.style.cssText = 'display: flex; gap: 6px;';

  btnGroup.appendChild(
    createHeaderButton('自动填写', '#4caf50', '#fff', () => onAutoFill?.()),
  );
  btnGroup.appendChild(
    createHeaderButton('收起', '#f8f9fa', '#333', toggleCollapse),
  );
  btnGroup.appendChild(
    createHeaderButton('×', '#f8f9fa', '#333', hideAnswerPanel),
  );

  header.appendChild(btnGroup);
  return header;
}

function createHeaderButton(
  text: string,
  bg: string,
  color: string,
  onClick: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.style.cssText = [
    `background: ${bg}`,
    `color: ${color}`,
    'border: none',
    'border-radius: 4px',
    'padding: 4px 10px',
    'cursor: pointer',
    'font-size: 13px',
    'transition: opacity 0.2s',
  ].join(';');
  btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.8'; });
  btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
  btn.addEventListener('click', onClick);
  return btn;
}

function toggleCollapse(): void {
  if (!currentPanel) return;

  const body = currentPanel.querySelector<HTMLElement>('.ai-panel-body');
  if (!body) return;

  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? 'block' : 'none';

  const collapseBtn = currentPanel.querySelectorAll('button')[1];
  if (collapseBtn) {
    collapseBtn.textContent = isCollapsed ? '收起' : '展开';
  }
}

function renderQuestionRows(
  container: HTMLElement,
  questions: Question[],
  finalAnswers: FinalAnswer[],
): void {
  for (const question of questions) {
    const answer = finalAnswers.find(a => a.questionNumber === question.number) ?? null;
    const row = buildQuestionRow(question, answer);
    container.appendChild(row);
  }
}

function buildQuestionRow(question: Question, answer: FinalAnswer | null): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ai-panel-row';
  row.dataset['questionId'] = question.id;
  row.style.cssText = [
    'padding: 10px 0',
    'border-bottom: 1px solid #edf2f7',
  ].join(';');

  const headerLine = document.createElement('div');
  headerLine.style.cssText = [
    'display: flex',
    'align-items: center',
    'gap: 8px',
    'margin-bottom: 8px',
  ].join(';');

  const numberBadge = document.createElement('span');
  numberBadge.style.cssText = [
    'font-weight: 500',
    'color: #4a5568',
    'min-width: 24px',
  ].join(';');
  numberBadge.textContent = question.number;

  const typeBadge = document.createElement('span');
  typeBadge.style.cssText = [
    'font-size: 12px',
    'color: #718096',
    'background: #edf2f7',
    'padding: 1px 6px',
    'border-radius: 4px',
  ].join(';');
  typeBadge.textContent = question.type;

  headerLine.appendChild(numberBadge);
  headerLine.appendChild(typeBadge);

  if (answer) {
    const voteBadge = document.createElement('span');
    voteBadge.style.cssText = [
      'font-size: 12px',
      'color: #38a169',
      'background: #f0fff4',
      'padding: 1px 6px',
      'border-radius: 4px',
      'margin-left: auto',
    ].join(';');
    voteBadge.textContent = `${answer.votes}/${answer.totalProviders} AI 同意`;
    headerLine.appendChild(voteBadge);
  }

  row.appendChild(headerLine);

  const contentPreview = document.createElement('div');
  contentPreview.style.cssText = [
    'font-size: 13px',
    'color: #718096',
    'margin-bottom: 8px',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'display: -webkit-box',
    '-webkit-line-clamp: 2',
    '-webkit-box-orient: vertical',
    'line-height: 1.4',
  ].join(';');
  contentPreview.textContent = question.content;
  contentPreview.title = question.content;
  row.appendChild(contentPreview);

  const editor = createEditor(question, answer);
  row.appendChild(editor.render());

  return row;
}

const QUESTIONS_DATA_KEY = '__aiPanelQuestions';

function storeQuestionsOnPanel(panel: HTMLElement, questions: Question[]): void {
  (panel as HTMLElement & { [QUESTIONS_DATA_KEY]: Question[] })[QUESTIONS_DATA_KEY] = questions;
}

function getQuestionsFromPanel(panel: HTMLElement): Question[] {
  return ((panel as HTMLElement & { [QUESTIONS_DATA_KEY]?: Question[] })[QUESTIONS_DATA_KEY]) ?? [];
}

let panelStylesInjected = false;

function injectPanelStyles(): void {
  if (panelStylesInjected) return;
  panelStylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    #${PANEL_ID} .ai-panel-body::-webkit-scrollbar {
      width: 6px;
    }
    #${PANEL_ID} .ai-panel-body::-webkit-scrollbar-thumb {
      background: #cbd5e0;
      border-radius: 3px;
    }
    #${PANEL_ID} .editable-final-answer {
      width: 100%;
      font-family: system-ui, -apple-system, sans-serif;
      min-height: 40px;
      display: flex;
      align-items: flex-start;
    }
    #${PANEL_ID} .options-group {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      width: 100%;
    }
    #${PANEL_ID} .option-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      background: #f8f9fa;
      transition: background 0.2s;
      font-size: 13px;
    }
    #${PANEL_ID} .option-item:hover {
      background: #e9ecef;
    }
    #${PANEL_ID} .blanks-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    #${PANEL_ID} .blank-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    #${PANEL_ID} .blank-label {
      white-space: nowrap;
      color: #495057;
      font-size: 13px;
      min-width: 50px;
    }
    #${PANEL_ID} .blank-input {
      flex: 1;
      max-width: 200px;
      padding: 4px 8px;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      font-size: 13px;
    }
    #${PANEL_ID} .blank-input:focus {
      outline: none;
      border-color: #86b7fe;
      box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
    }
    #${PANEL_ID} .judge-options-group {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      width: 100%;
    }
    #${PANEL_ID} .judge-option-item {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      background: #f8f9fa;
      transition: background 0.2s;
      font-size: 13px;
    }
    #${PANEL_ID} .judge-option-item:hover {
      background: #e9ecef;
    }
    #${PANEL_ID} .qa-editor {
      width: 100%;
    }
    #${PANEL_ID} .answer-textarea {
      width: 100%;
      padding: 8px;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      min-height: 80px;
    }
    #${PANEL_ID} .answer-textarea:focus {
      outline: none;
      border-color: #86b7fe;
      box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25);
    }
  `;
  document.head.appendChild(style);
}
