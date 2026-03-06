import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface DoubaoResponse {
  data?: {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export class DoubaoProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);

      const res = await fetch('https://www.doubao.com/samantha/chat/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Cookie: this.buildCookieHeader(auth.cookies),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          model: 'doubao-pro-32k',
          stream: false,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Doubao API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await res.json()) as DoubaoResponse;
      const rawText =
        data.data?.choices?.[0]?.message?.content ?? data.choices?.[0]?.message?.content ?? '';
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
