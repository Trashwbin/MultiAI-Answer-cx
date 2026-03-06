import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface GrokConversationResponse {
  conversationId?: string;
  id?: string;
}

interface GrokNdjsonLine {
  result?: {
    response?: {
      token?: string;
      modelResponse?: {
        message?: string;
      };
    };
  };
}

export class GrokProvider extends BaseProvider {
  async query(_question: Question): Promise<ProviderResponse> {
    return {
      providerId: this.config.id,
      answers: [],
      rawText: '',
      error: 'Grok 暂不支持 — grok.com 使用 Cloudflare 保护，无法从扩展后台直接调用 API',
    };
  }

  async queryDirect(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);
      const cookie = this.buildCookieHeader(auth.cookies);
      const conversationId = await this.createConversation(cookie);

      const responseRes = await fetch(
        `https://grok.com/rest/app-chat/conversations/${conversationId}/responses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson, application/json',
            Cookie: cookie,
          },
          body: JSON.stringify({
            message: prompt,
            modelName: 'grok-3',
            returnSearchResults: false,
            returnCitations: false,
          }),
        },
      );

      if (!responseRes.ok) {
        const errorText = await responseRes.text();
        throw new Error(`Grok API ${responseRes.status}: ${errorText.slice(0, 300)}`);
      }

      const ndjson = await responseRes.text();
      const rawText = this.parseNdjson(ndjson);
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

  private async createConversation(cookie: string): Promise<string> {
    const res = await fetch('https://grok.com/rest/app-chat/conversations/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Grok create conversation ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as GrokConversationResponse;
    const conversationId = data.conversationId ?? data.id;
    if (!conversationId) {
      throw new Error('Grok conversationId missing');
    }
    return conversationId;
  }

  private parseNdjson(ndjson: string): string {
    let finalMessage = '';
    const tokens: string[] = [];

    for (const line of ndjson.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as GrokNdjsonLine;
        const message = obj.result?.response?.modelResponse?.message;
        if (typeof message === 'string' && message.length > 0) {
          finalMessage = message;
        }
        const token = obj.result?.response?.token;
        if (typeof token === 'string') {
          tokens.push(token);
        }
      } catch {
      }
    }

    if (finalMessage) return finalMessage;
    return tokens.join('');
  }
}
