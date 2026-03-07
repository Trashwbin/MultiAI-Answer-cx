import { parseAIResponse } from '../core/json-parser';
import type { AuthStatus, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class GeminiProvider extends BaseProvider {
  async checkAuth(): Promise<AuthStatus> {
    const base = await super.checkAuth();
    if (base === 'authenticated') return base;

    const tabId = await this.findProviderTab(['https://gemini.google.com/*']);
    if (tabId === undefined) return 'unauthenticated';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: geminiAuthProbe,
      });
      return results[0]?.result === true ? 'authenticated' : 'unauthenticated';
    } catch {
      return 'unauthenticated';
    }
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(question);
      const tabId = await this.ensureGeminiTab();

      const sendResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: geminiDomSend,
        args: [prompt],
      });

      const sendResult = sendResults[0]?.result as { ok: boolean; error?: string } | undefined;
      if (!sendResult?.ok) {
        return {
          providerId: this.config.id,
          answers: [],
          rawText: '',
          error: `Gemini DOM: ${sendResult?.error ?? '无法发送消息'}`,
        };
      }

      const MAX_WAIT_MS = 120_000;
      const POLL_INTERVAL_MS = 2_000;
      let lastText = '';
      let stableCount = 0;

      for (let elapsed = 0; elapsed < MAX_WAIT_MS; elapsed += POLL_INTERVAL_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const pollResults = await chrome.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: geminiDomPoll,
          args: [prompt],
        });

        const poll = pollResults[0]?.result as { text: string; isStreaming: boolean } | undefined;
        if (!poll) continue;

        const minLen = 40;
        if (poll.text && poll.text.length >= minLen && poll.text !== lastText) {
          lastText = poll.text;
          stableCount = 0;
        } else if (poll.text && poll.text.length >= minLen) {
          stableCount++;
          if (!poll.isStreaming && stableCount >= 2) break;
        }
      }

      if (!lastText) {
        return {
          providerId: this.config.id,
          answers: [],
          rawText: '',
          error: 'Gemini DOM: 120s 内未检测到回复',
        };
      }

      const parsed = parseAIResponse(lastText, this.config.id);
      return { ...parsed, rawText: lastText };
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureGeminiTab(): Promise<number> {
    for (const pattern of ['https://gemini.google.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({
      url: 'https://gemini.google.com/app',
      active: false,
    });
    if (tab.id === undefined) throw new Error('Gemini: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Gemini: tab 加载超时'));
      }, 15_000);

      function listener(id: number, info: chrome.tabs.TabChangeInfo) {
        if (id === tab.id && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    return tab.id;
  }
}

// ---------------------------------------------------------------------------
// All functions below run inside gemini.google.com MAIN world via executeScript.
// They MUST be fully self-contained — no outer-scope references allowed.
// ---------------------------------------------------------------------------

