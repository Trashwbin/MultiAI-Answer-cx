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

interface QwenCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
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
        `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${encodeURIComponent(chatId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            model: 'qwen-max-latest',
            messages: [{ role: 'user', content: prompt }],
            stream: false,
          }),
        },
      );

      if (!res.ok) {
        throw new Error(`Qwen API ${res.status}: ${res.body.slice(0, 300)}`);
      }

      const data = JSON.parse(res.body) as QwenCompletionResponse;
      const rawText = data.choices?.[0]?.message?.content ?? '';
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
