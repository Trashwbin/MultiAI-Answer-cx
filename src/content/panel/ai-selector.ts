import { AI_PROVIDERS } from '../../config/ai-config';
import type { AuthStatus } from '../../types';

/* ── Constants & Types ──────────────────────────────── */

const MODAL_ID = 'ai-selector-modal';
const ANIM = 'aiSel';

type SelectCallback = (result: {
  providerIds: string[];
  weightProviderId: string | null;
  batchMode: boolean;
}) => void;

interface CardState {
  config: (typeof AI_PROVIDERS)[number];
  auth: AuthStatus | 'checking';
  selected: boolean;
}

/* ── Module state ────────────────────────────────────── */

let cards: CardState[] = [];
let currentWeightId: string | null = null;
let visibilityHandler: (() => void) | null = null;
let stylesInjected = false;
let batchMode = true;

/* ── Public API ──────────────────────────────────────── */

export function showAISelector(onConfirm: SelectCallback, onCancel?: () => void): void {
  hideAISelector();

  cards = AI_PROVIDERS.map((config) => ({
    config,
    auth: 'checking' as const,
    selected: false,
  }));

  const defaultWeight = AI_PROVIDERS.find((p) => p.weight > 1 && p.enabled);
  currentWeightId = defaultWeight?.id ?? AI_PROVIDERS.find((p) => p.enabled)?.id ?? null;

  injectStyles();
  const modal = buildModal(onConfirm, onCancel);
  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal.style.opacity = '1';
  });

  void fetchAuthStatuses(modal);

  visibilityHandler = () => {
    if (document.visibilityState === 'visible' && document.getElementById(MODAL_ID)) {
      void fetchAuthStatuses(modal);
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export function hideAISelector(): void {
  document.getElementById(MODAL_ID)?.remove();
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

/* ── Animated close (user-initiated) ─────────────────── */

function animateClose(then?: () => void): void {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) {
    then?.();
    return;
  }
  modal.style.opacity = '0';
  const box = modal.querySelector<HTMLElement>('[data-role="box"]');
  if (box) box.style.animation = `${ANIM}Out 0.25s ease forwards`;
  setTimeout(() => {
    hideAISelector();
    then?.();
  }, 260);
}

/* ── Auth check (V2 pattern) ─────────────────────────── */

async function fetchAuthStatuses(modal: HTMLElement): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'AUTH_STATUS_ALL' });
    if (res?.success && res.statuses) {
      const statuses = res.statuses as Record<string, AuthStatus>;
      for (const card of cards) {
        if (card.config.enabled) {
          card.auth = statuses[card.config.id] ?? 'error';
          card.selected = card.auth === 'authenticated';
        } else {
          card.auth = 'unauthenticated';
          card.selected = false;
        }
      }
    } else {
      for (const card of cards) card.auth = 'error';
    }
  } catch {
    for (const card of cards) card.auth = 'error';
  }

  // Ensure weight provider is still valid (authenticated)
  const wc = cards.find((c) => c.config.id === currentWeightId);
  if (!wc || !isSelectable(wc)) {
    const first = cards.find((c) => isSelectable(c));
    currentWeightId = first?.config.id ?? null;
  }

  refreshGrid(modal);
  refreshWeightSelect(modal);
  refreshFooter(modal);
}

/* ── Modal construction ──────────────────────────────── */

function buildModal(onConfirm: SelectCallback, onCancel?: () => void): HTMLElement {
  const overlay = mk('div', {
    id: MODAL_ID,
    style: j(
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.45)',
      'z-index:100000', 'opacity:0', 'transition:opacity 0.3s ease',
      'backdrop-filter:blur(4px)', '-webkit-backdrop-filter:blur(4px)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:system-ui,-apple-system,sans-serif',
    ),
  });

  const box = mk('div', {
    'data-role': 'box',
    style: j(
      'background:#fff', 'border-radius:16px', 'width:800px', 'max-width:92vw',
      'max-height:85vh', 'display:flex', 'flex-direction:column',
      'box-shadow:0 20px 60px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.05)',
      'overflow:hidden', `animation:${ANIM}In 0.3s ease`,
    ),
  });

  box.appendChild(buildHeader(onCancel));
  box.appendChild(buildHint());
  box.appendChild(buildBody(overlay));
  box.appendChild(buildFooter(overlay, onConfirm, onCancel));

  overlay.appendChild(box);
  return overlay;
}

