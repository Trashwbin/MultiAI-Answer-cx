import type { ExtensionMessage, AuthStatus, ProviderConfig } from '../types';
import { AI_PROVIDERS } from '../config/ai-config';

const STATUS_POLL_INTERVAL_MS = 5_000;

interface AuthResponse {
  success: boolean;
  status?: AuthStatus;
  error?: string;
}

function sendAuthMessage(msg: ExtensionMessage): Promise<AuthResponse> {
  return new Promise<AuthResponse>((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: AuthResponse | undefined) => {
      if (chrome.runtime.lastError || !resp) {
        resolve({ success: false, error: chrome.runtime.lastError?.message ?? 'No response' });
        return;
      }
      resolve(resp);
    });
  });
}

function statusLabel(status: AuthStatus): string {
  switch (status) {
    case 'authenticated': return '已连接';
    case 'unauthenticated': return '未连接';
    case 'expired': return '已过期';
    case 'error': return '错误';
  }
}

function statusCssClass(status: AuthStatus): string {
  return `status-${status}`;
}

function createProviderCard(provider: ProviderConfig): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'provider-card';
  card.dataset['providerId'] = provider.id;

  const dot = document.createElement('div');
  dot.className = 'provider-dot';
  dot.style.background = provider.color;
  card.appendChild(dot);

  const info = document.createElement('div');
  info.className = 'provider-info';

  const name = document.createElement('div');
  name.className = 'provider-name';
  name.textContent = provider.name;
  info.appendChild(name);

  const domain = document.createElement('div');
  domain.className = 'provider-domain';
  domain.textContent = provider.domain;
  info.appendChild(domain);

  card.appendChild(info);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'provider-status status-unauthenticated';
  statusBadge.textContent = '...';
  card.appendChild(statusBadge);

  const actions = document.createElement('div');
  actions.className = 'provider-actions';

  const connectBtn = document.createElement('button');
  connectBtn.className = 'btn btn-connect';
  connectBtn.textContent = '连接';
  connectBtn.addEventListener('click', () => {
    void handleConnect(provider.id, card);
  });
  actions.appendChild(connectBtn);

  const disconnectBtn = document.createElement('button');
  disconnectBtn.className = 'btn btn-disconnect';
  disconnectBtn.textContent = '断开';
  disconnectBtn.addEventListener('click', () => {
    void handleDisconnect(provider.id, card);
  });
  actions.appendChild(disconnectBtn);

  card.appendChild(actions);

  return card;
}

async function handleConnect(providerId: string, card: HTMLDivElement): Promise<void> {
  const connectBtn = card.querySelector<HTMLButtonElement>('.btn-connect');
  if (connectBtn) {
    connectBtn.disabled = true;
    connectBtn.textContent = '连接中...';
  }

  const msg: ExtensionMessage = { type: 'AUTH_LOGIN', providerId };
  const resp = await sendAuthMessage(msg);

  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.textContent = '连接';
  }

  if (resp.success) {
    updateCardStatus(card, 'authenticated');
  }
}

async function handleDisconnect(providerId: string, card: HTMLDivElement): Promise<void> {
  const disconnectBtn = card.querySelector<HTMLButtonElement>('.btn-disconnect');
  if (disconnectBtn) {
    disconnectBtn.disabled = true;
  }

  const msg: ExtensionMessage = { type: 'AUTH_LOGOUT', providerId };
  await sendAuthMessage(msg);

  if (disconnectBtn) {
    disconnectBtn.disabled = false;
  }

  updateCardStatus(card, 'unauthenticated');
}

function updateCardStatus(card: HTMLDivElement, status: AuthStatus): void {
  const badge = card.querySelector<HTMLSpanElement>('.provider-status');
  if (!badge) return;

  badge.className = `provider-status ${statusCssClass(status)}`;
  badge.textContent = statusLabel(status);
}

async function refreshAllStatuses(): Promise<void> {
  const list = document.getElementById('providerList');
  if (!list) return;

  const cards = list.querySelectorAll<HTMLDivElement>('.provider-card');
  const promises = Array.from(cards).map(async (card) => {
    const providerId = card.dataset['providerId'];
    if (!providerId) return;

    const msg: ExtensionMessage = { type: 'AUTH_STATUS', providerId };
    const resp = await sendAuthMessage(msg);

    if (resp.success && resp.status) {
      updateCardStatus(card, resp.status);
    } else {
      updateCardStatus(card, 'unauthenticated');
    }
  });

  await Promise.all(promises);
}

function renderProviderList(): void {
  const list = document.getElementById('providerList');
  if (!list) return;

  for (const provider of AI_PROVIDERS) {
    list.appendChild(createProviderCard(provider));
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

function startPolling(): void {
  pollTimer = setInterval(() => {
    void refreshAllStatuses();
  }, STATUS_POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderProviderList();
  void refreshAllStatuses();
  startPolling();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    void refreshAllStatuses();
    startPolling();
  }
});
