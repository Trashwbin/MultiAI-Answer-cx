import type { ExtensionMessage, AuthStatus, ProviderConfig } from '../types';
import { getEnabledProviders } from '../config/ai-config';

const POLL_INTERVAL_MS = 3_000;

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

const providerStatuses = new Map<string, AuthStatus>();

function getEnabledProviderList(): readonly ProviderConfig[] {
  return getEnabledProviders();
}

function updateProgressBar(): void {
  const providers = getEnabledProviderList();
  const total = providers.length;
  if (total === 0) return;

  const connected = providers.filter((p) => providerStatuses.get(p.id) === 'authenticated').length;
  const percent = Math.round((connected / total) * 100);

  const fill = document.getElementById('progressFill');
  if (fill) {
    fill.style.width = `${percent}%`;
  }
}

function createStepItem(provider: ProviderConfig): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'step-item';
  item.dataset['providerId'] = provider.id;

  const dot = document.createElement('div');
  dot.className = 'step-dot';
  dot.style.background = provider.color;
  item.appendChild(dot);

  const info = document.createElement('div');
  info.className = 'step-info';

  const name = document.createElement('div');
  name.className = 'step-name';
  name.textContent = provider.name;
  info.appendChild(name);

  const status = document.createElement('div');
  status.className = 'step-status';
  status.textContent = '未连接';
  info.appendChild(status);

  item.appendChild(info);

  const btn = document.createElement('button');
  btn.className = 'step-btn step-btn-connect';
  btn.textContent = '连接';
  btn.addEventListener('click', () => {
    void handleStepConnect(provider.id, item);
  });
  item.appendChild(btn);

  return item;
}

async function handleStepConnect(providerId: string, item: HTMLDivElement): Promise<void> {
  const btn = item.querySelector<HTMLButtonElement>('.step-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '连接中...';
  }

  const msg: ExtensionMessage = { type: 'AUTH_LOGIN', providerId };
  const resp = await sendAuthMessage(msg);

  if (resp.success) {
    providerStatuses.set(providerId, 'authenticated');
    updateStepItem(item, 'authenticated');
  } else {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '连接';
    }
  }

  updateProgressBar();
}

function updateStepItem(item: HTMLDivElement, status: AuthStatus): void {
  const statusEl = item.querySelector<HTMLDivElement>('.step-status');
  const btn = item.querySelector<HTMLButtonElement>('.step-btn');

  if (status === 'authenticated') {
    item.classList.add('connected');
    if (statusEl) {
      statusEl.textContent = '已连接';
      statusEl.classList.add('connected');
    }
    if (btn) {
      btn.className = 'step-btn step-btn-done';
      btn.textContent = '已连接';
      btn.disabled = true;
    }
  } else {
    item.classList.remove('connected');
    if (statusEl) {
      statusEl.textContent = status === 'expired' ? '已过期' : '未连接';
      statusEl.classList.remove('connected');
    }
    if (btn) {
      btn.className = 'step-btn step-btn-connect';
      btn.textContent = '连接';
      btn.disabled = false;
    }
  }
}

async function refreshAllStatuses(): Promise<void> {
  const list = document.getElementById('stepList');
  if (!list) return;

  const items = list.querySelectorAll<HTMLDivElement>('.step-item');
  const promises = Array.from(items).map(async (item) => {
    const providerId = item.dataset['providerId'];
    if (!providerId) return;

    const msg: ExtensionMessage = { type: 'AUTH_STATUS', providerId };
    const resp = await sendAuthMessage(msg);
    const status: AuthStatus = resp.success && resp.status ? resp.status : 'unauthenticated';

    providerStatuses.set(providerId, status);
    updateStepItem(item, status);
  });

  await Promise.all(promises);
  updateProgressBar();
}

function renderStepList(): void {
  const list = document.getElementById('stepList');
  if (!list) return;

  const providers = getEnabledProviderList();
  for (const provider of providers) {
    list.appendChild(createStepItem(provider));
  }
}

function finishOnboarding(): void {
  void chrome.storage.local.set({ onboardingComplete: true });
  window.close();
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

function startPolling(): void {
  pollTimer = setInterval(() => {
    void refreshAllStatuses();
  }, POLL_INTERVAL_MS);
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderStepList();
  void refreshAllStatuses();
  startPolling();

  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', finishOnboarding);
  }

  const skipBtn = document.getElementById('skipBtn');
  if (skipBtn) {
    skipBtn.addEventListener('click', finishOnboarding);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    void refreshAllStatuses();
    startPolling();
  }
});