/* ── Header ──────────────────────────────────────────── */

function buildHeader(onCancel?: () => void): HTMLElement {
  const header = mk('div', {
    style: j(
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:20px 24px', 'border-bottom:1px solid #e2e8f0',
      'background:linear-gradient(135deg,#f7fafc 0%,#edf2f7 100%)',
      'flex-shrink:0',
    ),
  });

  const left = mk('div', { style: 'display:flex;align-items:center;gap:10px;' });

  const icon = mk('div', {
    style: j(
      'width:34px', 'height:34px', 'border-radius:10px',
      'background:linear-gradient(135deg,#667eea,#764ba2)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:16px', 'color:#fff', 'flex-shrink:0',
    ),
  });
  icon.textContent = '\u26A1';

  const textWrap = mk('div');
  const t1 = mk('div', { style: 'font-size:18px;font-weight:700;color:#1a202c;letter-spacing:-0.3px;' });
  t1.textContent = 'AI \u914D\u7F6E';
  const t2 = mk('div', { style: 'font-size:12px;color:#718096;margin-top:2px;' });
  t2.textContent = '\u9009\u62E9 AI \u63D0\u4F9B\u5546\u5E76\u914D\u7F6E\u6743\u91CD';
  textWrap.appendChild(t1);
  textWrap.appendChild(t2);

  left.appendChild(icon);
  left.appendChild(textWrap);
  header.appendChild(left);

  const close = mk('button', {
    style: j(
      'width:32px', 'height:32px', 'border-radius:8px', 'border:none',
      'background:#edf2f7', 'color:#4a5568', 'font-size:18px',
      'cursor:pointer', 'display:flex', 'align-items:center', 'justify-content:center',
      'transition:all 0.15s', 'font-family:system-ui,-apple-system,sans-serif',
      'line-height:1',
    ),
  });
  close.textContent = '\u2715';
  close.addEventListener('mouseenter', () => {
    close.style.background = '#fed7d7';
    close.style.color = '#e53e3e';
  });
  close.addEventListener('mouseleave', () => {
    close.style.background = '#edf2f7';
    close.style.color = '#4a5568';
  });
  close.addEventListener('click', () => animateClose(onCancel));
  header.appendChild(close);

  return header;
}

/* ── Hint bar ────────────────────────────────────────── */

function buildHint(): HTMLElement {
  const hint = mk('div', {
    style: j(
      'padding:10px 24px', 'color:#718096', 'font-size:13px', 'line-height:1.5',
      'background:#fafbfc', 'border-bottom:1px solid #f0f0f0',
    ),
  });
  hint.textContent =
    '\uD83D\uDCA1 \u70B9\u51FB\u300C\u767B\u5F55\u300D\u6253\u5F00 AI \u7F51\u7AD9\u5B8C\u6210\u767B\u5F55\uFF0C\u767B\u5F55\u540E\u8FD4\u56DE\u6B64\u9875\u81EA\u52A8\u5237\u65B0\u72B6\u6001';
  return hint;
}

/* ── Body (scrollable): weight bar + card grid ───────── */

