import type { Question, FinalAnswer, ProviderResponse, ProviderConfig } from '../../types';
import type { CustomProviderConfig } from '../../types/provider';
import { getProviderById } from '../../config/ai-config';
import { createEditor } from '../editors/factory';
import { matchesQuestionKey } from '../../utils/question-key';

/* ── Custom provider config cache ────────────────────── */

const customProviderCache = new Map<string, ProviderConfig>();

function refreshCustomProviderCache(): void {
  chrome.runtime.sendMessage({ type: 'GET_CUSTOM_PROVIDERS' })
    .then((res: { success?: boolean; providers?: CustomProviderConfig[] } | undefined) => {
      if (res?.success && Array.isArray(res.providers)) {
        customProviderCache.clear();
        for (const p of res.providers) {
          customProviderCache.set(p.id, p);
        }
      }
    })
    .catch(() => {});
}

refreshCustomProviderCache();

function resolveProviderConfig(id: string): ProviderConfig | undefined {
  return getProviderById(id) ?? customProviderCache.get(id);
}

function createProviderIcon(config: ProviderConfig | undefined, size = 18): HTMLElement {
  const color = config?.color ?? '#718096';
  const name = config?.name ?? 'Provider';
  const wrap = mk('span', {
    style: j(
      `width:${size + 8}px`,
      `height:${size + 8}px`,
      'border-radius:8px',
      `background:${color}18`,
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'overflow:hidden',
      'flex-shrink:0',
    ),
  });

  const img = document.createElement('img');
  img.src = chrome.runtime.getURL(config?.iconPath ?? 'icons/providers/openai-compatible.svg');
  img.alt = name;
  img.style.cssText = j(
    `width:${size}px`,
    `height:${size}px`,
    'object-fit:contain',
    'display:block',
  );
  img.onerror = () => {
    wrap.innerHTML = '';
    const fallback = mk('span', {
      style: j(
        'font-size:12px',
        'font-weight:700',
        `color:${color}`,
        'line-height:1',
      ),
    });
    fallback.textContent = name.charAt(0);
    wrap.appendChild(fallback);
  };
  wrap.appendChild(img);

  return wrap;
}

/* ── Constants ────────────────────────────────────────── */

const PANEL_ID = 'ai-answers-panel';
const ANIM = 'aiPanel';

/* ── Exported Interfaces ─────────────────────────────── */

export interface AnswerPanelState {
  questions: Question[];
  finalAnswers: FinalAnswer[];
  providerIds?: string[];
  weightProviderId?: string | null;
  isLoading: boolean;
}

export interface AnswerPanelCallbacks {
  onAutoFill: () => void;
  onRetransmit: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onWeightChange: (providerId: string | null) => void;
}

export type AutoFillCallback = () => void;

/* ── Module State ────────────────────────────────────── */

let currentPanel: HTMLElement | null = null;
let panelState: AnswerPanelState | null = null;
let panelCallbacks: AnswerPanelCallbacks | null = null;
let onAutoFill: AutoFillCallback | null = null;
let activeProviderIds: string[] = [];
let visibleProviderIds: string[] = [];
let currentWeightId: string | null = null;
let storedProviderResponses = new Map<string, ProviderResponse | 'querying'>();
let isCollapsed = false;
let isMinimized = false;
let stylesInjected = false;
let dragAbortController: AbortController | null = null;

/* ═══════════════════════════════════════════════════════
   Public API
   ═══════════════════════════════════════════════════════ */

export function showAnswerPanel(
  state: AnswerPanelState,
  callbacks?: AnswerPanelCallbacks,
): void {
  hideAnswerPanel();
  refreshCustomProviderCache();

  panelState = state;
  panelCallbacks = callbacks ?? null;
  activeProviderIds = state.providerIds ? [...state.providerIds] : [];
  currentWeightId = state.weightProviderId ?? null;
  visibleProviderIds = currentWeightId ? [currentWeightId] : activeProviderIds.slice(0, 1);
  storedProviderResponses = new Map();
  isCollapsed = false;
  isMinimized = false;

  dragAbortController?.abort();
  dragAbortController = new AbortController();

  injectStyles();
  const panel = buildPanel();
  document.body.appendChild(panel);
  currentPanel = panel;

  requestAnimationFrame(() => {
    panel.style.opacity = '1';
  });
}

