import { AI_PROVIDERS } from '../../config/ai-config';
import type { AuthStatus } from '../../types';

const MODAL_ID = 'ai-selector-modal';

type SelectCallback = (providerIds: string[]) => void;

interface CardState {
  config: (typeof AI_PROVIDERS)[number];
  auth: AuthStatus | 'checking';
  selected: boolean;
}

let cards: CardState[] = [];
let visibilityHandler: (() => void) | null = null;

export function showAISelector(onConfirm: SelectCallback, onCancel?: () => void): void {
  hideAISelector();

  cards = AI_PROVIDERS.map((config) => ({
    config,
    auth: 'checking' as const,
    selected: false,
  }));

  const modal = buildModal(onConfirm, onCancel);
  injectStyles();
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

/* ── Auth check ──────────────────────────────────────── */

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
      for (const card of cards) {
        card.auth = 'error';
      }
    }
  } catch {
    for (const card of cards) {
      card.auth = 'error';
    }
  }
  refreshGrid(modal);
  refreshFooter(modal);
}

/* ── Modal structure ─────────────────────────────────── */

function buildModal(onConfirm: SelectCallback, onCancel?: () => void): HTMLElement {
  const modal = mkEl('div', { id: MODAL_ID, style: S.overlay });

  const box = mkEl('div', { style: S.container });

  /* header */
  const header = mkEl('div', { style: S.header });
  const title = mkEl('span', { style: 'font-size:18px;font-weight:600;color:#2d3748;' });
  title.textContent = '\u9009\u62E9 AI \u63D0\u4F9B\u5546';
  header.appendChild(title);

  const closeBtn = mkBtn('\u00D7', '#f0f0f0', '#666', () => {
    hideAISelector();
    onCancel?.();
  });
  closeBtn.style.cssText += ';font-size:20px;padding:2px 10px;line-height:1;';
  header.appendChild(closeBtn);
  box.appendChild(header);

  /* hint */
  const hint = mkEl('div', { style: 'padding:10px 20px 0;color:#718096;font-size:13px;' });
  hint.textContent = '\u70B9\u51FB\u300C\u767B\u5F55\u300D\u6253\u5F00 AI \u7F51\u7AD9\u5B8C\u6210\u767B\u5F55\uFF0C\u767B\u5F55\u540E\u8FD4\u56DE\u6B64\u9875\u81EA\u52A8\u5237\u65B0\u72B6\u6001';
  box.appendChild(hint);

  /* grid */
  const grid = mkEl('div', { id: 'ai-sel-grid', style: S.grid });
  box.appendChild(grid);

  /* footer */
  const footer = mkEl('div', { id: 'ai-sel-footer', style: S.footer });

  const countText = mkEl('span', { id: 'ai-sel-count', style: 'color:#718096;font-size:14px;' });
  countText.textContent = '\u68C0\u67E5\u8BA4\u8BC1\u72B6\u6001\u4E2D...';
  footer.appendChild(countText);

  const actions = mkEl('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });

  actions.appendChild(
    mkBtn('\u5237\u65B0\u72B6\u6001', '#e8f5e9', '#2e7d32', () => {
      for (const c of cards) {
        c.auth = 'checking';
      }
      refreshGrid(modal);
      refreshFooter(modal);
      void fetchAuthStatuses(modal);
    }),
  );

  actions.appendChild(
    mkBtn('\u5168\u9009\u53EF\u7528', '#edf2f7', '#4a5568', () => {
      for (const c of cards) {
        c.selected = isSelectable(c);
      }
      refreshGrid(modal);
      refreshFooter(modal);
    }),
  );

  actions.appendChild(
    mkBtn('\u53D6\u6D88', '#edf2f7', '#4a5568', () => {
      hideAISelector();
      onCancel?.();
    }),
  );

  const sendBtn = mkBtn('\u53D1\u9001\u5230 AI', '#4caf50', '#fff', () => {
    const ids = cards.filter((c) => c.selected).map((c) => c.config.id);
    if (ids.length === 0) return;
    hideAISelector();
    onConfirm(ids);
  });
  sendBtn.id = 'ai-sel-send';
  actions.appendChild(sendBtn);

  footer.appendChild(actions);
  box.appendChild(footer);
  modal.appendChild(box);

  return modal;
}

/* ── Grid rendering ──────────────────────────────────── */

function isSelectable(state: CardState): boolean {
  return state.config.enabled && state.auth === 'authenticated';
}

function refreshGrid(modal: HTMLElement): void {
  const grid = modal.querySelector('#ai-sel-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const card of cards) {
    grid.appendChild(buildCard(card, modal));
  }
}

function buildCard(state: CardState, modal: HTMLElement): HTMLElement {
  const canSelect = isSelectable(state);
  const card = mkEl('div', { className: 'ai-sel-card', style: cardStyle(state) });

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = state.selected;
  cb.disabled = !canSelect;
  cb.style.cssText = [
    'width:16px', 'height:16px', 'flex-shrink:0',
    `cursor:${canSelect ? 'pointer' : 'not-allowed'}`,
    `opacity:${canSelect ? '1' : '0.35'}`,
  ].join(';');
  cb.addEventListener('change', () => {
    state.selected = cb.checked;
    card.style.cssText = cardStyle(state);
    refreshFooter(modal);
  });

  const info = mkEl('div', { style: 'flex:1;min-width:0;' });

  const nameRow = mkEl('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px;' });
  const dot = mkEl('span', {
    style: `width:8px;height:8px;border-radius:50%;background:${state.config.color};flex-shrink:0;display:inline-block;`,
  });
  const name = mkEl('span', {
    style: `font-weight:500;font-size:14px;color:${canSelect ? '#2d3748' : '#a0aec0'};`,
  });
  name.textContent = state.config.name;
  nameRow.appendChild(dot);
  nameRow.appendChild(name);
  info.appendChild(nameRow);

  const statusRow = mkEl('div', { style: 'display:flex;align-items:center;gap:6px;' });
  const badge = mkEl('span', { style: statusBadgeStyle(state) });
  badge.textContent = statusLabel(state);
  statusRow.appendChild(badge);

  const needsLogin = state.config.enabled && state.auth !== 'authenticated' && state.auth !== 'checking';
  if (needsLogin) {
    const loginBtn = mkEl('button', {
      style: `padding:2px 10px;font-size:11px;background:${state.config.color};color:#fff;border:none;border-radius:4px;cursor:pointer;transition:opacity 0.2s;`,
    });
    loginBtn.textContent = '\u767B\u5F55';
    loginBtn.addEventListener('mouseenter', () => { loginBtn.style.opacity = '0.8'; });
    loginBtn.addEventListener('mouseleave', () => { loginBtn.style.opacity = '1'; });
    loginBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'AUTH_LOGIN', providerId: state.config.id });
      badge.textContent = '\u767B\u5F55\u4E2D...';
      badge.style.cssText = 'display:inline-block;font-size:12px;padding:1px 6px;border-radius:4px;color:#718096;background:#edf2f7;';
      loginBtn.remove();
    });
    statusRow.appendChild(loginBtn);
  }

  info.appendChild(statusRow);

  card.appendChild(cb);
  card.appendChild(info);

  card.addEventListener('click', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'BUTTON') return;
    if (!canSelect) return;
    cb.checked = !cb.checked;
    state.selected = cb.checked;
    card.style.cssText = cardStyle(state);
    refreshFooter(modal);
  });

  return card;
}

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