function buildBody(modal: HTMLElement): HTMLElement {
  const body = mk('div', {
    style: j('flex:1', 'overflow-y:auto', 'padding:20px 24px'),
  });

  /* ── Weight selector dark bar ── */
  const bar = mk('div', {
    style: j(
      'display:flex', 'align-items:center', 'gap:12px',
      'padding:12px 16px', 'background:#2d3748', 'border-radius:10px',
      'margin-bottom:16px',
    ),
  });

  const wIcon = mk('div', {
    style: j(
      'width:28px', 'height:28px', 'border-radius:7px',
      'background:rgba(255,255,255,0.12)', 'display:flex',
      'align-items:center', 'justify-content:center',
      'font-size:14px', 'flex-shrink:0',
    ),
  });
  wIcon.textContent = '\u2696';

  const wLabel = mk('div', {
    style: 'color:#e2e8f0;font-size:14px;font-weight:600;white-space:nowrap;',
  });
  wLabel.textContent = '\u6743\u91CD AI\uFF1A';

  const wSelect = document.createElement('select');
  wSelect.id = 'ai-sel-weight';
  wSelect.style.cssText = j(
    'flex:1', 'padding:8px 32px 8px 12px',
    'border:1px solid rgba(255,255,255,0.2)', 'border-radius:6px',
    'color:#fff', 'font-size:14px', 'cursor:pointer', 'outline:none',
    'font-family:system-ui,-apple-system,sans-serif',
  );
  wSelect.addEventListener('change', () => {
    currentWeightId = wSelect.value || null;
    refreshGrid(modal);
  });

  bar.appendChild(wIcon);
  bar.appendChild(wLabel);
  bar.appendChild(wSelect);
  body.appendChild(bar);

  /* ── 3-column card grid ── */
  const grid = mk('div', {
    id: 'ai-sel-grid',
    style: j('display:grid', 'grid-template-columns:repeat(3,1fr)', 'gap:12px'),
  });
  body.appendChild(grid);

  return body;
}

/* ── Footer ──────────────────────────────────────────── */

