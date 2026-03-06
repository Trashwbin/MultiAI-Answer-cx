import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { proxyFetch } from '../utils/page-proxy';
import { BaseProvider } from './base-provider';

export class GrokProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    const prompt = this.buildPrompt(question);

    try {
      const rawText = await this.queryViaApi(prompt);
      const parsed = parseAIResponse(rawText, this.config.id);
      return { ...parsed, rawText };
    } catch (apiError) {
      const msg = apiError instanceof Error ? apiError.message : String(apiError);

      if (msg.includes('403') || msg.includes('anti-bot') || msg.includes('Forbidden')) {
        console.warn('[Grok] API 403 — falling back to DOM simulation');
        try {
          const rawText = await this.queryViaDom(prompt);
          const parsed = parseAIResponse(rawText, this.config.id);
          return { ...parsed, rawText };
        } catch (domError) {
          return {
            providerId: this.config.id,
            answers: [],
            rawText: '',
            error: `API: ${msg} | DOM: ${domError instanceof Error ? domError.message : String(domError)}`,
          };
        }
      }

      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: msg,
      };
    }
  }

  private async queryViaApi(prompt: string): Promise<string> {
    const conversationId = await this.createConversation();

    const body = JSON.stringify({
      message: prompt,
      parentResponseId: crypto.randomUUID(),
      disableSearch: false,
      enableImageGeneration: false,
      imageAttachments: [],
      returnImageBytes: false,
      returnRawGrokInXaiRequest: false,
      fileAttachments: [],
      enableImageStreaming: false,
      imageGenerationCount: 0,
      forceConcise: false,
      toolOverrides: {},
      enableSideBySide: false,
      sendFinalMetadata: true,
      isReasoning: false,
      metadata: { request_metadata: { mode: 'auto' } },
      disableTextFollowUps: true,
      disableArtifact: true,
      isFromGrokFiles: false,
      disableMemory: true,
      forceSideBySide: false,
      modelMode: 'MODEL_MODE_AUTO',
      isAsyncChat: false,
      skipCancelCurrentInflightRequests: false,
      isRegenRequest: false,
      disableSelfHarmShortCircuit: false,
      deviceEnvInfo: {
        darkModeEnabled: false,
        devicePixelRatio: 1,
        screenWidth: 2560,
        screenHeight: 1440,
        viewportWidth: 1440,
        viewportHeight: 719,
      },
    });

    const res = await proxyFetch(
      'grok.com',
      `https://grok.com/rest/app-chat/conversations/${conversationId}/responses`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );

    if (!res.ok) {
      throw new Error(`Grok API ${res.status}: ${res.body.slice(0, 300)}`);
    }

    return this.parseNdjson(res.body);
  }

  private async createConversation(): Promise<string> {
    const res = await proxyFetch('grok.com', 'https://grok.com/rest/app-chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      throw new Error(`Grok create conversation ${res.status}: ${res.body.slice(0, 200)}`);
    }

    const data = JSON.parse(res.body) as { conversationId?: string; id?: string };
    const conversationId = data.conversationId ?? data.id;
    if (!conversationId) {
      throw new Error('Grok: conversationId missing — 请先登录 grok.com');
    }
    return conversationId;
  }

  private async queryViaDom(prompt: string): Promise<string> {
    const tabId = await this.ensureGrokTab();

    const sendResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: grokDomSend,
      args: [prompt],
    });

    const sendResult = sendResults[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!sendResult?.ok) {
      throw new Error(`Grok DOM send failed: ${sendResult?.error ?? 'no result'}`);
    }

    console.log('[Grok] DOM: message sent, polling for response...');

    const MAX_WAIT_MS = 90_000;
    const POLL_INTERVAL_MS = 2_000;
    let lastText = '';
    let stableCount = 0;

    for (let elapsed = 0; elapsed < MAX_WAIT_MS; elapsed += POLL_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: grokDomPoll,
      });

      const poll = pollResults[0]?.result as
        | { text: string; isStreaming: boolean }
        | undefined;

      if (!poll) continue;

      if (poll.text && poll.text !== lastText) {
        lastText = poll.text;
        stableCount = 0;
      } else if (poll.text) {
        stableCount++;
        if (!poll.isStreaming && stableCount >= 2) {
          break;
        }
      }
    }

    if (!lastText) {
      throw new Error(
        'Grok DOM: 未检测到回复。请确保 grok.com 页面已打开、已登录，且输入框可见。',
      );
    }

    return lastText;
  }

  private async ensureGrokTab(): Promise<number> {
    for (const pattern of ['https://grok.com/*', 'https://www.grok.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) {
        console.log(`[Grok] Reusing tab ${tab.id}`);
        return tab.id;
      }
    }

    console.log('[Grok] Creating background tab for grok.com');
    const tab = await chrome.tabs.create({ url: 'https://grok.com/', active: false });
    if (tab.id === undefined) {
      throw new Error('[Grok] chrome.tabs.create returned no id');
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('[Grok] Tab load timeout'));
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

  private parseNdjson(ndjson: string): string {
    let finalMessage = '';
    const deltas: string[] = [];

    for (const line of ndjson.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed) as Record<string, unknown>;
        const delta =
          (typeof data.contentDelta === 'string' ? data.contentDelta : undefined) ??
          (typeof data.textDelta === 'string' ? data.textDelta : undefined) ??
          (typeof data.content === 'string' ? data.content : undefined) ??
          (typeof data.text === 'string' ? data.text : undefined) ??
          (typeof data.delta === 'string' ? data.delta : undefined);
        if (delta) deltas.push(delta);

        const nested = data.result as Record<string, unknown> | undefined;
        const msg = (nested?.response as Record<string, unknown> | undefined)?.modelResponse as
          | Record<string, unknown>
          | undefined;
        if (typeof msg?.message === 'string' && msg.message.length > 0) {
          finalMessage = msg.message;
        }
      } catch {}
    }

    if (finalMessage) return finalMessage;
    return deltas.join('');
  }
}

