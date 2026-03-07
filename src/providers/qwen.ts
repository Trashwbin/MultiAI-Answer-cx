import { mergeCredentials } from '../auth/token-manager';
import { parseAIResponse } from '../core/json-parser';
import type { AuthStatus, ProviderResponse, Question } from '../types';
import { proxyFetch } from '../utils/page-proxy';
import { BaseProvider } from './base-provider';

interface QwenCreateChatResponse {
  data?: {
    id?: string;
  };
}

export class QwenProvider extends BaseProvider {
  async checkAuth(): Promise<AuthStatus> {
    const token = await this.resolveToken();
    return token ? 'authenticated' : 'unauthenticated';
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const bearerToken = await this.resolveToken();
      if (!bearerToken) throw new Error('Qwen Intl: 未找到 token — 请先登录 chat.qwen.ai');
      const prompt = this.buildPrompt(question);
      const chatId = await this.createChat(bearerToken);

      const res = await proxyFetch(
        'chat.qwen.ai',
        'https://chat.qwen.ai/api/v2/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            chat_id: chatId,
            model: 'qwen-max-latest',
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Qwen API ${res.status}: ${res.body.slice(0, 300)}`);
      }

      console.log(`[QwenIntl] response (${res.body.length} chars): ${res.body.slice(0, 200)}`);

      const rawText = this.extractContent(res.body);
      if (!rawText) {
        throw new Error(`Qwen Intl: empty response body=${res.body.slice(0, 300)}`);
      }

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

  private extractContent(body: string): string {
    if (body.includes('data:')) {
      return this.parseSse(body);
    }
    try {
      const data = JSON.parse(body) as Record<string, unknown>;
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
      return choices?.[0]?.message?.content ?? '';
    } catch {
      return body;
    }
  }

  private parseSse(sse: string): string {
    let lastContent = '';
    const deltaParts: string[] = [];
    let usedAccumulated = false;

    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as Record<string, unknown>;

        const choices = data.choices as Array<{
          delta?: { content?: string };
          message?: { content?: string };
        }> | undefined;

        const msgContent = choices?.[0]?.message?.content;
        if (typeof msgContent === 'string' && msgContent) {
          lastContent = msgContent;
          usedAccumulated = true;
          continue;
        }

        const deltaContent = choices?.[0]?.delta?.content;
        if (typeof deltaContent === 'string') {
          deltaParts.push(deltaContent);
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

    if (usedAccumulated && lastContent) return lastContent;
    return deltaParts.join('');
  }

  private async resolveToken(): Promise<string> {
    try {
      const auth = await this.getAuth();
      const fromCreds = auth.cookies['token'] || auth.bearerToken || '';
      if (fromCreds) return fromCreds;
    } catch {}

    return this.readTokenFromPage();
  }

  private async readTokenFromPage(): Promise<string> {
    const tabId = await this.findProviderTab(['https://chat.qwen.ai/*']);
    if (tabId === undefined) return '';

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => localStorage.getItem('token') ?? '',
      });

      const token = (results[0]?.result as string) ?? '';
      if (token) {
        console.log(`[QwenIntl] token captured from page localStorage (${token.length} chars)`);
        await mergeCredentials(this.config.id, { cookies: { token } });
      }
      return token;
    } catch {
      return '';
    }
  }

  private async createChat(bearerToken: string): Promise<string> {
    const res = await proxyFetch('chat.qwen.ai', 'https://chat.qwen.ai/api/v2/chats/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ model: 'qwen-max-latest' }),
    });

    if (!res.ok) {
      throw new Error(`Qwen create chat ${res.status}: ${res.body.slice(0, 200)}`);
    }

    const data = JSON.parse(res.body) as QwenCreateChatResponse;
    const chatId = data.data?.id;
    if (!chatId) {
      throw new Error('Qwen chat id missing');
    }
    return chatId;
  }
}
