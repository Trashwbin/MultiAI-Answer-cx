import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { createGroupedTab } from '../utils/tab-group';
import { BaseProvider } from './base-provider';

export class KimiProvider extends BaseProvider {
  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(questions);
      const tabId = await this.ensureKimiTab();

      const auth = await this.getAuth();
      const kimiAuth = auth.cookies['kimi-auth'] ?? '';

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: kimiConnectRpc,
        args: [prompt, kimiAuth, this.promptMode === 'analysis'],
      });

      const result = results[0]?.result as
        | { ok: true; text: string; chatId?: string }
        | { ok: false; error: string }
        | undefined;

      if (!result) throw new Error('Kimi: executeScript 无返回');
      if (!result.ok) throw new Error(result.error);

      const rawText = result.text;
      const parsed = parseAIResponse(rawText, this.config.id);
      const response = { ...parsed, rawText, cleanupSessionId: result.chatId };
      if ((parsed.answers.length > 0 || rawText.trim()) && result.chatId && this.sessionCleanupMode === 'on_success') {
        void this.deleteConversation(result.chatId).catch((err) => {
          console.warn('[Kimi] Auto cleanup failed:', err);
        });
      }
      return response;
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deleteConversation(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;

    const auth = await this.getAuth();
    const kimiAuth = auth.cookies['kimi-auth'] ?? auth.bearerToken ?? '';
    if (!kimiAuth) return false;

    const res = await fetch('https://www.kimi.com/apiv2/kimi.chat.v1.ChatService/DeleteChat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kimiAuth}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Origin: 'https://www.kimi.com',
        'R-Timezone': 'Asia/Shanghai',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Priority: 'u=1, i',
        'X-Msh-Platform': 'web',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({ chat_id: sessionId }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[Kimi] delete chat failed ${res.status}: ${errorText.slice(0, 200)}`);
      return false;
    }

    return true;
  }

  private async ensureKimiTab(): Promise<number> {
    for (const pattern of ['https://www.kimi.com/*', 'https://kimi.com/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await createGroupedTab({ url: 'https://www.kimi.com/', active: false });
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
  enableThinking: boolean,
): Promise<{ ok: true; text: string; chatId?: string } | { ok: false; error: string }> {
  return (async () => {
    try {
      const requestHeaders = {
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        Origin: 'https://www.kimi.com',
        'R-Timezone': 'Asia/Shanghai',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Priority: 'u=1, i',
        'X-Msh-Platform': 'web',
        'Connect-Protocol-Version': '1',
      };

      if (!kimiAuth) {
        const cookieMatch = document.cookie.match(/(?:^|;\s*)kimi-auth=([^;]+)/);
        kimiAuth = cookieMatch?.[1] ?? '';
      }
      if (!kimiAuth) {
        return { ok: false as const, error: 'Kimi: 未找到 kimi-auth Cookie — 请先登录 www.kimi.com' };
      }

      // SCENARIO_K2D5 = K2.5 model (current production).
      // chat_id / tools / parent_id are required fields per Chat2API reference.
      const req = {
        scenario: 'SCENARIO_K2D5',
        chat_id: '',
        tools: [],
        message: {
          parent_id: '',
          role: 'user',
          blocks: [{ message_id: '', text: { content: message } }],
          scenario: 'SCENARIO_K2D5',
        },
        options: { thinking: enableThinking },
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
            Authorization: `Bearer ${kimiAuth}`,
            'Content-Type': 'application/connect+json',
            'X-Language': 'zh-CN',
            ...requestHeaders,
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
      let realChatId = '';
      let currentPhase: 'thinking' | 'answer' | undefined = undefined;
      let o = 0;

      while (o + 5 <= u8.length) {
        const len = new DataView(u8.buffer, u8.byteOffset + o + 1, 4).getUint32(0, false);
        if (o + 5 + len > u8.length) break;

        const chunk = u8.slice(o + 5, o + 5 + len);
        try {
          const obj = JSON.parse(decoder.decode(chunk));
          if (!realChatId && typeof obj.chat?.id === 'string') {
            realChatId = obj.chat.id;
          }
          if (obj.error) {
            return {
              ok: false as const,
              error: `Kimi RPC: ${obj.error.message ?? obj.error.code ?? JSON.stringify(obj.error).slice(0, 200)}`,
            };
          }

          const stages = obj.block?.multiStage?.stages;
          if (Array.isArray(stages) && stages.length > 0) {
            const firstStage = stages[0];
            if (firstStage?.name === 'STAGE_NAME_THINKING') {
              currentPhase = firstStage.status === 'completed' ? 'answer' : 'thinking';
            }
          }

          if (obj.block?.text?.flags === 'thinking') {
            currentPhase = 'thinking';
          } else if (obj.block?.text?.flags === 'answer') {
            currentPhase = 'answer';
          }

          const mask = typeof obj.mask === 'string' ? obj.mask : '';
          if (mask.includes('block.think')) {
            currentPhase = 'thinking';
          } else if (mask.includes('block.text')) {
            currentPhase = 'answer';
          }

          if (obj.block?.text?.content && ['set', 'append'].includes(obj.op ?? '')) {
            const content = obj.block.text.content;
            if (!enableThinking || currentPhase !== 'thinking') {
              texts.push(content);
            }
          }
          if (obj.done) break;
        } catch {}

        o += 5 + len;
      }

      return { ok: true as const, text: texts.join(''), chatId: realChatId };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  })();
}
