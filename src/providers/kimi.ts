import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class KimiProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(question);
      const tabId = await this.ensureKimiTab();

      const auth = await this.getAuth();
      const kimiAuth = auth.cookies['kimi-auth'] ?? '';

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: kimiConnectRpc,
        args: [prompt, kimiAuth],
      });

      const result = results[0]?.result as
        | { ok: true; text: string }
        | { ok: false; error: string }
        | undefined;

      if (!result) throw new Error('Kimi: executeScript 无返回');
      if (!result.ok) throw new Error(result.error);

      const rawText = result.text;
      const parsed = parseAIResponse(rawText, this.config.id);
      return { ...parsed, rawText };
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureKimiTab(): Promise<number> {
    for (const pattern of ['https://www.kimi.com/*', 'https://kimi.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({ url: 'https://www.kimi.com/', active: false });
    if (tab.id === undefined) throw new Error('Kimi: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Kimi: tab 加载超时'));
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

// Runs inside kimi.com MAIN world — MUST be fully self-contained.
// kimi-auth is HttpOnly → read via chrome.cookies in service worker, passed as arg.
function kimiConnectRpc(
  message: string,
  kimiAuth: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return (async () => {
    try {
      if (!kimiAuth) {
        const cookieMatch = document.cookie.match(/(?:^|;\s*)kimi-auth=([^;]+)/);
        kimiAuth = cookieMatch?.[1] ?? '';
      }
      if (!kimiAuth) {
        return { ok: false as const, error: 'Kimi: 未找到 kimi-auth Cookie — 请先登录 www.kimi.com' };
      }

      const req = {
        scenario: 'SCENARIO_K2',
        message: {
          role: 'user',
          blocks: [{ message_id: '', text: { content: message } }],
          scenario: 'SCENARIO_K2',
        },
        options: { thinking: false },
      };

      const enc = new TextEncoder().encode(JSON.stringify(req));
      const buf = new ArrayBuffer(5 + enc.byteLength);
      const dv = new DataView(buf);
      dv.setUint8(0, 0x00);
      dv.setUint32(1, enc.byteLength, false);
      new Uint8Array(buf, 5).set(enc);

      const res = await fetch(
        'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/connect+json',
            'Connect-Protocol-Version': '1',
            Accept: '*/*',
            'X-Language': 'zh-CN',
            'X-Msh-Platform': 'web',
            Authorization: `Bearer ${kimiAuth}`,
          },
          body: buf,
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        return { ok: false as const, error: `Kimi API ${res.status}: ${errText.slice(0, 300)}` };
      }

      const arr = await res.arrayBuffer();
      const u8 = new Uint8Array(arr);
      const decoder = new TextDecoder();
      const texts: string[] = [];
      let o = 0;

      while (o + 5 <= u8.length) {
        const len = new DataView(u8.buffer, u8.byteOffset + o + 1, 4).getUint32(0, false);
        if (o + 5 + len > u8.length) break;

        const chunk = u8.slice(o + 5, o + 5 + len);
        try {
          const obj = JSON.parse(decoder.decode(chunk));
          if (obj.error) {
            return {
              ok: false as const,
              error: `Kimi RPC: ${obj.error.message ?? obj.error.code ?? JSON.stringify(obj.error).slice(0, 200)}`,
            };
          }
          if (obj.block?.text?.content && ['set', 'append'].includes(obj.op ?? '')) {
            texts.push(obj.block.text.content);
          }
          if (obj.done) break;
        } catch {}

        o += 5 + len;
      }

      return { ok: true as const, text: texts.join('') };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  })();
}
