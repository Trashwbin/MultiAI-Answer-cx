import type { ExtensionMessage, AuthStatus, ProviderConfig } from '../types';
import { AI_PROVIDERS } from '../config/ai-config';

// Declares global from notification.js loaded via <script> in popup.html
declare function showNotification(message: string, type?: 'info' | 'error' | 'warning' | 'success'): void;

function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

function querySelector<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element ${selector} not found`);
  return el as T;
}

function sendToActiveTab(msg: Record<string, unknown>): void {
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
}

function sendToAllTabs(msg: Record<string, unknown>): void {
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    }
  });
}

async function queryAuthStatus(providerId: string): Promise<AuthStatus> {
  const msg: ExtensionMessage = { type: 'AUTH_STATUS', providerId };
  return new Promise<AuthStatus>((resolve) => {
    chrome.runtime.sendMessage(msg, (resp: { success: boolean; status?: AuthStatus }) => {
      if (chrome.runtime.lastError || !resp?.success || !resp.status) {
        resolve('unauthenticated');
        return;
      }
      resolve(resp.status);
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

function statusColor(status: AuthStatus): string {
  switch (status) {
    case 'authenticated': return '#4CAF50';
    case 'unauthenticated': return '#999';
    case 'expired': return '#FF9800';
    case 'error': return '#f44336';
  }
}

function createProviderRow(provider: ProviderConfig): HTMLDivElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;align-items:center;gap:6px;padding:4px 6px;' +
    'border-radius:4px;background:#fafafa;';
  row.dataset['providerId'] = provider.id;

  const dot = document.createElement('span');
  dot.style.cssText =
    `width:8px;height:8px;border-radius:50%;background:${provider.color};flex-shrink:0;`;
  row.appendChild(dot);

  const name = document.createElement('span');
  name.style.cssText = 'font-size:11px;color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  name.textContent = provider.name;
  row.appendChild(name);

  const badge = document.createElement('span');
  badge.className = 'auth-badge';
  badge.style.cssText = 'font-size:10px;color:#999;flex-shrink:0;';
  badge.textContent = '...';
  row.appendChild(badge);

  return row;
}

function buildAIStatusSection(): HTMLDivElement {
  const section = document.createElement('div');
  section.id = 'aiStatusSection';
  section.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid #eee;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;font-weight:600;color:#333;margin-bottom:8px;';
  header.textContent = 'AI 连接状态';
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.id = 'aiStatusGrid';
  grid.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';
  section.appendChild(grid);

  for (const provider of AI_PROVIDERS) {
    grid.appendChild(createProviderRow(provider));
  }

  const manageBtn = document.createElement('button');
  manageBtn.textContent = '管理 AI 连接';
  manageBtn.style.cssText =
    'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;' +
    'background:#fff;color:#333;font-size:13px;cursor:pointer;' +
    'transition:all 0.2s;text-align:center;display:block;';
  manageBtn.addEventListener('mouseenter', () => {
    manageBtn.style.background = '#f5f5f5';
  });
  manageBtn.addEventListener('mouseleave', () => {
    manageBtn.style.background = '#fff';
  });
  manageBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  section.appendChild(manageBtn);

  return section;
}

async function refreshAIStatuses(): Promise<void> {
  const grid = document.getElementById('aiStatusGrid');
  if (!grid) return;

  const rows = grid.querySelectorAll<HTMLDivElement>('[data-provider-id]');
  const statusPromises = Array.from(rows).map(async (row) => {
    const providerId = row.dataset['providerId'];
    if (!providerId) return;

    const status = await queryAuthStatus(providerId);
    const badge = row.querySelector<HTMLSpanElement>('.auth-badge');
    if (badge) {
      badge.textContent = statusLabel(status);
      badge.style.color = statusColor(status);
    }
  });

  await Promise.all(statusPromises);
}

document.addEventListener('DOMContentLoaded', () => {
  void init();
});

async function init(): Promise<void> {
  const mainContent = getElement<HTMLDivElement>('mainContent');
  const bigSwitchContainer = getElement<HTMLDivElement>('bigSwitchContainer');
  const enableExtensionBtn = getElement<HTMLButtonElement>('enableExtension');
  const disableExtensionBtn = getElement<HTMLButtonElement>('disableExtension');

  const showQuestionsBtn = querySelector<HTMLButtonElement>('.show-questions');
  const showAnswersBtn = querySelector<HTMLButtonElement>('.show-answers');
  const removePasteLimitSwitch = getElement<HTMLInputElement>('remove-paste-limit');
  const enableCopyBtnSwitch = getElement<HTMLInputElement>('enable-copy-btn');
  const enableTextSelectSwitch = getElement<HTMLInputElement>('enable-text-select');

  const stored = await chrome.storage.local.get([
    'extensionEnabled',
    'pasteLimitDisabled',
    'copyBtnEnabled',
    'textSelectEnabled',
  ]);

  const extensionEnabled = (stored['extensionEnabled'] as boolean | undefined) ?? true;
  const pasteLimitDisabled = (stored['pasteLimitDisabled'] as boolean | undefined) ?? true;
  const copyBtnEnabled = (stored['copyBtnEnabled'] as boolean | undefined) ?? true;
  const textSelectEnabled = (stored['textSelectEnabled'] as boolean | undefined) ?? true;

  removePasteLimitSwitch.checked = pasteLimitDisabled;
  enableCopyBtnSwitch.checked = copyBtnEnabled;
  enableTextSelectSwitch.checked = textSelectEnabled;

  if (extensionEnabled) {
    mainContent.style.display = 'block';
    bigSwitchContainer.style.display = 'none';
  } else {
    mainContent.style.display = 'none';
    bigSwitchContainer.style.display = 'flex';
  }

  enableExtensionBtn.addEventListener('click', () => {
    void (async () => {
      await chrome.storage.local.set({ extensionEnabled: true });
      mainContent.style.display = 'block';
      bigSwitchContainer.style.display = 'none';
      sendToAllTabs({ action: 'toggleExtension', enabled: true });
    })();
  });

  disableExtensionBtn.addEventListener('click', () => {
    void (async () => {
      await chrome.storage.local.set({ extensionEnabled: false });
      mainContent.style.display = 'none';
      bigSwitchContainer.style.display = 'flex';
      sendToAllTabs({ action: 'toggleExtension', enabled: false });
    })();
  });

  removePasteLimitSwitch.addEventListener('change', () => {
    const isChecked = removePasteLimitSwitch.checked;
    void chrome.storage.local.set({ pasteLimitDisabled: isChecked });
    sendToActiveTab({ action: 'togglePasteLimit', enabled: isChecked });
  });

  enableCopyBtnSwitch.addEventListener('change', () => {
    const isChecked = enableCopyBtnSwitch.checked;
    void chrome.storage.local.set({ copyBtnEnabled: isChecked });
    sendToActiveTab({ action: 'toggleCopyBtn', enabled: isChecked });
  });

  enableTextSelectSwitch.addEventListener('change', () => {
    const isChecked = enableTextSelectSwitch.checked;
    void chrome.storage.local.set({ textSelectEnabled: isChecked });
    sendToActiveTab({ action: 'toggleTextSelect', enabled: isChecked });
  });

  showQuestionsBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        showNotification('显示题目列表失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      const tab = tabs[0];
      if (!tab?.id || !tab.url) {
        showNotification('显示题目列表失败: 未找到当前标签页', 'error');
        return;
      }
      if (!tab.url.includes('.chaoxing.com/')) {
        showNotification('请在学习通题目页面使用此功能', 'warning');
        return;
      }
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'showQuestionList' },
        (response: { success?: boolean; cancelled?: boolean; error?: string } | undefined) => {
          if (chrome.runtime.lastError) {
            showNotification('显示题目列表失败: ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          if (!response?.success) {
            if (response?.cancelled) return;
            showNotification('显示题目列表失败: ' + (response?.error ?? '未知错误'), 'error');
            return;
          }
          window.close();
        },
      );
    });
  });

  showAnswersBtn.addEventListener('click', () => {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || !tab.url) {
          showNotification('显示AI答案失败: 未找到当前标签页', 'error');
          return;
        }
        if (!tab.url.includes('.chaoxing.com/')) {
          showNotification('请在学习通题目页面使用此功能', 'warning');
          return;
        }
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'showAnswers' },
          (response: { success?: boolean; error?: string } | undefined) => {
            if (chrome.runtime.lastError) {
              showNotification('显示AI答案失败: ' + chrome.runtime.lastError.message, 'error');
              return;
            }
            if (!response?.success) {
              showNotification('显示AI答案失败: ' + (response?.error ?? '未知错误'), 'error');
              return;
            }
            window.close();
          },
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showNotification('显示AI答案失败: ' + msg, 'error');
      }
    })();
  });

  const showUsageBtn = getElement<HTMLAnchorElement>('showUsage');
  const usageModal = getElement<HTMLDivElement>('usageModal');
  const closeUsageBtn = getElement<HTMLButtonElement>('closeUsage');

  showUsageBtn.addEventListener('click', (e: Event) => {
    e.preventDefault();
    usageModal.classList.add('show');
  });

  closeUsageBtn.addEventListener('click', () => {
    usageModal.classList.remove('show');
  });

  usageModal.addEventListener('click', (e: Event) => {
    if (e.target === usageModal) {
      usageModal.classList.remove('show');
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && usageModal.classList.contains('show')) {
      usageModal.classList.remove('show');
    }
  });

  const buttonContainer = querySelector<HTMLDivElement>('.button-container');
  const aiSection = buildAIStatusSection();
  buttonContainer.after(aiSection);

  await refreshAIStatuses();
}
