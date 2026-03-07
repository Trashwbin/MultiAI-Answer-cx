import { parseAIResponse } from '../core/json-parser';
import { getCredentials } from '../auth/token-manager';
import type { AuthCredentials, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface DeepSeekPowChallenge {
  algorithm?: string;
  challenge?: string;
  difficulty?: number;
  salt?: string;
  signature?: string;
  expire_at?: number;
  expire_after?: number;
}

interface DeepSeekWasmExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  __wbindgen_export_0: (a: number, b: number) => number;
  __wbindgen_add_to_stack_pointer: (a: number) => number;
  wasm_solve: (
    retptr: number,
    ptrC: number,
    lenC: number,
    ptrP: number,
    lenP: number,
    difficulty: number,
  ) => void;
}

interface DeepSeekPowEnvelope {
  challenge?: DeepSeekPowChallenge;
  data?: {
    challenge?: DeepSeekPowChallenge;
    biz_data?: {
      challenge?: DeepSeekPowChallenge;
    };
  };
}

export class DeepSeekProvider extends BaseProvider {
  private buildDeepSeekHeaders(auth: AuthCredentials): Record<string, string> {
    const bearer = auth.bearerToken ?? '';
    return {
      'Content-Type': 'application/json',
      Accept: '*/*',
      Cookie: this.buildCookieHeader(auth.cookies),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      Referer: 'https://chat.deepseek.com/',
      Origin: 'https://chat.deepseek.com',
      'x-client-platform': 'web',
      'x-client-version': '1.7.0',
      'x-app-version': '20241129.1',
      'x-client-locale': 'zh_CN',
      'x-client-timezone-offset': '28800',
    };
  }

  private async resolveBearer(auth: AuthCredentials): Promise<void> {
    if (auth.bearerToken) return;

    const fromCookie = auth.cookies['userToken'] ?? auth.cookies['access_token'] ?? '';
    if (fromCookie) {
      auth.bearerToken = fromCookie;
      return;
    }

    console.log('[DeepSeek] No Bearer found, opening background tab to capture...');
    const tab = await chrome.tabs.create({
      url: 'https://chat.deepseek.com/',
      active: false,
    });

    try {
      const bearer = await this.waitForBearer(15_000);
      auth.bearerToken = bearer;
      console.log('[DeepSeek] Bearer captured via background tab');
    } finally {
      if (tab.id !== undefined) {
        chrome.tabs.remove(tab.id).catch(() => {});
      }
    }
  }

