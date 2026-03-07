import { captureAllCookies } from '../auth/cookie-capture';
import { parseAIResponse } from '../core/json-parser';
import type { AuthStatus, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

const SIGN_SECRET = '8a1317a7468aa3ad86e997d08f3f31cb';
const X_EXP_GROUPS =
  'na_android_config:exp:NA,na_4o_config:exp:4o_A,tts_config:exp:tts_config_a,' +
  'na_glm4plus_config:exp:open,mainchat_server_app:exp:A,mobile_history_daycheck:exp:a,' +
  'desktop_toolbar:exp:A,chat_drawing_server:exp:A,drawing_server_cogview:exp:cogview4,' +
  'app_welcome_v2:exp:A,chat_drawing_streamv2:exp:A,mainchat_rm_fc:exp:add,' +
  'mainchat_dr:exp:open,chat_auto_entrance:exp:A,drawing_server_hi_dream:control:A,' +
  'homepage_square:exp:close,assistant_recommend_prompt:exp:3,app_home_regular_user:exp:A,' +
  'memory_common:exp:enable,mainchat_moe:exp:300,assistant_greet_user:exp:greet_user,' +
  'app_welcome_personalize:exp:A,assistant_model_exp_group:exp:glm4.5,ai_wallet:exp:ai_wallet_enable';

export class ChatGLMProvider extends BaseProvider {
  private deviceId = crypto.randomUUID();

  async checkAuth(): Promise<AuthStatus> {
    try {
      const allCookies = await captureAllCookies(this.config.id, this.config.domain);
      const hasRefresh = !!allCookies['chatglm_refresh_token'];
      const hasAccess = !!allCookies['chatglm_token'];

      if (!hasRefresh && !hasAccess) return 'unauthenticated';
      if (hasRefresh) return 'authenticated';

      const expiresRaw = allCookies['chatglm_token_expires'] ?? '';
      if (expiresRaw) {
        const expiresMs = new Date(decodeURIComponent(expiresRaw)).getTime();
        if (!isNaN(expiresMs) && Date.now() > expiresMs) return 'unauthenticated';
      }
      return 'authenticated';
    } catch {
      return 'error';
    }
  }

  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(questions);
      const tabId = await this.ensureChatGLMTab();
      const signData = createSign();
      const requestId = crypto.randomUUID();

      const auth = await this.getAuth();
      const accessTokenSW = auth.cookies['chatglm_token'] ?? '';
      const refreshTokenSW = auth.cookies['chatglm_refresh_token'] ?? '';

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: chatglmPageQuery,
        args: [prompt, signData, this.deviceId, requestId, X_EXP_GROUPS, accessTokenSW, refreshTokenSW],
      });

      const result = results[0]?.result as
        | { ok: true; text: string }
        | { ok: false; error: string }
        | undefined;

      if (!result) throw new Error('ChatGLM: executeScript 无返回');
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

  private async ensureChatGLMTab(): Promise<number> {
    for (const pattern of ['https://chatglm.cn/*', 'https://www.chatglm.cn/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({ url: 'https://chatglm.cn/', active: false });
    if (tab.id === undefined) throw new Error('ChatGLM: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('ChatGLM: tab 加载超时'));
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

function chatglmPageQuery(
  prompt: string,
  signData: { sign: string; nonce: string; timestamp: string },
  deviceId: string,
  requestId: string,
  xExpGroups: string,
  accessTokenFromSW: string,
  refreshTokenFromSW: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return (async () => {
    try {
      const cookieAccess = document.cookie.match(/(?:^|;\s*)chatglm_token=([^;]+)/)?.[1] ?? '';
      const cookieRefresh = document.cookie.match(/(?:^|;\s*)chatglm_refresh_token=([^;]+)/)?.[1] ?? '';
      const cookieExpires = document.cookie.match(/(?:^|;\s*)chatglm_token_expires=([^;]+)/)?.[1] ?? '';

      let accessToken = accessTokenFromSW || cookieAccess;
      const refreshToken = refreshTokenFromSW || cookieRefresh;

      if (!accessToken && !refreshToken) {
        return { ok: false as const, error: 'ChatGLM: 未找到登录凭证 — 请先登录 chatglm.cn' };
      }

      let needsRefresh = !accessToken;
      if (accessToken && cookieExpires) {
        const expiresMs = new Date(decodeURIComponent(cookieExpires)).getTime();
        if (!isNaN(expiresMs) && Date.now() > expiresMs) needsRefresh = true;
      }

      if (needsRefresh && refreshToken) {
        const refreshRes = await fetch('https://chatglm.cn/chatglm/user-api/user/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${refreshToken}`,
            'App-Name': 'chatglm',
            'X-App-Platform': 'pc',
            'X-App-Version': '0.0.1',
            'X-App-Fr': 'browser_extension',
            'X-Lang': 'zh',
            'X-Device-Brand': '',
            'X-Device-Model': '',
            'X-Device-Id': deviceId.replace(/-/g, ''),
            'X-Request-Id': crypto.randomUUID().replace(/-/g, ''),
            'X-Sign': signData.sign,
            'X-Nonce': signData.nonce,
            'X-Timestamp': signData.timestamp,
          },
          body: '{}',
          credentials: 'include',
        });

        if (!refreshRes.ok) {
          const errText = await refreshRes.text();
          return { ok: false as const, error: `ChatGLM token 刷新失败 ${refreshRes.status}: ${errText.slice(0, 200)}` };
        }

        const refreshData = await refreshRes.json() as { result?: { access_token?: string } };
        accessToken = refreshData?.result?.access_token ?? '';
        if (!accessToken) {
          return { ok: false as const, error: 'ChatGLM: token 刷新响应无 access_token' };
        }
      }

      if (!accessToken) {
        return { ok: false as const, error: 'ChatGLM: 无可用 access_token — 请重新登录 chatglm.cn' };
      }

      const res = await fetch('https://chatglm.cn/chatglm/backend-api/assistant/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${accessToken}`,
          'App-Name': 'chatglm',
          'X-App-Platform': 'pc',
          'X-App-Version': '0.0.1',
          'X-Device-Id': deviceId,
          'X-Lang': 'zh',
          'X-Request-Id': requestId,
          'X-Sign': signData.sign,
          'X-Nonce': signData.nonce,
          'X-Timestamp': signData.timestamp,
          'X-Exp-Groups': xExpGroups,
          'X-App-fr': 'default',
          'X-Device-Brand': '',
          'X-Device-Model': '',
        },
        body: JSON.stringify({
          assistant_id: '65940acff94777010aa6b796',
          conversation_id: '',
          project_id: '',
          chat_type: 'user_chat',
          meta_data: {
            cogview: { rm_label_watermark: false },
            is_test: false,
            input_question_type: 'xxxx',
            channel: '',
            draft_id: '',
            chat_mode: 'zero',
            is_networking: false,
            quote_log_id: '',
            platform: 'pc',
          },
          messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { ok: false as const, error: `ChatGLM API ${res.status}: ${errText.slice(0, 300)}` };
      }

      // ChatGLM SSE: each event contains the FULL accumulated text (not a delta).
      // We keep only the last (most complete) value.
      const sse = await res.text();
      let lastText = '';
      for (const line of sse.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const obj = JSON.parse(payload);
          let text = '';

          if (Array.isArray(obj.parts)) {
            for (const part of obj.parts) {
              if (part && Array.isArray(part.content)) {
                for (const c of part.content) {
                  if (c?.type === 'text' && typeof c.text === 'string') {
                    text = c.text;
                    break;
                  }
                }
              }
              if (text) break;
            }
          }

          if (!text && obj.data && typeof obj.data === 'object') {
            const dpParts = obj.data.parts;
            if (Array.isArray(dpParts) && dpParts[0]?.content) {
              text = typeof dpParts[0].content === 'string' ? dpParts[0].content : '';
            }
          }

          if (!text) {
            text = (typeof obj.text === 'string' ? obj.text : '') ||
                   (typeof obj.content === 'string' ? obj.content : '') ||
                   (typeof obj.delta === 'string' ? obj.delta : '');
          }

          if (text) lastText = text;
        } catch {}
      }

      return { ok: true as const, text: lastText };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  })();
}

function createSign(): { timestamp: string; nonce: string; sign: string } {
  const now = Date.now();
  const raw = now.toString();
  const len = raw.length;
  const digits = raw.split('').map((char) => Number(char));
  const sumWithoutPenultimate = digits.reduce((acc, num) => acc + num, 0) - (digits[len - 2] ?? 0);
  const replacement = sumWithoutPenultimate % 10;
  const timestamp = raw.substring(0, len - 2) + replacement + raw.substring(len - 1);
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const sign = md5(`${timestamp}-${nonce}-${SIGN_SECRET}`);
  return { timestamp, nonce, sign };
}

type Md5Index = 0 | 1 | 2 | 3;
type Md5State = [number, number, number, number];

function md5(input: string): string {
  const state: Md5State = [1732584193, -271733879, -1732584194, 271733878];
  const data = toWords(input);
  for (let i = 0; i < data.length; i += 16) {
    const old: Md5State = [state[0], state[1], state[2], state[3]];

    ff(state, 0, 1, 2, 3, data[i] ?? 0, 7, -680876936);
    ff(state, 3, 0, 1, 2, data[i + 1] ?? 0, 12, -389564586);
    ff(state, 2, 3, 0, 1, data[i + 2] ?? 0, 17, 606105819);
    ff(state, 1, 2, 3, 0, data[i + 3] ?? 0, 22, -1044525330);
    ff(state, 0, 1, 2, 3, data[i + 4] ?? 0, 7, -176418897);
    ff(state, 3, 0, 1, 2, data[i + 5] ?? 0, 12, 1200080426);
    ff(state, 2, 3, 0, 1, data[i + 6] ?? 0, 17, -1473231341);
    ff(state, 1, 2, 3, 0, data[i + 7] ?? 0, 22, -45705983);
    ff(state, 0, 1, 2, 3, data[i + 8] ?? 0, 7, 1770035416);
    ff(state, 3, 0, 1, 2, data[i + 9] ?? 0, 12, -1958414417);
    ff(state, 2, 3, 0, 1, data[i + 10] ?? 0, 17, -42063);
    ff(state, 1, 2, 3, 0, data[i + 11] ?? 0, 22, -1990404162);
    ff(state, 0, 1, 2, 3, data[i + 12] ?? 0, 7, 1804603682);
    ff(state, 3, 0, 1, 2, data[i + 13] ?? 0, 12, -40341101);
    ff(state, 2, 3, 0, 1, data[i + 14] ?? 0, 17, -1502002290);
    ff(state, 1, 2, 3, 0, data[i + 15] ?? 0, 22, 1236535329);

    gg(state, 0, 1, 2, 3, data[i + 1] ?? 0, 5, -165796510);
    gg(state, 3, 0, 1, 2, data[i + 6] ?? 0, 9, -1069501632);
    gg(state, 2, 3, 0, 1, data[i + 11] ?? 0, 14, 643717713);
    gg(state, 1, 2, 3, 0, data[i] ?? 0, 20, -373897302);
    gg(state, 0, 1, 2, 3, data[i + 5] ?? 0, 5, -701558691);
    gg(state, 3, 0, 1, 2, data[i + 10] ?? 0, 9, 38016083);
    gg(state, 2, 3, 0, 1, data[i + 15] ?? 0, 14, -660478335);
    gg(state, 1, 2, 3, 0, data[i + 4] ?? 0, 20, -405537848);
    gg(state, 0, 1, 2, 3, data[i + 9] ?? 0, 5, 568446438);
    gg(state, 3, 0, 1, 2, data[i + 14] ?? 0, 9, -1019803690);
    gg(state, 2, 3, 0, 1, data[i + 3] ?? 0, 14, -187363961);
    gg(state, 1, 2, 3, 0, data[i + 8] ?? 0, 20, 1163531501);
    gg(state, 0, 1, 2, 3, data[i + 13] ?? 0, 5, -1444681467);
    gg(state, 3, 0, 1, 2, data[i + 2] ?? 0, 9, -51403784);
    gg(state, 2, 3, 0, 1, data[i + 7] ?? 0, 14, 1735328473);
    gg(state, 1, 2, 3, 0, data[i + 12] ?? 0, 20, -1926607734);

    hh(state, 0, 1, 2, 3, data[i + 5] ?? 0, 4, -378558);
    hh(state, 3, 0, 1, 2, data[i + 8] ?? 0, 11, -2022574463);
    hh(state, 2, 3, 0, 1, data[i + 11] ?? 0, 16, 1839030562);
    hh(state, 1, 2, 3, 0, data[i + 14] ?? 0, 23, -35309556);
    hh(state, 0, 1, 2, 3, data[i + 1] ?? 0, 4, -1530992060);
    hh(state, 3, 0, 1, 2, data[i + 4] ?? 0, 11, 1272893353);
    hh(state, 2, 3, 0, 1, data[i + 7] ?? 0, 16, -155497632);
    hh(state, 1, 2, 3, 0, data[i + 10] ?? 0, 23, -1094730640);
    hh(state, 0, 1, 2, 3, data[i + 13] ?? 0, 4, 681279174);
    hh(state, 3, 0, 1, 2, data[i] ?? 0, 11, -358537222);
    hh(state, 2, 3, 0, 1, data[i + 3] ?? 0, 16, -722521979);
    hh(state, 1, 2, 3, 0, data[i + 6] ?? 0, 23, 76029189);
    hh(state, 0, 1, 2, 3, data[i + 9] ?? 0, 4, -640364487);
    hh(state, 3, 0, 1, 2, data[i + 12] ?? 0, 11, -421815835);
    hh(state, 2, 3, 0, 1, data[i + 15] ?? 0, 16, 530742520);
    hh(state, 1, 2, 3, 0, data[i + 2] ?? 0, 23, -995338651);

    ii(state, 0, 1, 2, 3, data[i] ?? 0, 6, -198630844);
    ii(state, 3, 0, 1, 2, data[i + 7] ?? 0, 10, 1126891415);
    ii(state, 2, 3, 0, 1, data[i + 14] ?? 0, 15, -1416354905);
    ii(state, 1, 2, 3, 0, data[i + 5] ?? 0, 21, -57434055);
    ii(state, 0, 1, 2, 3, data[i + 12] ?? 0, 6, 1700485571);
    ii(state, 3, 0, 1, 2, data[i + 3] ?? 0, 10, -1894986606);
    ii(state, 2, 3, 0, 1, data[i + 10] ?? 0, 15, -1051523);
    ii(state, 1, 2, 3, 0, data[i + 1] ?? 0, 21, -2054922799);
    ii(state, 0, 1, 2, 3, data[i + 8] ?? 0, 6, 1873313359);
    ii(state, 3, 0, 1, 2, data[i + 15] ?? 0, 10, -30611744);
    ii(state, 2, 3, 0, 1, data[i + 6] ?? 0, 15, -1560198380);
    ii(state, 1, 2, 3, 0, data[i + 13] ?? 0, 21, 1309151649);
    ii(state, 0, 1, 2, 3, data[i + 4] ?? 0, 6, -145523070);
    ii(state, 3, 0, 1, 2, data[i + 11] ?? 0, 10, -1120210379);
    ii(state, 2, 3, 0, 1, data[i + 2] ?? 0, 15, 718787259);
    ii(state, 1, 2, 3, 0, data[i + 9] ?? 0, 21, -343485551);

    state[0] = add32(state[0], old[0]);
    state[1] = add32(state[1], old[1]);
    state[2] = add32(state[2], old[2]);
    state[3] = add32(state[3], old[3]);
  }

  return wordsToHex(state);
}

function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return add32(rotateLeft(add32(add32(a, q), add32(x, t)), s), b);
}

function ff(state: Md5State, a: Md5Index, b: Md5Index, c: Md5Index, d: Md5Index, x: number, s: number, t: number): void {
  state[a] = cmn((state[b] & state[c]) | (~state[b] & state[d]), state[a], state[b], x, s, t);
}

function gg(state: Md5State, a: Md5Index, b: Md5Index, c: Md5Index, d: Md5Index, x: number, s: number, t: number): void {
  state[a] = cmn((state[b] & state[d]) | (state[c] & ~state[d]), state[a], state[b], x, s, t);
}

function hh(state: Md5State, a: Md5Index, b: Md5Index, c: Md5Index, d: Md5Index, x: number, s: number, t: number): void {
  state[a] = cmn(state[b] ^ state[c] ^ state[d], state[a], state[b], x, s, t);
}

function ii(state: Md5State, a: Md5Index, b: Md5Index, c: Md5Index, d: Md5Index, x: number, s: number, t: number): void {
  state[a] = cmn(state[c] ^ (state[b] | ~state[d]), state[a], state[b], x, s, t);
}

function rotateLeft(value: number, amount: number): number {
  return (value << amount) | (value >>> (32 - amount));
}

function add32(a: number, b: number): number {
  return (a + b) | 0;
}

function toWords(input: string): number[] {
  const utf8 = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i += 1) {
    const wordIndex = i >> 2;
    words[wordIndex] = (words[wordIndex] ?? 0) | ((utf8[i] ?? 0) << ((i % 4) * 8));
  }
  const bitLength = utf8.length * 8;
  const idx = utf8.length >> 2;
  words[idx] = (words[idx] ?? 0) | (0x80 << ((utf8.length % 4) * 8));
  const finalIndex = (((utf8.length + 8) >> 6) + 1) * 16;
  while (words.length < finalIndex) {
    words.push(0);
  }
  words[finalIndex - 2] = bitLength;
  return words;
}

function wordsToHex(state: Md5State): string {
  const hexParts: string[] = [];
  for (let i = 0; i < state.length; i += 1) {
    const value = state[i] ?? 0;
    for (let j = 0; j < 4; j += 1) {
      const byte = (value >>> (j * 8)) & 0xff;
      hexParts.push(byte.toString(16).padStart(2, '0'));
    }
  }
  return hexParts.join('');
}