// Gemini uses batchexecute RPC with complex nested JSON arrays.
// DOM simulation is more reliable since the RPC format changes frequently.
function geminiDomSend(message: string): { ok: boolean; error?: string } {
  try {
    const inputSelectors = [
      '[contenteditable="true"][aria-label]',
      'div[role="textbox"]',
      '[contenteditable="true"]',
      'textarea',
      '[placeholder*="Gemini"]',
      '[data-placeholder]',
    ];
    let inputEl: HTMLElement | null = null;
    for (const sel of inputSelectors) {
      const el = document.querySelector(sel);
      if (el && (el as HTMLElement).offsetParent !== null) {
        inputEl = el as HTMLElement;
        break;
      }
    }
    if (!inputEl) return { ok: false, error: '找不到输入框 — 请在 gemini.google.com 打开页面并登录' };

    inputEl.focus();
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      (inputEl as HTMLTextAreaElement).value = message;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.innerText = message;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const sendSelectors = [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="提交"]',
      'button[aria-label*="发送"]',
      'button[data-icon="send"]',
      'button[type="submit"]',
      'form button[type=submit]',
      '[aria-label*="Send message"]',
    ];
    let sendBtn: HTMLElement | null = null;
    for (const sel of sendSelectors) {
      sendBtn = document.querySelector(sel);
      if (sendBtn && !(sendBtn as HTMLButtonElement).disabled) break;
    }
    if (sendBtn) {
      sendBtn.click();
      return { ok: true };
    }

    const formSubmit = inputEl.closest('form')?.querySelector('button[type=submit]');
    if (formSubmit) {
      (formSubmit as HTMLElement).click();
      return { ok: true };
    }

    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
      }),
    );
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function geminiDomPoll(sentMessage: string): { text: string; isStreaming: boolean } {
  const clean = (t: string): string => t.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  const sentPrefix = clean(sentMessage).slice(0, 50);

  const skipTexts = [
    'Ask Gemini',
    '问问 Gemini',
    'Enter a prompt',
    '输入提示',
    '需要我为你做些什么',
    '发起新对话',
    '我的内容',
    '设置和帮助',
    '制作图片',
    '创作音乐',
    '帮我学习',
    '随便写点什么',
    '给我的一天注入活力',
    '升级到 Google AI Plus',
    '正在加载',
  ];
  const isGreeting = (t: string): boolean =>
    /sage[,，]?\s*你好/i.test(t) || (t.includes('你好') && (t.includes('需要') || t.includes('做些什么')));
  const isSkip = (t: string): boolean => {
    if (skipTexts.some((s) => t.includes(s))) return true;
    if (isGreeting(t)) return true;
    if (sentPrefix && t.startsWith(sentPrefix)) return true;
    return false;
  };

  const isModelContent = (el: Element): boolean => {
    if (el.closest('.user-turn, [class*="user-turn"], [data-message-author="user"], [data-sender="user"]')) {
      return false;
    }
    return true;
  };

  const sidebarRoot = document.querySelector('[aria-label*="对话"], [class*="sidebar"], nav');
  const notInSidebar = (el: Element) => !sidebarRoot?.contains(el);

  const inputEl = document.querySelector(
    '[contenteditable="true"], textarea, [placeholder*="Gemini"]',
  );
  const inputRoot =
    inputEl?.closest('form') ??
    inputEl?.closest("[class*='input']") ??
    inputEl?.parentElement?.parentElement;
  const notInInputArea = (el: Element) => !inputRoot?.contains(el);

  const main =
    document.querySelector('main') ??
    document.querySelector('[role="main"]') ??
    document.querySelector('[class*="chat"]') ??
    document.body;
  const scoped = main === document.body ? document : main;

  let text = '';
  const modelSelectors = [
    '.model-response-text',
    '.model-turn .model-response-text',
    '[data-message-author="model"]',
    '[data-sender="model"]',
    '[class*="model-turn"]',
    '[class*="model-response-text"]',
    '[class*="modelResponse"]',
    '[class*="response-content"]',
    'article',
    "[class*='markdown']",
  ];
  for (const sel of modelSelectors) {
    const els = scoped.querySelectorAll(sel);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i] as Element | undefined;
      if (!el || !notInSidebar(el) || !notInInputArea(el) || !isModelContent(el)) continue;
      const t = clean((el as HTMLElement).textContent ?? '');
      if (t.length >= 40 && !isSkip(t)) {
        text = t;
        break;
      }
    }
    if (text) break;
  }

  if (!text) {
    const candidates: Array<{ text: string }> = [];
    scoped.querySelectorAll('p, div[class], li, span[class]').forEach((el) => {
      if (!notInSidebar(el) || !notInInputArea(el) || !isModelContent(el)) return;
      const t = clean((el as HTMLElement).textContent ?? '');
      if (t.length > 50 && !isSkip(t) && !candidates.some((c) => c.text === t)) {
        candidates.push({ text: t });
      }
    });
    const last = candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
    if (last) {
      text = last.text;
    }
  }

  const stopBtn = document.querySelector('[aria-label*="Stop"], [aria-label*="stop"]');
  const isStreaming = !!stopBtn;

  return { text, isStreaming };
}

function geminiAuthProbe(): boolean {
  const input = document.querySelector(
    '[contenteditable="true"][aria-label], div[role="textbox"], textarea',
  );
  return input !== null && (input as HTMLElement).offsetParent !== null;
}
