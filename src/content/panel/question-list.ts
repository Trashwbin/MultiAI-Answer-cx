import type { Question } from '../../types';
import { QuestionType } from '../../types';
import { QUESTION_TYPE_LABELS } from '../../config/question-types';

const MODAL_ID = 'questions-preview-modal';

type SendCallback = (selected: Question[]) => void;

let onSendSelected: SendCallback | null = null;

export function setQuestionListSendCallback(cb: SendCallback): void {
  onSendSelected = cb;
}

export function hideQuestionList(): void {
  document.getElementById(MODAL_ID)?.remove();
}

export function showQuestionList(questions: Question[]): void {
  hideQuestionList();

  if (questions.length === 0) return;

  const grouped = groupByType(questions);

  const modal = el('div', {
    id: MODAL_ID,
    style: styles.overlay,
  });
  requestAnimationFrame(() => { modal.style.opacity = '1'; });

  const container = el('div', { style: styles.container });
  container.appendChild(buildHeader(modal));

  const body = el('div', { style: styles.body });
  const sidebar = buildSidebar(grouped);
  const list = buildQuestionList(grouped);
  body.appendChild(sidebar);
  body.appendChild(list);
  container.appendChild(body);

  modal.appendChild(container);
  injectStyles();
  document.body.appendChild(modal);
}

/* ── Grouping ─────────────────────────────────────────── */

interface TypeGroup {
  type: QuestionType;
  label: string;
  questions: Question[];
}

function groupByType(questions: Question[]): TypeGroup[] {
  const map = new Map<QuestionType, Question[]>();
  for (const q of questions) {
    const list = map.get(q.type) ?? [];
    list.push(q);
    map.set(q.type, list);
  }
  const typeOrder: QuestionType[] = [
    QuestionType.SINGLE_CHOICE,
    QuestionType.MULTIPLE_CHOICE,
    QuestionType.JUDGE,
    QuestionType.FILL_BLANK,
    QuestionType.QA,
    QuestionType.WORD_DEFINITION,
    QuestionType.READING_COMPREHENSION,
    QuestionType.CLOZE,
    QuestionType.SHARED_OPTIONS,
    QuestionType.WORD_FILL,
    QuestionType.OTHER,
  ];
  const groups: TypeGroup[] = [];
  for (const t of typeOrder) {
    const qs = map.get(t);
    if (qs && qs.length > 0) {
      groups.push({ type: t, label: QUESTION_TYPE_LABELS[t], questions: qs });
    }
  }
  return groups;
}

/* ── Header ───────────────────────────────────────────── */

function buildHeader(modal: HTMLElement): HTMLElement {
  const header = el('div', { style: styles.header });

  const title = el('span', { style: 'font-size:18px;font-weight:600;color:#2d3748;' });
  title.textContent = '题目预览';
  header.appendChild(title);

  const actions = el('div', { style: 'display:flex;gap:10px;' });

  actions.appendChild(
    btn('发送选中题目', '#4caf50', '#fff', () => {
      const selected = getSelectedQuestions();
      if (selected.length === 0) return;
      onSendSelected?.(selected);
    }),
  );
  actions.appendChild(
    btn('关闭', '#666', '#fff', () => {
      modal.style.opacity = '0';
      setTimeout(hideQuestionList, 250);
    }),
  );

  header.appendChild(actions);
  return header;
}

/* ── Sidebar (answer card) ────────────────────────────── */

function buildSidebar(groups: TypeGroup[]): HTMLElement {
  const sidebar = el('div', { style: styles.sidebar });

  for (const g of groups) {
    if (g.type === QuestionType.OTHER) continue;

    const section = el('div', { style: 'margin-bottom:14px;' });
    const sectionTitle = el('div', {
      style: 'font-weight:500;font-size:13px;color:#2d3748;margin-bottom:6px;',
    });
    sectionTitle.textContent = g.label;
    section.appendChild(sectionTitle);

    const grid = el('div', {
      style: 'display:grid;grid-template-columns:repeat(5,1fr);gap:4px;',
    });
    for (const q of g.questions) {
      const numBtn = el('button', {
        style: styles.sidebarBtn,
        className: 'ql-sidebar-btn',
      });
      numBtn.dataset['qid'] = q.id;
      numBtn.textContent = q.number;
      numBtn.addEventListener('click', () => scrollToQuestion(q.id));
      grid.appendChild(numBtn);
    }
    section.appendChild(grid);
    sidebar.appendChild(section);
  }

  return sidebar;
}

/* ── Question list ────────────────────────────────────── */