export function updateAnswerPanel(
  finalAnswers: FinalAnswer[],
  providerResponses?: Map<string, ProviderResponse | 'querying'>,
): void {
  if (!currentPanel || !panelState) return;

  if (providerResponses) {
    storedProviderResponses = new Map(providerResponses);
    if (activeProviderIds.length === 0) {
      activeProviderIds = Array.from(providerResponses.keys());
      if (currentWeightId === null && activeProviderIds.length > 0) {
        currentWeightId = activeProviderIds[0] ?? null;
      }
      visibleProviderIds = currentWeightId ? [currentWeightId] : activeProviderIds.slice(0, 1);
    }
  }

  panelState.finalAnswers = finalAnswers;
  refreshFullGrid();
}

export function updateProviderStatus(
  providerResponses: Map<string, ProviderResponse | 'querying'>,
): void {
  if (!currentPanel || !panelState) return;

  storedProviderResponses = new Map(providerResponses);

  if (activeProviderIds.length === 0) {
    activeProviderIds = Array.from(providerResponses.keys());
    if (currentWeightId === null && activeProviderIds.length > 0) {
      currentWeightId = activeProviderIds[0] ?? null;
    }
    visibleProviderIds = currentWeightId ? [currentWeightId] : activeProviderIds.slice(0, 1);
  }

  refreshFullGrid();
}

export function hideAnswerPanel(): void {
  currentPanel?.remove();
  currentPanel = null;
  panelState = null;
  panelCallbacks = null;
  dragAbortController?.abort();
  dragAbortController = null;
}

export function setAutoFillCallback(cb: AutoFillCallback): void {
  onAutoFill = cb;
}

/* ── Animated close (user-initiated) ─────────────────── */

function animateClose(): void {
  if (!currentPanel) return;
  const panel = currentPanel;
  panel.style.transition = 'opacity 0.3s ease-out';
  panel.style.opacity = '0';
  setTimeout(() => {
    panel.remove();
    if (currentPanel === panel) {
      currentPanel = null;
      panelState = null;
      panelCallbacks = null;
    }
  }, 300);
}

/* ═══════════════════════════════════════════════════════
   Panel Construction
   ═══════════════════════════════════════════════════════ */

function buildPanel(): HTMLElement {
  const panel = mk('div', {
    id: PANEL_ID,
    style: j(
      'position:fixed', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)',
      'width:90vw', 'max-width:90vw', 'height:90vh',
      'background:#fff', 'border-radius:8px',
      'box-shadow:0 2px 10px rgba(0,0,0,0.1)',
      'z-index:10000',
      'display:flex', 'flex-direction:column',
      'font-family:system-ui,-apple-system,sans-serif',
      'font-size:14px', 'color:#2d3748',
      'overflow:hidden',
      'opacity:0', 'transition:opacity 0.3s ease-out',
      'user-select:text', '-webkit-user-select:text',
      `animation:${ANIM}FadeIn 0.3s ease-out`,
    ),
  });

  /* Header container (title + toolbar + AI names) */
  const header = mk('div', {
    'data-role': 'header',
    style: j('flex-shrink:0', 'border-bottom:1px solid #e2e8f0'),
  });

  header.appendChild(buildTitleRow());
  header.appendChild(buildToolbar());
  header.appendChild(buildAINamesRow());
  panel.appendChild(header);

  /* Scrollable body */
  const body = mk('div', {
    className: 'ai-panel-body',
    style: j('flex:1', 'overflow-y:auto', 'padding:16px 20px'),
  });
  renderQuestionRows(body);
  panel.appendChild(body);

  return panel;
}

/* ── Title Row (Draggable) ───────────────────────────── */

