import { parseAIResponse } from '../core/json-parser';
import type {
  AuthStatus,
  CustomProviderConfig,
  ProviderResponse,
  Question,
} from '../types';
import { BaseProvider } from './base-provider';

interface OpenAIChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
}

export class OpenAICompatibleProvider extends BaseProvider {
  async checkAuth(): Promise<AuthStatus> {
    return 'authenticated';
  }

  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const customConfig = this.config as CustomProviderConfig;
      const prompt = this.buildPrompt(questions);
      const endpoint = `${customConfig.apiEndpoint.replace(/\/+$/, '')}/v1/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (customConfig.apiKey.trim()) {
        headers.Authorization = `Bearer ${customConfig.apiKey}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: customConfig.modelName,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI-compatible API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const text = await res.text();
      const rawText = text.includes('data:')
        ? this.parseSseText(text)
        : this.parseJsonResponse(text);
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

  private parseSseText(text: string): string {
    const parts: string[] = [];

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const data = JSON.parse(payload) as OpenAIChatCompletionChunk;
        const deltaContent = data.choices?.[0]?.delta?.content;
        if (typeof deltaContent === 'string') {
          parts.push(deltaContent);
        }
      } catch {
      }
    }

    return parts.join('');
  }

  private parseJsonResponse(text: string): string {
    const data = JSON.parse(text) as OpenAIChatCompletionResponse;
    const errorMessage = data.error?.message;
    if (typeof errorMessage === 'string' && errorMessage.length > 0) {
      throw new Error(errorMessage);
    }

    const content = data.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }
}