// These functions are serialised into grok.com's MAIN world via executeScript.
// They MUST be fully self-contained — no outer-scope references allowed.

// Ported from reference grok-web-client-browser.ts:120-178
function grokDomSend(message: string): { ok: boolean; error?: string } {
  try {
    const inputSelectors = [
      '[contenteditable="true"]',
      'textarea[placeholder]',
      'textarea',
      'div[role="textbox"]',
      'div[contenteditable="true"]',
    ];
    let inputEl: HTMLElement | null = null;
    for (const sel of inputSelectors) {
      inputEl = document.querySelector(sel);
      if (inputEl && inputEl.offsetParent !== null) break;
    }
    if (!inputEl) return { ok: false, error: '找不到输入框' };

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
      'button[type="submit"]',
      'button[data-testid*="send"]',
      'form button[type=submit]',
      'button:has(svg)',
      '.send-button',
      "[class*='send']",
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

    const keyEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
    });
    inputEl.dispatchEvent(keyEvent);
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Ported from reference grok-web-client-browser.ts:200-236
function grokDomPoll(): { text: string; isStreaming: boolean } {
  const clean = (t: string): string => t.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  const selectors = [
    '[data-role="assistant"]',
    '[class*="assistant"]',
    '[class*="response"]',
    '[class*="message"]',
    'article',
    "[class*='markdown']",
    '.prose',
  ];

  let text = '';
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    const last = els.length > 0 ? els[els.length - 1] : null;
    if (last) {
      const t = clean((last as HTMLElement).textContent ?? '');
      if (t.length > 10) {
        text = t;
        break;
      }
    }
  }

  if (!text) {
    const all = document.querySelectorAll('p, div[class]');
    for (let i = all.length - 1; i >= 0; i--) {
      const t = clean((all[i] as HTMLElement).textContent ?? '');
      if (t.length > 20 && !t.includes('Ask Grok')) {
        text = t;
        break;
      }
    }
  }

  const stopBtn = document.querySelector('[aria-label*="Stop"], [aria-label*="stop"]');
  const isStreaming = !!stopBtn;

  return { text, isStreaming };
}