function buildQuestionList(groups: TypeGroup[]): HTMLElement {
  const list = el('div', { style: styles.list });

  for (const g of groups) {
    const section = el('div', { className: `ql-type-section-${g.type}` });

    const typeHeader = el('div', { style: styles.typeHeader });
    if (g.type !== QuestionType.OTHER) {
      const selectAll = checkbox(true);
      selectAll.className = 'ql-type-checkbox';
      selectAll.addEventListener('change', () => {
        const boxes = Array.from(section.querySelectorAll('input.ql-q-checkbox')) as HTMLInputElement[];
        for (const cb of boxes) { cb.checked = selectAll.checked; }
        syncSidebar();
      });
      typeHeader.appendChild(selectAll);
    }
    const typeTitle = el('span', {
      style: 'font-size:16px;font-weight:500;color:#2d3748;',
    });
    typeTitle.textContent = `${g.label} (${g.questions.length}题)`;
    typeHeader.appendChild(typeTitle);
    section.appendChild(typeHeader);

    for (const q of g.questions) {
      section.appendChild(buildQuestionRow(q, g.type));
    }

    list.appendChild(section);
  }

  return list;
}

function buildQuestionRow(q: Question, groupType: QuestionType): HTMLElement {
  const row = el('div', { style: styles.questionRow, className: 'ql-question-item' });
  row.dataset['qid'] = q.id;

  if (groupType !== QuestionType.OTHER) {
    const cb = checkbox(true);
    cb.className = 'ql-q-checkbox';
    cb.style.cssText = 'width:16px;height:16px;margin-right:10px;cursor:pointer;flex-shrink:0;margin-top:2px;';
    cb.addEventListener('change', () => {
      syncTypeCheckbox(groupType);
      syncSidebar();
    });
    row.appendChild(cb);

    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      }
    });
  }

  const content = el('div', { style: 'flex:1;min-width:0;' });

  const meta = el('div', { style: 'font-size:13px;color:#718096;margin-bottom:4px;' });
  meta.textContent = `${q.number}. ${QUESTION_TYPE_LABELS[q.type]}`;
  content.appendChild(meta);

  const body = el('div', { style: 'color:#2d3748;line-height:1.6;' });
  body.textContent = q.content;
  content.appendChild(body);

  if (
    (q.type === QuestionType.SINGLE_CHOICE || q.type === QuestionType.MULTIPLE_CHOICE) &&
    q.options.length > 0
  ) {
    const opts = el('div', { style: 'padding-left:18px;margin-top:6px;color:#4a5568;' });
    for (const opt of q.options) {
      const optLine = el('div', { style: 'margin-bottom:3px;line-height:1.4;' });
      optLine.textContent = `${opt.label}. ${opt.text}`;
      opts.appendChild(optLine);
    }
    content.appendChild(opts);
  }

  if (q.type === QuestionType.FILL_BLANK && q.blankCount > 0) {
    const info = el('div', { style: 'font-size:13px;color:#718096;margin-top:6px;' });
    info.textContent = `本题共有 ${q.blankCount} 个空`;
    content.appendChild(info);
  }

  if (q.subQuestions && q.subQuestions.length > 0) {
    const subContainer = el('div', { style: 'padding-left:18px;margin-top:8px;border-left:2px solid #e2e8f0;' });
    for (const sub of q.subQuestions) {
      const subRow = el('div', { style: 'margin-bottom:8px;padding-left:10px;' });
      const subTitle = el('div', { style: 'font-size:14px;color:#2d3748;margin-bottom:4px;' });
      subTitle.textContent = `(${sub.index}) ${sub.content}`;
      subRow.appendChild(subTitle);

      if (sub.options.length > 0) {
        const subOpts = el('div', { style: 'padding-left:14px;color:#4a5568;font-size:13px;' });
        for (const opt of sub.options) {
          const optLine = el('div', { style: 'margin-bottom:2px;line-height:1.4;' });
          optLine.textContent = `${opt.label}. ${opt.text}`;
          subOpts.appendChild(optLine);
        }
        subRow.appendChild(subOpts);
      }

      subContainer.appendChild(subRow);
    }
    content.appendChild(subContainer);
  }

  row.appendChild(content);
  return row;
}

/* ── Helpers ──────────────────────────────────────────── */

function getSelectedQuestions(): Question[] {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return [];
  const selected: Question[] = [];
  const items = Array.from(modal.querySelectorAll('.ql-question-item')) as HTMLElement[];
  for (const item of items) {
    const cb = item.querySelector('input.ql-q-checkbox') as HTMLInputElement | null;
    if (!cb || cb.checked) {
      const qid = item.dataset['qid'] ?? '';
      const stored = questionCache.get(qid);
      if (stored) selected.push(stored);
    }
  }
  return selected;
}

const questionCache = new Map<string, Question>();

function cacheQuestions(questions: Question[]): void {
  questionCache.clear();
  for (const q of questions) {
    questionCache.set(q.id, q);
  }
}

function scrollToQuestion(qid: string): void {
  const modal = document.getElementById(MODAL_ID);
  const target = modal?.querySelector<HTMLElement>(`[data-qid="${qid}"].ql-question-item`);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (target) {
    target.style.backgroundColor = '#e8f5e9';
    setTimeout(() => { target.style.backgroundColor = ''; }, 1200);
  }
}

