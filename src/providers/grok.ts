import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class GrokProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(question);
      const tabId = await this.ensureGrokTab();

      const apiResults = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: grokApiQuery,
        args: [prompt],
      });

      const apiResult = apiResults[0]?.result as
        | { ok: true; text: string; debug?: string }
        | { ok: false; error: string; is403: boolean }
        | undefined;

      if (!apiResult) throw new Error('Grok: executeScript 无返回');

      if (apiResult.ok) {
        const rawText = apiResult.text;
        const parsed = parseAIResponse(rawText, this.config.id);
        const debugSuffix = apiResult.debug ? ` [grok: ${apiResult.debug}]` : '';
        return { ...parsed, rawText: rawText + debugSuffix };
      }

      if (!apiResult.is403) {
        return { providerId: this.config.id, answers: [], rawText: '', error: apiResult.error };
      }

      console.warn('[Grok] API 403 — falling back to DOM simulation');
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
      func: grokDomSend,
      args: [prompt],
    });

    const sendResult = sendResults[0]?.result as { ok: boolean; error?: string } | undefined;
    if (!sendResult?.ok) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: `Grok DOM: ${sendResult?.error ?? '无法发送消息'}`,
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
        if (!poll.isStreaming && stableCount >= 2) break;
      }
    }

    if (!lastText) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: 'Grok DOM: 90s 内未检测到回复',
      };
    }

    const parsed = parseAIResponse(lastText, this.config.id);
    return { ...parsed, rawText: lastText };
  }

  private async ensureGrokTab(): Promise<number> {
    for (const pattern of ['https://grok.com/*', 'https://www.grok.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({ url: 'https://grok.com/', active: false });
    if (tab.id === undefined) throw new Error('Grok: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Grok: tab 加载超时'));
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

// All functions below run inside grok.com's MAIN world via executeScript.
// They MUST be fully self-contained — no outer-scope references allowed.

// Adapted from grok2api processor.ts + fount grokAPI.mjs + openai-grok worker.js
// Uses /conversations/new (temporary) — single request, no conversation management.
// Parses NDJSON: result.response.token (streaming deltas), result.response.modelResponse.message (final).
function grokApiQuery(
  message: string,
): Promise<{ ok: true; text: string; debug?: string } | { ok: false; error: string; is403: boolean }> {
  return (async () => {
    try {
      // Payload aligned with grok2api + fount + openai-grok (all active Grok reverse-proxy projects)
      const body = {
        temporary: true,
        modelName: 'grok-3',
        message,
        fileAttachments: [] as string[],
        imageAttachments: [] as string[],
        disableSearch: false,
        enableImageGeneration: true,
        returnImageBytes: false,
        returnRawGrokInXaiRequest: false,
        enableImageStreaming: true,
        imageGenerationCount: 2,
        forceConcise: false,
        toolOverrides: {},
        enableSideBySide: true,
        isPreset: false,
        sendFinalMetadata: true,
        customInstructions: '',
        deepsearchPreset: '',
        isReasoning: false,
      };

      const res = await fetch('https://grok.com/rest/app-chat/conversations/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        const is403 = res.status === 403 || errText.includes('anti-bot');
        return { ok: false as const, error: `Grok API ${res.status}: ${errText.slice(0, 300)}`, is403 };
      }

      const ndjson = await res.text();
      const ndjsonPreview = ndjson.slice(0, 500);

      let finalMessage = '';
      const tokens: string[] = [];
      let parsedLines = 0;

      for (const line of ndjson.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as Record<string, unknown>;
          parsedLines++;

          const err = (data as Record<string, Record<string, unknown>>).error;
          if (err?.message) {
            return { ok: false as const, error: `Grok: ${String(err.message)}`, is403: false };
          }

          const grok = (data as Record<string, Record<string, unknown>>).result?.response as
            | Record<string, unknown>
            | undefined;
          if (!grok) continue;

          // Streaming token delta: result.response.token
          const rawToken = grok.token;
          if (typeof rawToken === 'string' && rawToken && !grok.isThinking) {
            tokens.push(rawToken);
          }

          // Final complete response: result.response.modelResponse.message
          const modelResp = grok.modelResponse as Record<string, unknown> | undefined;
          if (modelResp) {
            if (typeof modelResp.error === 'string' && modelResp.error) {
              return { ok: false as const, error: `Grok: ${modelResp.error}`, is403: false };
            }
            if (typeof modelResp.message === 'string' && modelResp.message.length > 0) {
              finalMessage = modelResp.message;
            }
          }
        } catch {}
      }

      const text = finalMessage || tokens.join('');
      if (!text) {
        return {
          ok: false as const,
          error: `Grok: 响应为空 (parsed=${parsedLines} lines, len=${ndjson.length}). NDJSON preview: ${ndjsonPreview}`,
          is403: false,
        };
      }
      return { ok: true as const, text, debug: `parsed=${parsedLines}, tokens=${tokens.length}, hasFinal=${!!finalMessage}` };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const is403 = msg.includes('403') || msg.includes('anti-bot');
      return { ok: false as const, error: msg, is403 };
    }
  })();
}

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
    if (!inputEl) return { ok: false, error: '找不到输入框 — 请在 grok.com 打开一个对话页面' };

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
