import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface KimiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class KimiProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);
      const res = await fetch('https://kimi.moonshot.cn/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(auth.bearerToken ? { Authorization: `Bearer ${auth.bearerToken}` } : {}),
          ...(Object.keys(auth.cookies).length > 0
            ? { Cookie: this.buildCookieHeader(auth.cookies) }
            : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          use_search: false,
          stream: false,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Kimi API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await res.json()) as KimiResponse;
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
}
