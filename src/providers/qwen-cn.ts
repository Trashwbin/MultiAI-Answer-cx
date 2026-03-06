import { captureCookies } from '../auth/cookie-capture';
import { getCredentials, saveCredentials } from '../auth/token-manager';
import { parseAIResponse } from '../core/json-parser';
import type { AuthStatus, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

const CREDENTIAL_TTL_MS = 86_400_000;

export class QwenCnProvider extends BaseProvider {
  private deviceId = crypto.randomUUID();

  async checkAuth(): Promise<AuthStatus> {
    try {
      const stored = await getCredentials(this.config.id);
      if (stored && this.hasQwenCnAuthCookie(stored.cookies)) {
        return 'authenticated';
      }

      const cookies = await captureCookies(this.config.id, this.config.domain);
      if (this.hasQwenCnAuthCookie(cookies)) {
        await saveCredentials(this.config.id, {
          cookies,
          expiresAt: Date.now() + CREDENTIAL_TTL_MS,
        });
        return 'authenticated';
      }

      return 'unauthenticated';
    } catch {
      return 'error';
    }
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);
      const cookie = this.buildCookieHeader(auth.cookies);
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const ut = auth.cookies['b-user-id'] ?? '';
      if (!ut) {
        throw new Error(
          '通义千问: 缺少 b-user-id cookie — 请先访问 www.qianwen.com 并登录',
        );
      }
      const xsrfToken = auth.cookies['XSRF-TOKEN'] ?? '';

      const url = new URL('https://chat2.qianwen.com/api/v2/chat');
      url.searchParams.set('biz_id', 'ai_qwen');
      url.searchParams.set('chat_client', 'h5');
      url.searchParams.set('device', 'pc');
      url.searchParams.set('fr', 'pc');
      url.searchParams.set('pr', 'qwen');
      url.searchParams.set('nonce', nonce);
      url.searchParams.set('timestamp', timestamp);
      url.searchParams.set('ut', ut);

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, text/plain, */*',
          Cookie: cookie,
          'x-xsrf-token': xsrfToken,
          'x-deviceid': this.deviceId,
          'x-platform': 'pc_tongyi',
        },
        body: JSON.stringify({
          model: 'Qwen3.5-Plus',
          messages: [
            {
              content: prompt,
              mime_type: 'text/plain',
              meta_data: { ori_query: prompt },
            },
          ],
          session_id: this.generateSessionId(),
          parent_req_id: '0',
          deep_search: '0',
          req_id: `req-${crypto.randomUUID()}`,
          scene: 'chat',
          sub_scene: 'chat',
          temporary: false,
          from: 'default',
          scene_param: 'first_turn',
          chat_client: 'h5',
          client_tm: timestamp,
          protocol_version: 'v2',
          biz_id: 'ai_qwen',
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Qwen CN API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const sse = await res.text();
      const rawText = this.parseSse(sse);
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

  private hasQwenCnAuthCookie(cookies: Record<string, string>): boolean {
    return Boolean(cookies.tongyi_sso_ticket || cookies.login_aliyunid_ticket);
  }

  private generateSessionId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  private parseSse(sse: string): string {
    let lastContent = '';
    let deltaParts: string[] = [];
    let usedAccumulated = false;

    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as Record<string, unknown>;

        // Qwen CN primary format: data.data.messages[].content (accumulated full text)
        const innerData = data.data;
        if (innerData && typeof innerData === 'object') {
          const inner = innerData as Record<string, unknown>;
          const messages = inner.messages;
          if (Array.isArray(messages)) {
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i] as Record<string, unknown> | undefined;
              if (msg && typeof msg.content === 'string' && msg.content) {
                lastContent = msg.content;
                usedAccumulated = true;
                break;
              }
            }
            if (usedAccumulated) continue;
          }
        }

        // Delta-based fallback formats
        const choiceDelta = ((data.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0])?.delta?.content;
        if (typeof choiceDelta === 'string') {
          deltaParts.push(choiceDelta);
          continue;
        }

        const text =
          (typeof data.text === 'string' ? data.text : undefined) ??
          (typeof data.content === 'string' ? data.content : undefined);
        if (typeof text === 'string') {
          deltaParts.push(text);
        }
      } catch {}
    }

    // If we found accumulated content, use the last one (it's the full text)
    if (usedAccumulated && lastContent) {
      return lastContent;
    }

    // Otherwise join deltas
    return deltaParts.join('');
  }
}