function syncTypeCheckbox(type: QuestionType): void {
  const section = document.querySelector(`.ql-type-section-${type}`);
  if (!section) return;
  const typeCb = section.querySelector('input.ql-type-checkbox') as HTMLInputElement | null;
  if (!typeCb) return;
  const all = Array.from(section.querySelectorAll('input.ql-q-checkbox')) as HTMLInputElement[];
  const checked = Array.from(all).filter((c) => c.checked).length;
  typeCb.checked = checked === all.length;
  typeCb.indeterminate = checked > 0 && checked < all.length;
}

function syncSidebar(): void {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  const btns = Array.from(modal.querySelectorAll('.ql-sidebar-btn')) as HTMLButtonElement[];
  for (const b of btns) {
    const qid = b.dataset['qid'] ?? '';
    const item = modal.querySelector(`.ql-question-item[data-qid="${qid}"]`);
    const cb = item?.querySelector('input.ql-q-checkbox') as HTMLInputElement | null;
    const isSelected = !cb || cb.checked;
    b.style.background = isSelected ? '#4caf50' : '#fff';
    b.style.color = isSelected ? '#fff' : '#666';
    b.style.borderColor = isSelected ? '#4caf50' : '#e0e0e0';
  }
}

/* ── DOM shorthand ────────────────────────────────────── */

function el(
  tag: string,
  attrs?: { style?: string; id?: string; className?: string },
): HTMLElement {
  const e = document.createElement(tag);
  if (attrs?.id) e.id = attrs.id;
  if (attrs?.className) e.className = attrs.className;
  if (attrs?.style) e.style.cssText = attrs.style;
  return e;
}

function checkbox(checked: boolean): HTMLInputElement {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.style.cssText = 'width:16px;height:16px;cursor:pointer;';
  return cb;
}

function btn(text: string, bg: string, color: string, onClick: () => void): HTMLElement {
  const b = el('button', {
    style: `padding:8px 16px;background:${bg};color:${color};border:none;border-radius:6px;cursor:pointer;font-size:14px;transition:opacity 0.2s;`,
  });
  b.textContent = text;
  b.addEventListener('mouseenter', () => { b.style.opacity = '0.85'; });
  b.addEventListener('mouseleave', () => { b.style.opacity = '1'; });
  b.addEventListener('click', onClick);
  return b;
}

/* ── Styles ───────────────────────────────────────────── */

const styles = {
  overlay: [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
    'z-index:99999', 'opacity:0', 'transition:opacity 0.25s',
    'backdrop-filter:blur(2px)',
  ].join(';'),
  container: [
    'position:relative', 'width:90%', 'height:90%', 'margin:2% auto',
    'background:#fff', 'border-radius:12px', 'display:flex',
    'flex-direction:column', 'overflow:hidden',
    'box-shadow:0 8px 32px rgba(0,0,0,0.18)',
  ].join(';'),
  header: [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:14px 24px', 'border-bottom:1px solid #e2e8f0',
    'background:#f7fafc', 'flex-shrink:0',
  ].join(';'),
  body: [
    'display:flex', 'flex:1', 'overflow:hidden', 'gap:0',
  ].join(';'),
  sidebar: [
    'width:180px', 'flex-shrink:0', 'padding:14px',
    'overflow-y:auto', 'background:#f8f9fa',
    'border-right:1px solid #e2e8f0',
  ].join(';'),
  sidebarBtn: [
    'width:30px', 'height:30px', 'border:1px solid #4caf50',
    'border-radius:4px', 'background:#4caf50', 'color:#fff',
    'font-size:12px', 'cursor:pointer', 'display:flex',
    'align-items:center', 'justify-content:center',
    'transition:all 0.15s', 'padding:0',
  ].join(';'),
  list: [
    'flex:1', 'overflow-y:auto', 'padding:0',
  ].join(';'),
  typeHeader: [
    'display:flex', 'align-items:center', 'gap:10px',
    'padding:12px 20px', 'background:#f8f9fa',
    'border-bottom:1px solid #edf2f7', 'position:sticky',
    'top:0', 'z-index:1',
  ].join(';'),
  questionRow: [
    'display:flex', 'padding:14px 20px',
    'border-bottom:1px solid #edf2f7', 'cursor:pointer',
    'transition:background 0.15s', 'font-size:15px', 'line-height:1.6',
  ].join(';'),
} as const;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    #${MODAL_ID} .ql-question-item:hover { background:#f7fafc; }
    #${MODAL_ID} .ql-sidebar-btn:hover { opacity:0.8; }
    #${MODAL_ID} ::-webkit-scrollbar { width:6px; }
    #${MODAL_ID} ::-webkit-scrollbar-thumb { background:#cbd5e0; border-radius:3px; }
  `;
  document.head.appendChild(s);
}

/* ── Public init (must be called before showQuestionList) ── */

export function initQuestionList(questions: Question[]): void {
  cacheQuestions(questions);
}