function buildFooter(
  modal: HTMLElement,
  onConfirm: SelectCallback,
  onCancel?: () => void,
): HTMLElement {
  const footer = mk('div', {
    id: 'ai-sel-footer',
    style: j(
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:16px 24px', 'border-top:1px solid #e2e8f0',
      'background:#f7fafc', 'flex-shrink:0', 'gap:12px',
    ),
  });

  const leftGroup = mk('div', {
    style: 'display:flex;flex-direction:column;gap:6px;min-width:0;',
  });

  const count = mk('span', {
    id: 'ai-sel-count',
    style: 'color:#718096;font-size:14px;font-weight:500;white-space:nowrap;',
  });
  count.textContent = '\u68C0\u67E5\u8BA4\u8BC1\u72B6\u6001\u4E2D...';
  leftGroup.appendChild(count);

  /* ── Batch mode toggle ── */
  const toggleRow = mk('div', {
    style: j('display:flex', 'align-items:center', 'gap:8px'),
  });

  const toggleLabel = mk('span', {
    style: 'color:#718096;font-size:12px;white-space:nowrap;',
  });
  toggleLabel.textContent = '\u53D1\u9001\u6A21\u5F0F\uFF1A';

  const toggleTrack = mk('div', {
    id: 'ai-sel-batch-toggle',
    style: j(
      'width:36px', 'height:20px', 'border-radius:10px',
      'background:#4caf50', 'position:relative', 'cursor:pointer',
      'transition:background 0.2s', 'flex-shrink:0',
    ),
  });
  const toggleThumb = mk('div', {
    style: j(
      'width:16px', 'height:16px', 'border-radius:50%',
      'background:#fff', 'position:absolute', 'top:2px', 'left:18px',
      'transition:left 0.2s', 'box-shadow:0 1px 3px rgba(0,0,0,0.2)',
    ),
  });
  toggleTrack.appendChild(toggleThumb);

  const toggleText = mk('span', {
    id: 'ai-sel-batch-text',
    style: 'color:#4a5568;font-size:12px;font-weight:500;white-space:nowrap;',
  });
  toggleText.textContent = '\u6279\u91CF\u53D1\u9001';

  function updateToggleUI(): void {
    toggleTrack.style.background = batchMode ? '#4caf50' : '#cbd5e0';
    toggleThumb.style.left = batchMode ? '18px' : '2px';
    toggleText.textContent = batchMode ? '\u6279\u91CF\u53D1\u9001' : '\u9010\u9898\u53D1\u9001';
  }

  toggleTrack.addEventListener('click', () => {
    batchMode = !batchMode;
    updateToggleUI();
  });

  toggleRow.appendChild(toggleLabel);
  toggleRow.appendChild(toggleTrack);
  toggleRow.appendChild(toggleText);
  leftGroup.appendChild(toggleRow);

  footer.appendChild(leftGroup);

  const actions = mk('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });

  actions.appendChild(
    mkBtn('\u5237\u65B0\u72B6\u6001', '#e8f5e9', '#2e7d32', () => {
      for (const c of cards) c.auth = 'checking';
      refreshGrid(modal);
      refreshWeightSelect(modal);
      refreshFooter(modal);
      void fetchAuthStatuses(modal);
    }),
  );

  actions.appendChild(
    mkBtn('\u5168\u9009\u53EF\u7528', '#edf2f7', '#4a5568', () => {
      for (const c of cards) c.selected = isSelectable(c);
      refreshGrid(modal);
      refreshFooter(modal);
    }),
  );

  actions.appendChild(
    mkBtn('\u53D6\u6D88', '#edf2f7', '#4a5568', () => animateClose(onCancel)),
  );

  const send = mkBtn('\u53D1\u9001\u5230 AI', '#4caf50', '#fff', () => {
    const ids = cards.filter((c) => c.selected).map((c) => c.config.id);
    if (ids.length === 0) return;
    animateClose(() => onConfirm({ providerIds: ids, weightProviderId: currentWeightId, batchMode }));
  });
  send.id = 'ai-sel-send';
  send.style.fontWeight = '600';
  actions.appendChild(send);

  footer.appendChild(actions);
  return footer;
}

/* ── Helpers ──────────────────────────────────────────── */

function isSelectable(state: CardState): boolean {
  return state.config.enabled && state.auth === 'authenticated';
}

/* ── Grid rendering ──────────────────────────────────── */

function refreshGrid(modal: HTMLElement): void {
  const grid = modal.querySelector('#ai-sel-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const card of cards) {
    grid.appendChild(buildCard(card, modal));
  }
}

function buildCard(state: CardState, modal: HTMLElement): HTMLElement {
  const ok = isSelectable(state);
  const isWeight = state.config.id === currentWeightId;
  const clr = state.config.color;

  const card = mk('div', {
    className: ok ? 'ai-sel-card ai-sel-active' : 'ai-sel-card',
    style: cardCSS(state),
  });

  /* Weight AI badge (absolute top-right) */
  if (isWeight && ok) {
    const badge = mk('div', {
      style: j(
        'position:absolute', 'top:8px', 'right:8px',
        'padding:2px 8px', `background:${clr}`, 'color:#fff',
        'font-size:10px', 'font-weight:600', 'border-radius:4px',
        'letter-spacing:0.3px', 'line-height:1.5',
      ),
    });
    badge.textContent = '\u6743\u91CD AI';
    card.appendChild(badge);
  }

  /* Layout row: icon + info */
  const row = mk('div', { style: 'display:flex;align-items:flex-start;gap:12px;' });

  /* Colored icon (first char, rounded square, tinted bg) */
  const icon = mk('div', {
    style: j(
      'width:40px', 'height:40px', 'border-radius:10px',
      `background:${clr}18`, 'display:flex', 'align-items:center',
      'justify-content:center', 'font-size:18px', 'font-weight:700',
      `color:${clr}`, 'flex-shrink:0',
    ),
  });
  icon.textContent = state.config.name.charAt(0);

  /* Info column */
  const info = mk('div', { style: 'flex:1;min-width:0;' });

  /* Name row + checkbox */
  const nameRow = mk('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;',
  });

  const name = mk('div', {
    style: j(
      'font-weight:600', 'font-size:14px',
      `color:${ok ? '#1a202c' : '#a0aec0'}`,
      'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
    ),
  });
  name.textContent = state.config.name;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = state.selected;
  cb.disabled = !ok;
  cb.style.cssText = j(
    'width:18px', 'height:18px', 'flex-shrink:0',
    `cursor:${ok ? 'pointer' : 'not-allowed'}`,
    `opacity:${ok ? '1' : '0.3'}`,
    `accent-color:${clr}`,
  );
  cb.addEventListener('change', () => {
    state.selected = cb.checked;
    card.style.cssText = cardCSS(state);
    refreshFooter(modal);
  });

  nameRow.appendChild(name);
  nameRow.appendChild(cb);
  info.appendChild(nameRow);

  /* Status row: badge + optional login button */
  const statusRow = mk('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' });

  const statusBadge = mk('span', { style: badgeCSS(state) });
  statusBadge.textContent = labelText(state);
  if (state.auth === 'checking') statusBadge.className = 'ai-sel-pulse';
  statusRow.appendChild(statusBadge);

  /* Login button for unauthenticated / expired / error */
  const needsLogin =
    state.config.enabled && state.auth !== 'authenticated' && state.auth !== 'checking';
  if (needsLogin) {
    const loginBtn = mk('button', {
      style: j(
        'padding:2px 10px', 'font-size:11px', `background:${clr}`,
        'color:#fff', 'border:none', 'border-radius:4px', 'cursor:pointer',
        'transition:all 0.15s', 'font-weight:500',
        'font-family:system-ui,-apple-system,sans-serif',
      ),
    });
    loginBtn.textContent = '\u767B\u5F55';
    loginBtn.addEventListener('mouseenter', () => {
      loginBtn.style.opacity = '0.8';
    });
    loginBtn.addEventListener('mouseleave', () => {
      loginBtn.style.opacity = '1';
    });
    loginBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'AUTH_LOGIN', providerId: state.config.id });
      statusBadge.textContent = '\u767B\u5F55\u4E2D...';
      statusBadge.style.cssText =
        'display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500;color:#718096;background:#edf2f7;';
      statusBadge.className = 'ai-sel-pulse';
      loginBtn.remove();
    });
    statusRow.appendChild(loginBtn);
  }

  info.appendChild(statusRow);

  row.appendChild(icon);
  row.appendChild(info);
  card.appendChild(row);

  /* Click card to toggle checkbox */
  card.addEventListener('click', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'BUTTON') return;
    if (!ok) return;
    cb.checked = !cb.checked;
    state.selected = cb.checked;
    card.style.cssText = cardCSS(state);
    refreshFooter(modal);
  });

  return card;
}