function statusLabel(state: CardState): string {
  if (!state.config.enabled) return '\u672A\u542F\u7528';
  switch (state.auth) {
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

function statusBadgeStyle(state: CardState): string {
  const base = 'display:inline-block;font-size:12px;padding:1px 6px;border-radius:4px;';
  if (!state.config.enabled) return base + 'color:#a0aec0;background:#f0f0f0;';
  switch (state.auth) {
    case 'checking':
      return base + 'color:#718096;background:#edf2f7;';
    case 'authenticated':
      return base + 'color:#38a169;background:#f0fff4;';
    case 'unauthenticated':
      return base + 'color:#e53e3e;background:#fff5f5;';
    case 'expired':
      return base + 'color:#d69e2e;background:#fffff0;';
    case 'error':
      return base + 'color:#e53e3e;background:#fff5f5;';
  }
}

function cardStyle(state: CardState): string {
  const canSelect = isSelectable(state);
  const border = state.selected
    ? state.config.color
    : canSelect
      ? '#e2e8f0'
      : '#f0f0f0';
  const bg = state.selected
    ? `${state.config.color}0a`
    : canSelect
      ? '#fff'
      : '#fafafa';
  return [
    'display:flex', 'align-items:flex-start', 'gap:10px',
    'padding:12px', `border:2px solid ${border}`,
    'border-radius:8px', `background:${bg}`,
    `cursor:${canSelect ? 'pointer' : 'default'}`,
    'transition:border-color 0.15s,background 0.15s',
  ].join(';');
}

/* ── DOM shortcuts ───────────────────────────────────── */

function mkEl(
  tag: string,
  attrs?: { style?: string; id?: string; className?: string },
): HTMLElement {
  const e = document.createElement(tag);
  if (attrs?.id) e.id = attrs.id;
  if (attrs?.className) e.className = attrs.className;
  if (attrs?.style) e.style.cssText = attrs.style;
  return e;
}

function mkBtn(text: string, bg: string, color: string, onClick: () => void): HTMLElement {
  const b = mkEl('button', {
    style: `padding:8px 16px;background:${bg};color:${color};border:none;border-radius:6px;cursor:pointer;font-size:14px;transition:opacity 0.2s;`,
  });
  b.textContent = text;
  b.addEventListener('mouseenter', () => {
    b.style.opacity = '0.85';
  });
  b.addEventListener('mouseleave', () => {
    b.style.opacity = '1';
  });
  b.addEventListener('click', onClick);
  return b;
}

/* ── Static styles ───────────────────────────────────── */

const S = {
  overlay: [
    'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
    'z-index:100000', 'opacity:0', 'transition:opacity 0.25s',
    'backdrop-filter:blur(2px)', 'display:flex',
    'align-items:center', 'justify-content:center',
  ].join(';'),
  container: [
    'background:#fff', 'border-radius:12px', 'width:560px',
    'max-width:90vw', 'max-height:80vh', 'display:flex',
    'flex-direction:column', 'box-shadow:0 8px 32px rgba(0,0,0,0.18)',
    'overflow:hidden',
  ].join(';'),
  header: [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:14px 20px', 'border-bottom:1px solid #e2e8f0',
    'background:#f7fafc', 'flex-shrink:0',
  ].join(';'),
  grid: [
    'display:grid', 'grid-template-columns:repeat(2,1fr)', 'gap:10px',
    'padding:16px 20px', 'overflow-y:auto', 'flex:1',
  ].join(';'),
  footer: [
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:12px 20px', 'border-top:1px solid #e2e8f0',
    'background:#f7fafc', 'flex-shrink:0',
  ].join(';'),
} as const;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    #${MODAL_ID} .ai-sel-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    #${MODAL_ID} ::-webkit-scrollbar { width: 6px; }
    #${MODAL_ID} ::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 3px; }
  `;
  document.head.appendChild(s);
}