function buildTitleRow(): HTMLElement {
  const row = mk('div', {
    'data-role': 'title-row',
    style: j(
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:10px 16px',
      'background:#f7fafc', 'border-radius:8px 8px 0 0',
      'cursor:move', 'user-select:none',
      'position:relative',
    ),
  });

  const dragIcon = mk('span', {
    style: j(
      'position:absolute', 'left:16px',
      'color:#a0aec0', 'font-size:14px', 'letter-spacing:2px',
    ),
  });
  dragIcon.textContent = '\u22EE\u22EE';

  const title = mk('span', {
    style: j('font-weight:600', 'font-size:15px', 'color:#2d3748'),
  });
  title.textContent = 'AI \u56DE\u7B54\u5BF9\u6BD4';

  row.appendChild(dragIcon);
  row.appendChild(title);

  /* Drag logic */
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let offsetX = 0;
  let offsetY = 0;

  row.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true;
    dragStartX = e.clientX - offsetX;
    dragStartY = e.clientY - offsetY;
    e.preventDefault();
  });

  const onMouseMove = (e: MouseEvent): void => {
    if (!isDragging || !currentPanel) return;
    offsetX = e.clientX - dragStartX;
    offsetY = e.clientY - dragStartY;
    currentPanel.style.transform =
      `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
  };

  const onMouseUp = (): void => {
    isDragging = false;
  };

  if (dragAbortController) {
    document.addEventListener('mousemove', onMouseMove, {
      signal: dragAbortController.signal,
    });
    document.addEventListener('mouseup', onMouseUp, {
      signal: dragAbortController.signal,
    });
  }

  return row;
}

/* ── Toolbar ─────────────────────────────────────────── */

function buildToolbar(): HTMLElement {
  const toolbar = mk('div', {
    'data-role': 'toolbar',
    style: j(
      'display:flex', 'gap:10px', 'align-items:center',
      'padding:8px 16px',
      'background:#fff',
      'border-bottom:1px solid #f0f0f0',
      'flex-wrap:wrap',
    ),
  });

  /* a. "\u67E5\u770B\u5B8C\u6574\u56DE\u7B54" */
  toolbar.appendChild(
    mkBtn('\u67E5\u770B\u5B8C\u6574\u56DE\u7B54', '#673ab7', '#fff', showRawResponseModal),
  );

  const collapseBtn = mkBtn(
    '\u6536\u8D77AI\u56DE\u7B54', '#f8f9fa', '#333',
    () => {
      if (isMinimized) {
        expandPanel();
      } else {
        minimizePanel();
      }
    },
  );
  collapseBtn.id = 'ai-panel-collapse-btn';
  toolbar.appendChild(collapseBtn);

  toolbar.appendChild(
    mkBtn('\u81EA\u52A8\u586B\u5199', '#4caf50', '#fff', () => {
      minimizePanel();
      setTimeout(() => {
        if (panelCallbacks?.onAutoFill) {
          panelCallbacks.onAutoFill();
        } else {
          onAutoFill?.();
        }
      }, 350);
    }),
  );

  const closeBtn = mk('button', {
    style: j(
      'width:28px', 'height:28px', 'border-radius:50%',
      'background:#f8f9fa', 'border:none',
      'color:#333', 'font-size:16px',
      'cursor:pointer', 'display:flex',
      'align-items:center', 'justify-content:center',
      'transition:all 0.15s', 'margin-left:auto',
      'font-family:system-ui,-apple-system,sans-serif',
      'line-height:1',
    ),
  });
  closeBtn.textContent = '\u00D7';
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#fee2e2';
    closeBtn.style.color = '#dc2626';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = '#f8f9fa';
    closeBtn.style.color = '#333';
  });
  closeBtn.addEventListener('click', animateClose);
  toolbar.appendChild(closeBtn);

  return toolbar;
}

/* ── AI Names Header Row ─────────────────────────────── */

function buildAINamesRow(): HTMLElement {
  const row = mk('div', {
    'data-role': 'ai-names-row',
    style: j(
      'display:flex',
      'align-items:center',
      'gap:12px',
      'padding:10px 20px',
      'background:#fafbfc',
      'min-height:48px',
      'overflow-x:auto',
      'border-bottom:1px solid #f0f0f0',
    ),
  });

  const title = mk('div', {
    style: j(
      'font-weight:700', 'color:#718096', 'font-size:12px',
      'padding:4px 8px', 'background:#edf2f7', 'border-radius:999px',
      'white-space:nowrap', 'flex-shrink:0',
    ),
  });
  title.textContent = isCollapsed ? 'AI\u5217\uFF08\u5DF2\u6536\u8D77\uFF09' : 'AI\u5217\u663E\u793A';
  row.appendChild(title);

  for (const id of activeProviderIds) {
    const config = resolveProviderConfig(id);
    const name = config?.name ?? id;
    const color = config?.color ?? '#718096';

    const cell = mk('div', {
      'data-provider': id,
      style: j(
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:4px 0 6px 0',
        `border-bottom:3px solid ${color}`,
        'white-space:nowrap', 'flex-shrink:0',
      ),
    });
    cell.title = name;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = visibleProviderIds.includes(id);
    checkbox.disabled = isCollapsed;
    checkbox.style.cssText = j(
      `accent-color:${color}`,
      'cursor:pointer',
      isCollapsed ? 'opacity:0.5' : 'opacity:1',
    );
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (!visibleProviderIds.includes(id)) {
          visibleProviderIds = [...visibleProviderIds, id];
        }
      } else {
        visibleProviderIds = visibleProviderIds.filter((providerId) => providerId !== id);
      }
      refreshFullGrid();
    });

    const nameWrap = mk('span', {
      style: j('display:flex', 'align-items:center', 'gap:4px'),
    });

    const status = mk('span', {
      style: j('font-size:12px', 'color:#718096'),
    });

    const providerData = storedProviderResponses.get(id);
    if (providerData === 'querying') {
      status.textContent = '\u23F3';
    } else if (providerData?.error) {
      status.textContent = '\u2717';
    } else if (providerData) {
      status.textContent = '\u2713';
    }

    nameWrap.appendChild(createProviderIcon(config, 16));
    nameWrap.appendChild(status);

    const actions = mk('div', {
      style: j('display:flex', 'align-items:center', 'gap:2px'),
    });

    const retryBtn = mk('button', {
      style: j(
        'background:none', 'border:none', `color:${color}`,
        'cursor:pointer', 'font-size:13px', 'padding:2px 4px',
        'border-radius:4px', 'line-height:1',
      ),
    });
    retryBtn.textContent = '\u21BB';
    retryBtn.title = `\u91CD\u53D1 ${name}`;
    retryBtn.addEventListener('click', () => handleRetransmit(id));

    const weightBtn = mk('button', {
      style: j(
        'background:none', 'border:none',
        'cursor:pointer', 'font-size:13px', 'padding:2px 4px',
        'border-radius:4px', 'line-height:1',
      ),
    });
    weightBtn.style.color = currentWeightId === id ? '#f59e0b' : '#718096';
    weightBtn.textContent = currentWeightId === id ? '\u2605' : '\u2606';
    weightBtn.title = currentWeightId === id
      ? `${name}\uFF08\u5F53\u524D\u6743\u91CDAI\uFF09`
      : `\u8BBE\u4E3A\u6743\u91CDAI\uFF1A${name}`;
    weightBtn.addEventListener('click', () => handleWeightChange(id));

    const removeBtn = mk('button', {
      style: j(
        'background:none', 'border:none', 'color:#dc2626',
        'cursor:pointer', 'font-size:13px', 'padding:2px 4px',
        'border-radius:4px', 'line-height:1',
      ),
    });
    removeBtn.textContent = '\u00D7';
    removeBtn.title = `\u5220\u9664 ${name}`;
    removeBtn.addEventListener('click', () => handleRemoveProvider(id));

    actions.appendChild(retryBtn);
    actions.appendChild(weightBtn);
    actions.appendChild(removeBtn);

    cell.appendChild(checkbox);
    cell.appendChild(nameWrap);
    cell.appendChild(actions);
    row.appendChild(cell);
  }

  const hint = mk('div', {
    style: j(
      'font-size:12px', 'color:#a0aec0', 'margin-left:auto',
      'white-space:nowrap', 'flex-shrink:0',
    ),
  });
  hint.textContent = isCollapsed
    ? '\u6536\u8D77\u72B6\u6001\u4E0B\u4EC5\u663E\u793A\u9898\u76EE\u4E0E\u6700\u7EC8\u7B54\u6848'
    : '\u4EC5\u52FE\u9009AI\u4F1A\u663E\u793A\u5728\u4E0B\u65B9\u5BF9\u6BD4\u7F51\u683C\u4E2D';
  row.appendChild(hint);

  return row;
}

function refreshAINamesRow(): void {
  if (!currentPanel) return;
  const oldRow = currentPanel.querySelector('[data-role="ai-names-row"]');
  if (!oldRow) return;
  const newRow = buildAINamesRow();
  oldRow.replaceWith(newRow);
}

/* ── Grid Columns ────────────────────────────────────── */

function gridColumns(): string {
  if (isCollapsed || visibleProviderIds.length === 0) {
    return 'grid-template-columns:200px 1fr';
  }
  return `grid-template-columns:200px repeat(${visibleProviderIds.length},1fr) 1fr`;
}

/* ═══════════════════════════════════════════════════════
   Question Rows
   ═══════════════════════════════════════════════════════ */

function renderQuestionRows(container: HTMLElement): void {
  if (!panelState) return;

  panelState.questions.forEach((question, index) => {
    const answer =
      panelState?.finalAnswers.find((a) => matchesQuestionKey(question, a.id)) ?? null;
    container.appendChild(buildQuestionRow(question, answer, index));
  });
}

function buildQuestionRow(
  question: Question,
  answer: FinalAnswer | null,
  index: number,
): HTMLElement {
  const row = mk('div', {
    'data-question-number': question.number,
    style: j(
      'display:grid',
      gridColumns(),
      'gap:20px',
      'padding:12px 0',
      'border-bottom:1px solid #edf2f7',
      `animation:${ANIM}SlideIn 0.3s ease-out`,
      `animation-delay:${index * 0.05}s`,
      'animation-fill-mode:both',
    ),
  });

  /* Question column */
  row.appendChild(buildQuestionCell(question));

  /* Per-AI answer columns (only when expanded) */
  if (!isCollapsed) {
    for (const id of visibleProviderIds) {
      row.appendChild(buildAIAnswerCell(question, id));
    }
  }

  /* Final answer column */
  row.appendChild(buildFinalAnswerCell(question, answer));

  return row;
}

/* ── Question Cell ───────────────────────────────────── */

function buildQuestionCell(question: Question): HTMLElement {
  const cell = mk('div', {
    style: j('background:#f8f9fa', 'border-radius:6px', 'padding:12px'),
  });

  const num = mk('div', {
    style: j('font-weight:700', 'color:#2d3748', 'margin-bottom:4px', 'font-size:14px'),
  });
  num.textContent = question.displayNumber === question.number
    ? `第 ${question.number} 题`
    : `第 ${question.number} 题 · 页面显示 ${question.displayNumber}`;

  const typeBadge = mk('span', {
    style: j(
      'font-size:11px', 'background:#e2e8f0', 'color:#718096',
      'padding:1px 6px', 'border-radius:4px', 'display:inline-block',
      'margin-bottom:6px',
    ),
  });
  typeBadge.textContent = question.type;

  const content = mk('div', {
    style: j(
      'font-size:13px', 'color:#718096', 'line-height:1.4',
      'overflow:hidden', 'text-overflow:ellipsis',
      'display:-webkit-box', '-webkit-line-clamp:2',
      '-webkit-box-orient:vertical',
    ),
  });
  content.textContent = question.content;
  content.title = question.content;

  cell.appendChild(num);
  cell.appendChild(typeBadge);
  cell.appendChild(content);
  return cell;
}

/* ── AI Answer Cell ──────────────────────────────────── */

function buildAIAnswerCell(question: Question, providerId: string): HTMLElement {
  const config = resolveProviderConfig(providerId);
  const color = config?.color ?? '#718096';
  const name = config?.name ?? providerId;

  const cell = mk('div', {
    'data-provider': providerId,
    'data-question': question.id,
    style: j(
      `background:${color}10`, `border:1px solid ${color}20`,
      'border-radius:4px', 'padding:10px',
      'position:relative', 'min-height:60px',
      `animation:${ANIM}ScaleIn 0.3s ease-out`,
    ),
  });

  /* Name badge (top-right) */
  const badge = mk('div', {
    style: j(
      'position:absolute', 'top:6px', 'right:6px',
      `background:${color}20`,
      'padding:2px', 'border-radius:6px',
      'display:flex', 'align-items:center', 'justify-content:center',
    ),
  });
  badge.title = name;
  badge.appendChild(createProviderIcon(config, 14));
  cell.appendChild(badge);

  /* Content area */
  const contentArea = mk('div', {
    style: j('margin-top:22px', 'font-size:13px', 'line-height:1.5'),
  });

  const providerData = storedProviderResponses.get(providerId);

  if (!providerData || providerData === 'querying') {
    /* Loading state */
    contentArea.appendChild(buildLoadingDots(color));
  } else if (providerData.error) {
    /* Error state */
    const errorEl = mk('div', {
      style: j('color:#e53e3e', 'font-size:12px'),
    });
    errorEl.textContent = providerData.error;
    contentArea.appendChild(errorEl);
  } else {
    /* Answer state */
    const matched = providerData.answers.find(
      (a) => matchesQuestionKey(question, a.id),
    );
    if (matched) {
      const answerText = Array.isArray(matched.answer)
        ? matched.answer.join(', ')
        : matched.answer;
      const answerEl = mk('div', { style: 'color:#2d3748;' });
      answerEl.textContent = answerText;
      contentArea.appendChild(answerEl);
    } else {
      const noAnswer = mk('div', {
        style: j('color:#a0aec0', 'font-size:12px'),
      });
      noAnswer.textContent = '\u65E0\u56DE\u7B54';
      contentArea.appendChild(noAnswer);
    }
  }

  cell.appendChild(contentArea);
  return cell;
}

/* ── Final Answer Cell ───────────────────────────────── */

function buildFinalAnswerCell(
  question: Question,
  answer: FinalAnswer | null,
): HTMLElement {
  const cell = mk('div', {
    style: j('background:#f8f9fa', 'border-radius:4px', 'padding:10px'),
  });

  const editor = createEditor(question, answer);
  cell.appendChild(editor.render());
  return cell;
}

/* ═══════════════════════════════════════════════════════
   Loading Dots Animation
   ═══════════════════════════════════════════════════════ */

function buildLoadingDots(color: string): HTMLElement {
  const container = mk('div', {
    style: j(
      'display:flex', 'gap:4px', 'align-items:center',
      'justify-content:center', 'padding:8px 0',
    ),
  });

  for (let i = 0; i < 3; i++) {
    const dot = mk('div', {
      style: j(
        'width:8px', 'height:8px', 'border-radius:50%',
        `background:${color}`,
        `animation:${ANIM}Dot 1.4s infinite ease-in-out`,
        `animation-delay:${i * 0.16}s`,
      ),
    });
    container.appendChild(dot);
  }

  return container;
}

/* ═══════════════════════════════════════════════════════
   Raw Response Sub-Modal
   ═══════════════════════════════════════════════════════ */

function showRawResponseModal(): void {
  document.getElementById('ai-raw-response-modal')?.remove();

  const overlay = mk('div', {
    id: 'ai-raw-response-modal',
    style: j(
      'position:fixed', 'inset:0',
      'background:rgba(0,0,0,0.5)', 'z-index:10001',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:system-ui,-apple-system,sans-serif',
      `animation:${ANIM}FadeIn 0.3s ease-out`,
    ),
  });

  const box = mk('div', {
    style: j(
      'background:#fff', 'border-radius:12px',
      'width:80vw', 'max-width:900px', 'height:70vh',
      'display:flex', 'flex-direction:column',
      'box-shadow:0 20px 60px rgba(0,0,0,0.2)',
      'overflow:hidden',
    ),
  });

  /* Header with provider select */
  const header = mk('div', {
    style: j(
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:16px 20px', 'border-bottom:1px solid #e2e8f0',
      'background:#f7fafc', 'flex-shrink:0',
    ),
  });

  const label = mk('span', {
    style: j('font-weight:600', 'font-size:14px', 'color:#2d3748', 'white-space:nowrap'),
  });
  label.textContent = '\u9009\u62E9 AI \u67E5\u770B\u5B8C\u6574\u56DE\u7B54\uFF1A';

  const select = document.createElement('select');
  select.style.cssText = j(
    'flex:1', 'padding:6px 12px', 'border:1px solid #e2e8f0',
    'border-radius:6px', 'font-size:14px', 'outline:none',
    'font-family:system-ui,-apple-system,sans-serif',
  );

  for (const id of activeProviderIds) {
    const config = resolveProviderConfig(id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = config?.name ?? id;
    select.appendChild(opt);
  }

  const closeBtn = mk('button', {
    style: j(
      'width:32px', 'height:32px', 'border-radius:8px', 'border:none',
      'background:#edf2f7', 'color:#4a5568', 'font-size:18px',
      'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
      'transition:all 0.15s', 'flex-shrink:0',
      'font-family:system-ui,-apple-system,sans-serif',
      'line-height:1',
    ),
  });
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.background = '#fed7d7';
    closeBtn.style.color = '#e53e3e';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.background = '#edf2f7';
    closeBtn.style.color = '#4a5568';
  });
  closeBtn.addEventListener('click', () => overlay.remove());

  header.appendChild(label);
  header.appendChild(select);
  header.appendChild(closeBtn);

  /* Read-only textarea */
  const textarea = document.createElement('textarea');
  textarea.readOnly = true;
  textarea.style.cssText = j(
    'flex:1', 'margin:16px 20px', 'padding:12px',
    'border:1px solid #e2e8f0', 'border-radius:8px',
    'font-family:SFMono-Regular,Consolas,monospace',
    'font-size:13px', 'line-height:1.6', 'resize:none',
    'outline:none', 'color:#2d3748', 'background:#fafbfc',
  );

  const updateContent = (): void => {
    const selectedId = select.value;
    const response = storedProviderResponses.get(selectedId);
    if (!response || response === 'querying') {
      textarea.value = '\u8BE5 AI \u6B63\u5728\u67E5\u8BE2\u4E2D...';
    } else if (response.error) {
      textarea.value = `\u9519\u8BEF: ${response.error}`;
    } else {
      textarea.value = response.rawText;
    }
  };

  select.addEventListener('change', updateContent);
  updateContent();

  box.appendChild(header);
  box.appendChild(textarea);
  overlay.appendChild(box);

  /* Click overlay backdrop to close */
  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════════
   Handler Functions
   ═══════════════════════════════════════════════════════ */

function handleRemoveProvider(providerId: string): void {
  if (activeProviderIds.length <= 1) {
    showToast('\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2AAI');
    return;
  }

  activeProviderIds = activeProviderIds.filter((id) => id !== providerId);
  visibleProviderIds = visibleProviderIds.filter((id) => id !== providerId);
  if (visibleProviderIds.length === 0 && activeProviderIds.length > 0) {
    const fallbackProviderId = activeProviderIds[0];
    if (fallbackProviderId) {
      visibleProviderIds = [fallbackProviderId];
    }
  }
  storedProviderResponses.delete(providerId);

  /* Reassign weight if we removed the weight provider */
  if (currentWeightId === providerId) {
    currentWeightId = activeProviderIds[0] ?? null;
  }

  panelCallbacks?.onRemoveProvider(providerId);
  refreshFullGrid();
}

function handleWeightChange(providerId: string): void {
  currentWeightId = providerId;
  panelCallbacks?.onWeightChange(providerId);
  refreshAINamesRow();
}

function handleRetransmit(providerId: string): void {
  storedProviderResponses.set(providerId, 'querying');
  panelCallbacks?.onRetransmit(providerId);
  refreshFullGrid();
}

export function minimizePanel(): void {
  if (!currentPanel || isMinimized) return;
  isMinimized = true;
  isCollapsed = true;

  currentPanel.style.transition = 'all 0.3s ease';
  currentPanel.style.width = '400px';
  currentPanel.style.maxWidth = '400px';
  currentPanel.style.left = 'auto';
  currentPanel.style.right = '20px';
  currentPanel.style.top = '50%';
  currentPanel.style.transform = 'translateY(-50%)';

  const toolbar = currentPanel.querySelector<HTMLElement>('[data-role="toolbar"]');
  if (toolbar) {
    for (const child of Array.from(toolbar.children) as HTMLElement[]) {
      if (child.id === 'ai-panel-collapse-btn') {
        child.textContent = '\u5C55\u5F00\u9762\u677F';
        continue;
      }
      if (child.tagName === 'BUTTON' && child.textContent === '\u00D7') continue;
      child.style.display = 'none';
    }
  }

  refreshFullGrid();
}

export function expandPanel(): void {
  if (!currentPanel || !isMinimized) return;
  isMinimized = false;
  isCollapsed = false;

  currentPanel.style.transition = 'all 0.3s ease';
  currentPanel.style.width = '90vw';
  currentPanel.style.maxWidth = '90vw';
  currentPanel.style.left = '50%';
  currentPanel.style.right = '';
  currentPanel.style.top = '50%';
  currentPanel.style.transform = 'translate(-50%,-50%)';

  const toolbar = currentPanel.querySelector<HTMLElement>('[data-role="toolbar"]');
  if (toolbar) {
    for (const child of Array.from(toolbar.children) as HTMLElement[]) {
      child.style.display = '';
    }
    const collapseBtn = toolbar.querySelector<HTMLElement>('#ai-panel-collapse-btn');
    if (collapseBtn) {
      collapseBtn.textContent = '\u6536\u8D77AI\u56DE\u7B54';
    }
  }

  refreshFullGrid();
}

function refreshFullGrid(): void {
  if (!currentPanel || !panelState) return;

  refreshAINamesRow();

  const body = currentPanel.querySelector<HTMLElement>('.ai-panel-body');
  if (!body) return;
  body.innerHTML = '';
  renderQuestionRows(body);
}

/* ── Toast ───────────────────────────────────────────── */

function showToast(message: string): void {
  document.getElementById('ai-panel-toast')?.remove();

  const toast = mk('div', {
    id: 'ai-panel-toast',
    style: j(
      'position:fixed', 'top:20px', 'left:50%',
      'transform:translateX(-50%)',
      'background:#2d3748', 'color:#fff',
      'padding:8px 20px', 'border-radius:8px',
      'font-size:13px', 'z-index:10003',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      `animation:${ANIM}FadeIn 0.2s ease-out`,
      'font-family:system-ui,-apple-system,sans-serif',
    ),
  });
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/* ═══════════════════════════════════════════════════════
   DOM Utilities (matching ai-selector.ts patterns)
   ═══════════════════════════════════════════════════════ */

/** Join CSS declarations with semicolons */
function j(...parts: string[]): string {
  return parts.join(';');
}

/** Create an element with optional attributes */
function mk(tag: string, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style') e.style.cssText = v;
      else if (k === 'id') e.id = v;
      else if (k === 'className') e.className = v;
      else e.setAttribute(k, v);
    }
  }
  return e;
}

/** Create a styled button */
function mkBtn(
  text: string,
  bg: string,
  fg: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.style.cssText = j(
    `padding:6px 14px`, `background:${bg}`, `color:${fg}`,
    'border:none', 'border-radius:6px', 'cursor:pointer',
    'font-size:13px', 'font-weight:500', 'transition:all 0.15s',
    'font-family:system-ui,-apple-system,sans-serif',
    'white-space:nowrap',
  );
  b.textContent = text;
  b.addEventListener('mouseenter', () => {
    b.style.opacity = '0.85';
    b.style.transform = 'translateY(-1px)';
  });
  b.addEventListener('mouseleave', () => {
    b.style.opacity = '1';
    b.style.transform = 'translateY(0)';
  });
  b.addEventListener('click', onClick);
  return b;
}

/* ═══════════════════════════════════════════════════════
   Injected Styles (keyframes + editor CSS)
   ═══════════════════════════════════════════════════════ */

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const s = document.createElement('style');
  s.textContent = `
    @keyframes ${ANIM}FadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes ${ANIM}SlideIn {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes ${ANIM}ScaleIn {
      from { opacity: 0; transform: scale(0.95); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes ${ANIM}Dot {
      0%, 80%, 100% { transform: scale(0); }
      40%           { transform: scale(1); }
    }
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
  document.head.appendChild(s);
}
