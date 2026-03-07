import { parseAIResponse } from '../core/json-parser';
import type { AuthStatus, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class ChatGPTProvider extends BaseProvider {
  async checkAuth(): Promise<AuthStatus> {
    const base = await super.checkAuth();
    if (base === 'authenticated') return base;

    const tabId = await this.findProviderTab(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    if (tabId === undefined) return 'unauthenticated';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: chatgptAuthProbe,
      });
      return results[0]?.result === true ? 'authenticated' : 'unauthenticated';
    } catch {
      return 'unauthenticated';
    }
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(question);
      const tabId = await this.ensureChatGPTTab();

      const apiResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: chatgptApiQuery,
        args: [prompt],
      });

      const apiResult = apiResults[0]?.result as
        | { ok: true; text: string }
        | { ok: false; error: string; is403: boolean }
        | undefined;

      if (!apiResult) throw new Error('ChatGPT: executeScript 无返回');

      if (apiResult.ok) {
        const rawText = apiResult.text;
        const parsed = parseAIResponse(rawText, this.config.id);
        return { ...parsed, rawText };
      }

      if (!apiResult.is403) {
        return { providerId: this.config.id, answers: [], rawText: '', error: apiResult.error };
      }

      console.warn('[ChatGPT] API 403 — falling back to DOM simulation');
      return await this.queryViaDom(prompt, tabId);
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async queryViaDom(prompt: string, tabId: number): Promise<ProviderResponse> {
    const sendResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: chatgptDomSend,
      args: [prompt],
    });

    const sendResult = sendResults[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!sendResult?.ok) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: `ChatGPT DOM: ${sendResult?.error ?? '无法发送消息'}`,
      };
    }

    const MAX_WAIT_MS = 90_000;
    const POLL_INTERVAL_MS = 2_000;
    let lastText = '';
    let stableCount = 0;

    for (let elapsed = 0; elapsed < MAX_WAIT_MS; elapsed += POLL_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: chatgptDomPoll,
      });

      const poll = pollResults[0]?.result as { text: string; isStreaming: boolean } | undefined;
      if (!poll) continue;

      if (poll.text && poll.text !== lastText) {
        lastText = poll.text;
        stableCount = 0;
      } else if (poll.text) {
        stableCount++;
        if (!poll.isStreaming && stableCount >= 2) break;
      }
    }

    if (!lastText) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: 'ChatGPT DOM: 90s 内未检测到回复',
      };
    }

    const parsed = parseAIResponse(lastText, this.config.id);
    return { ...parsed, rawText: lastText };
  }

  private async ensureChatGPTTab(): Promise<number> {
    for (const pattern of ['https://chatgpt.com/*', 'https://chat.openai.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: false });
    if (tab.id === undefined) throw new Error('ChatGPT: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('ChatGPT: tab 加载超时'));
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
// All functions below run inside chatgpt.com MAIN world via executeScript.
// They MUST be fully self-contained — no outer-scope references allowed.
// ---------------------------------------------------------------------------

// Adapted from openclaw-zero-token + ChatALL ChatGPTBot.
// Flow: session → sentinel chat-requirements → /backend-api/conversation SSE.
function chatgptApiQuery(
  message: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string; is403: boolean }> {
  return (async () => {
    try {
      console.log('[ChatGPT API] fetching session');
      const sessionRes = await fetch('https://chatgpt.com/api/auth/session', {
        credentials: 'include',
      });
      console.log('[ChatGPT API] session status:', sessionRes.status);
      if (!sessionRes.ok) {
        return { ok: false as const, error: `ChatGPT session ${sessionRes.status}`, is403: false };
      }
      const session = (await sessionRes.json()) as {
        accessToken?: string;
        oaiDeviceId?: string;
      };
      const accessToken = session.accessToken;
      if (!accessToken) {
        return {
          ok: false as const,
          error: 'ChatGPT: 未找到 accessToken — 请先登录 chatgpt.com',
          is403: false,
        };
      }
      const deviceId = session.oaiDeviceId ?? crypto.randomUUID();

      const baseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'oai-device-id': deviceId,
        'oai-language': 'en-US',
      };

      let sentinelToken = '';
      try {
        console.log('[ChatGPT API] fetching sentinel requirements');
        const sentinelRes = await fetch(
          'https://chatgpt.com/backend-api/sentinel/chat-requirements',
          {
            method: 'POST',
            headers: baseHeaders,
            credentials: 'include',
          },
        );
        console.log('[ChatGPT API] sentinel status:', sentinelRes.status);
        if (sentinelRes.ok) {
          const data = (await sentinelRes.json()) as { token?: string };
          sentinelToken = data.token ?? '';
        }
      } catch (e: unknown) {
        console.log('[ChatGPT API] sentinel fetch error:', e instanceof Error ? e.message : String(e));
      }

      const headers: Record<string, string> = {
        ...baseHeaders,
        Accept: 'text/event-stream',
      };
      if (sentinelToken) {
        headers['openai-sentinel-chat-requirements-token'] = sentinelToken;
      }

      const body = {
        action: 'next',
        messages: [
          {
            id: crypto.randomUUID(),
            author: { role: 'user' },
            content: { content_type: 'text', parts: [message] },
          },
        ],
        parent_message_id: crypto.randomUUID(),
        model: 'auto',
        timezone_offset_min: new Date().getTimezoneOffset(),
        history_and_training_disabled: false,
        conversation_mode: { kind: 'primary_assistant' },
        force_paragen: false,
        force_use_sse: true,
      };

      console.log('[ChatGPT API] posting conversation');
      const res = await fetch('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'include',
      });
      console.log('[ChatGPT API] conversation status:', res.status);

      if (!res.ok) {
        const errText = await res.text();
        const is403 = res.status === 403;
        return {
          ok: false as const,
          error: `ChatGPT API ${res.status}: ${errText.slice(0, 300)}`,
          is403,
        };
      }

      const sse = await res.text();
      let lastText = '';
      for (const line of sse.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const data = JSON.parse(payload) as {
            message?: {
              content?: {
                content_type?: string;
                parts?: string[];
              };
            };
          };
          if (data.message?.content?.content_type === 'text') {
            const part = data.message.content.parts?.[0];
            if (typeof part === 'string') {
              lastText = part;
            }
          }
        } catch {}
      }

      if (!lastText) {
        return {
          ok: false as const,
          error: `ChatGPT: SSE 响应中无文本内容 (len=${sse.length})`,
          is403: false,
        };
      }
      return { ok: true as const, text: lastText };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg, is403: msg.includes('403') };
    }
  })();
}

