import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class ChatGPTProvider extends BaseProvider {
  async query(_question: Question): Promise<ProviderResponse> {
    return {
      providerId: this.config.id,
      answers: [],
      rawText: '',
      error:
        'ChatGPT 暂不支持 — chatgpt.com 需要 Sentinel 反机器人令牌，无法从扩展后台直接调用 API',
    };
  }

  /** Original direct-fetch implementation — kept for future page-injection migration */
  async queryDirect(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);

      const res = await fetch('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Cookie: this.buildCookieHeader(auth.cookies),
          ...(auth.bearerToken ? { Authorization: `Bearer ${auth.bearerToken}` } : {}),
          'oai-language': 'en-US',
        },
        body: JSON.stringify({
          action: 'next',
          messages: [
            {
              id: crypto.randomUUID(),
              author: { role: 'user' },
              content: { content_type: 'text', parts: [prompt] },
            },
          ],
          parent_message_id: crypto.randomUUID(),
          model: 'gpt-4o',
          timezone_offset_min: new Date().getTimezoneOffset(),
          history_and_training_disabled: false,
          conversation_mode: { kind: 'primary_assistant', plugin_ids: null },
          force_paragen: false,
          force_use_sse: true,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        const reason = await res.text();
        return {
          providerId: this.config.id,
          answers: [],
          rawText: '',
          error: `ChatGPT rejected request (${res.status}). Sentinel anti-bot likely blocked this request. ${reason.slice(0, 200)}`,
        };
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`ChatGPT API ${res.status}: ${errorText.slice(0, 300)}`);
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

  private parseSse(sse: string): string {
    const chunks: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload) as {
          message?: {
            content?: {
              parts?: string[];
            };
          };
        };
        const messagePart = data.message?.content?.parts?.[0];
        if (typeof messagePart === 'string') {
          chunks.push(messagePart);
        }
      } catch {}
    }
    return chunks.join('');
  }
}