/* ── Weight selector refresh ─────────────────────────── */

function refreshWeightSelect(modal: HTMLElement): void {
  const sel = modal.querySelector<HTMLSelectElement>('#ai-sel-weight');
  if (!sel) return;

  sel.innerHTML = '';

  const def = document.createElement('option');
  def.value = '';
  def.textContent = '-- \u9009\u62E9\u6743\u91CD AI --';
  sel.appendChild(def);

  for (const c of cards) {
    if (!isSelectable(c)) continue;
    const opt = document.createElement('option');
    opt.value = c.config.id;
    opt.textContent = c.config.name;
    if (c.config.id === currentWeightId) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.value = currentWeightId ?? '';
}

/* ── Footer refresh ──────────────────────────────────── */

function refreshFooter(modal: HTMLElement): void {
  const selected = cards.filter((c) => c.selected).length;
  const available = cards.filter((c) => isSelectable(c)).length;
  const checking = cards.some((c) => c.auth === 'checking');

  const countEl = modal.querySelector('#ai-sel-count');
  if (countEl) {
    countEl.textContent = checking
      ? '\u68C0\u67E5\u8BA4\u8BC1\u72B6\u6001\u4E2D...'
      : `\u5DF2\u9009\u62E9 ${selected} / ${available} \u4E2A\u53EF\u7528 AI`;
  }

  const sendBtn = modal.querySelector<HTMLButtonElement>('#ai-sel-send');
  if (sendBtn) {
    sendBtn.disabled = selected === 0;
    sendBtn.style.opacity = selected === 0 ? '0.5' : '1';
    sendBtn.style.cursor = selected === 0 ? 'not-allowed' : 'pointer';
  }
}

/* ── Style helpers ───────────────────────────────────── */

function labelText(s: CardState): string {
  if (!s.config.enabled) return '\u672A\u542F\u7528';
  switch (s.auth) {
    case 'checking':
      return '\u68C0\u67E5\u4E2D...';
    case 'authenticated':
      return '\u5DF2\u8FDE\u63A5';
    case 'unauthenticated':
      return '\u672A\u767B\u5F55';
    case 'expired':
      return '\u5DF2\u8FC7\u671F';
    case 'error':
      return '\u72B6\u6001\u5F02\u5E38';
  }
}

function badgeCSS(s: CardState): string {
  const b = 'display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;font-weight:500;';
  if (!s.config.enabled) return b + 'color:#a0aec0;background:#f0f0f0;';
  switch (s.auth) {
    case 'checking':
      return b + 'color:#718096;background:#edf2f7;';
    case 'authenticated':
      return b + 'color:#38a169;background:#f0fff4;';
    case 'unauthenticated':
      return b + 'color:#e53e3e;background:#fff5f5;';
    case 'expired':
      return b + 'color:#d69e2e;background:#fffff0;';
    case 'error':
      return b + 'color:#e53e3e;background:#fff5f5;';
  }
}

function cardCSS(s: CardState): string {
  const ok = isSelectable(s);
  const clr = s.config.color;
  const border = s.selected ? clr : ok ? '#e2e8f0' : '#f0f0f0';
  const bg = s.selected ? `${clr}08` : ok ? '#fff' : '#fafafa';
  return j(
    'position:relative', 'padding:14px', `border:2px solid ${border}`,
    'border-radius:12px', `background:${bg}`,
    `opacity:${ok ? '1' : '0.6'}`,
    `cursor:${ok ? 'pointer' : 'default'}`,
    'transition:all 0.2s ease',
  );
}

/* ── DOM utilities ───────────────────────────────────── */

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
function mkBtn(text: string, bg: string, fg: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.style.cssText = j(
    `padding:8px 16px`, `background:${bg}`, `color:${fg}`,
    'border:none', 'border-radius:8px', 'cursor:pointer',
    'font-size:13px', 'font-weight:500', 'transition:all 0.15s',
    'font-family:system-ui,-apple-system,sans-serif',
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

/* ── Injected styles (keyframes + hover rules) ───────── */

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;

  const s = document.createElement('style');
  s.textContent = `
    @keyframes ${ANIM}In {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes ${ANIM}Out {
      from { opacity: 1; transform: scale(1) translateY(0); }
      to   { opacity: 0; transform: scale(0.95) translateY(10px); }
    }
    @keyframes ${ANIM}Pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }
    #${MODAL_ID} .ai-sel-active:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    }
    #${MODAL_ID} .ai-sel-pulse {
      animation: ${ANIM}Pulse 1.5s ease-in-out infinite;
    }
    #${MODAL_ID} ::-webkit-scrollbar { width: 6px; }
    #${MODAL_ID} ::-webkit-scrollbar-track { background: transparent; }
    #${MODAL_ID} ::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 3px; }
    #${MODAL_ID} ::-webkit-scrollbar-thumb:hover { background: #a0aec0; }
    #ai-sel-weight {
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255,255,255,0.1) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center;
      transition: all 0.15s;
    }
    #ai-sel-weight:hover {
      background-color: rgba(255,255,255,0.18);
    }
    #ai-sel-weight:focus {
      border-color: rgba(255,255,255,0.35);
    }
    #ai-sel-weight option {
      background: #2d3748;
      color: #fff;
    }
  `;
  document.head.appendChild(s);
}