  private waitForBearer(timeoutMs: number): Promise<string> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const poll = async () => {
        const creds = await getCredentials(this.config.id);
        if (creds?.bearerToken) {
          resolve(creds.bearerToken);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(
            new Error(
              'DeepSeek: Bearer token 捕获超时 — 请确认已登录 chat.deepseek.com',
            ),
          );
          return;
        }
        setTimeout(poll, 500);
      };
      setTimeout(poll, 2000);
    });
  }

  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      await this.resolveBearer(auth);
      const prompt = this.buildPrompt(questions);
      const sessionId = await this.createChatSession(auth);
      const challenge = await this.createPowChallenge(auth);
      const answer = await this.solvePow(challenge);

      const powResponseData: Record<string, unknown> = {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        difficulty: challenge.difficulty,
        signature: challenge.signature,
        target_path: '/api/v0/chat/completion',
        answer,
      };
      if (challenge.expire_at !== undefined) {
        powResponseData['expire_at'] = challenge.expire_at;
      }
      if (challenge.expire_after !== undefined) {
        powResponseData['expire_after'] = challenge.expire_after;
      }
      const powHeader = btoa(JSON.stringify(powResponseData));

      const res = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
        method: 'POST',
        headers: {
          ...this.buildDeepSeekHeaders(auth),
          Accept: 'text/event-stream',
          'x-ds-pow-response': powHeader,
        },
        body: JSON.stringify({
          chat_session_id: sessionId,
          prompt,
          ref_file_ids: [],
          thinking_enabled: false,
          search_enabled: false,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`DeepSeek API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const text = await res.text();
      const rawText = this.parseSseText(text);
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

  private async createPowChallenge(auth: AuthCredentials): Promise<DeepSeekPowChallenge> {
    const res = await fetch('https://chat.deepseek.com/api/v0/chat/create_pow_challenge', {
      method: 'POST',
      headers: this.buildDeepSeekHeaders(auth),
      body: JSON.stringify({ target_path: '/api/v0/chat/completion' }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepSeek PoW challenge failed: ${res.status} ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as DeepSeekPowEnvelope;
    console.log('[DeepSeek] create_pow_challenge response:', data);
    const challenge = data.data?.biz_data?.challenge ?? data.data?.challenge ?? data.challenge;
    if (!challenge?.challenge || challenge.difficulty === undefined) {
      throw new Error('DeepSeek PoW challenge payload is missing required fields');
    }

    return {
      algorithm: challenge.algorithm ?? 'sha256',
      challenge: challenge.challenge,
      difficulty: challenge.difficulty,
      salt: challenge.salt,
      signature: challenge.signature,
      expire_at: challenge.expire_at,
      expire_after: challenge.expire_after,
    };
  }

  private async createChatSession(auth: AuthCredentials): Promise<string> {
    const res = await fetch('https://chat.deepseek.com/api/v0/chat_session/create', {
      method: 'POST',
      headers: this.buildDeepSeekHeaders(auth),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepSeek session create ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      data?: { biz_data?: { id?: string; chat_session_id?: string } };
      id?: string;
      chat_session_id?: string;
    };
    console.log('[DeepSeek] createChatSession response:', JSON.stringify(data).slice(0, 500));
    const sessionId =
      data.data?.biz_data?.id ??
      data.data?.biz_data?.chat_session_id ??
      data.id ??
      data.chat_session_id ??
      '';
    if (!sessionId) {
      throw new Error('DeepSeek: chat session id missing — API 返回了意外的响应格式');
    }
    return sessionId;
  }

  private wasmInstance: WebAssembly.Instance | null = null;

  private async getWasmInstance(): Promise<WebAssembly.Instance> {
    if (this.wasmInstance) return this.wasmInstance;
    const { DEEPSEEK_HASH_WASM_B64 } = await import('./deepseek-pow-wasm');
    const binaryStr = atob(DEEPSEEK_HASH_WASM_B64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const { instance } = await WebAssembly.instantiate(bytes, { wbg: {} });
    this.wasmInstance = instance;
    return instance;
  }

  private async solvePow(challenge: DeepSeekPowChallenge): Promise<number> {
    const { algorithm, challenge: target, salt, difficulty, expire_at } = challenge;
    if (!target || difficulty === undefined) {
      throw new Error('DeepSeek PoW: missing challenge or difficulty');
    }
    console.log(`[DeepSeek] Solving PoW (${algorithm}, difficulty: ${difficulty})...`);

    if (algorithm === 'sha256') {
      return this.solvePowSha256(target, difficulty, salt);
    }

    if (algorithm === 'DeepSeekHashV1') {
      return this.solvePowWasm(target, difficulty, salt ?? '', expire_at);
    }

    throw new Error(`DeepSeek: unsupported PoW algorithm "${algorithm}"`);
  }

  private async solvePowSha256(target: string, difficulty: number, salt?: string): Promise<number> {
    const start = Date.now();
    const targetDifficulty = difficulty > 1000 ? Math.floor(Math.log2(difficulty)) : difficulty;
    const encoder = new TextEncoder();

    for (let nonce = 0; nonce < 1_000_000; nonce++) {
      const input = encoder.encode(`${salt ?? ''}${target}${nonce}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', input);
      const hashBytes = new Uint8Array(hashBuffer);

      let zeroBits = 0;
      for (const byte of hashBytes) {
        if (byte === 0) {
          zeroBits += 8;
        } else {
          zeroBits += Math.clz32(byte) - 24;
          break;
        }
      }

      if (zeroBits >= targetDifficulty) {
        console.log(`[DeepSeek] SHA256 PoW solved in ${Date.now() - start}ms, nonce: ${nonce}`);
        return nonce;
      }
    }

    throw new Error('DeepSeek SHA256 PoW: exceeded 1M iterations');
  }

  private async solvePowWasm(
    target: string,
    difficulty: number,
    salt: string,
    expireAt?: number,
  ): Promise<number> {
    const instance = await this.getWasmInstance();
    const exports = instance.exports as unknown as DeepSeekWasmExports;
    const { memory, __wbindgen_export_0: alloc, __wbindgen_add_to_stack_pointer: addToStack, wasm_solve: wasmSolve } = exports;

    const prefix = `${salt}_${expireAt ?? ''}_`;
    const challengeStr = target;

    const encodeString = (str: string): [number, number] => {
      const buf = new TextEncoder().encode(str);
      const ptr = alloc(buf.length, 1);
      new Uint8Array(memory.buffer).set(buf, ptr);
      return [ptr, buf.length];
    };

    const [ptrC, lenC] = encodeString(challengeStr);
    const [ptrP, lenP] = encodeString(prefix);
    const retptr = addToStack(-16);

    const start = Date.now();
    wasmSolve(retptr, ptrC, lenC, ptrP, lenP, difficulty);
    const elapsed = Date.now() - start;

    const view = new DataView(memory.buffer);
    const status = view.getInt32(retptr, true);
    const answer = view.getFloat64(retptr + 8, true);
    addToStack(16);

    if (status === 0) {
      throw new Error('DeepSeekHashV1: WASM solver failed to find solution');
    }

    console.log(`[DeepSeek] DeepSeekHashV1 solved in ${elapsed}ms, answer: ${answer}`);
    return answer;
  }

  private parseSseText(sse: string): string {
    const parts: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as Record<string, unknown>;

        // 1. Initial fragments: {"v":{"response":{"fragments":[{"content":"..."}]}}}
        const resp = (data.v as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
        const fragments = resp?.fragments as Array<{ type?: string; content?: string }> | undefined;
        if (Array.isArray(fragments)) {
          for (const frag of fragments) {
            if (typeof frag.content === 'string') {
              parts.push(frag.content);
            }
          }
          continue;
        }

        // 2. String value with content/choices path or no path:
        //    {"v":"text"} or {"p":"response/fragments/-1/content","o":"APPEND","v":"text"}
        const p = data.p as string | undefined;
        if (typeof data.v === 'string' && (!p || p.includes('content') || p.includes('choices'))) {
          parts.push(data.v as string);
          continue;
        }

        // 3. OpenAI-like choices fallback: {"choices":[{"delta":{"content":"..."}}]}
        const choices = data.choices as Array<{ delta?: { content?: string } }> | undefined;
        const delta = choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          parts.push(delta);
        }
      } catch {
      }
    }
    return parts.join('');
  }
}