function chatgptDomSend(message: string): { ok: boolean; error?: string } {
  try {
    const inputSelectors = [
      '#prompt-textarea',
      'textarea[placeholder]',
      'textarea',
      '[contenteditable="true"][data-placeholder]',
      '[contenteditable="true"]',
      'div[role="textbox"]',
    ];
    let inputEl: HTMLElement | null = null;
    for (const sel of inputSelectors) {
      inputEl = document.querySelector(sel);
      if (inputEl && inputEl.offsetParent !== null) break;
    }
    if (!inputEl) return { ok: false, error: '找不到输入框 — 请在 chatgpt.com 打开一个对话页面' };

    inputEl.focus();
    if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
      (inputEl as HTMLTextAreaElement).value = message;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.textContent = message;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const sendSelectors = [
      '#composer-submit-button',
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[type="submit"]',
      'form button[type=submit]',
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

function chatgptDomPoll(): { text: string; isStreaming: boolean } {
  const clean = (t: string): string => t.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  const scope = document.querySelector('main') ?? document.body;
  const selectors = [
    'div[data-message-author-role="assistant"]',
    '.agent-turn [data-message-author-role="assistant"]',
  ];
  const inConversationTurn = (el: Element): boolean =>
    !!el.closest('[data-testid^="conversation-turn"], [data-testid*="conversation"], .agent-turn');

  let text = '';
  for (const sel of selectors) {
    const els = scope.querySelectorAll(sel);
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els.item(i);
      if (!el) continue;
      if (!inConversationTurn(el)) continue;
      const t = clean((el as HTMLElement).textContent ?? '');
      if (t.length >= 10) {
        text = t;
        break;
      }
    }
    if (text) break;
  }

  const stopBtn = document.querySelector(
    'button.bg-black .icon-lg, [aria-label*="Stop"], [aria-label*="stop"]',
  );
  const isStreaming = !!stopBtn;

  return { text, isStreaming };
}

function chatgptAuthProbe(): Promise<boolean> {
  return fetch('/api/auth/session', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Record<string, unknown> | null) => !!d?.accessToken)
    .catch(() => false);
}
