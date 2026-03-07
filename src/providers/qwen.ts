import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
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
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const bearerToken = auth.cookies['token'] ?? '';
      if (!bearerToken) throw new Error('Qwen Intl: 未找到 token — 请先登录 chat.qwen.ai');
      const prompt = this.buildPrompt(question);
      const chatId = await this.createChat(bearerToken);

      const completionRes = await fetch(
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

      if (!completionRes.ok) {
        const errorText = await completionRes.text();
        throw new Error(`Qwen API ${completionRes.status}: ${errorText.slice(0, 300)}`);
      }

      const data = (await completionRes.json()) as QwenCompletionResponse;
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

  private async createChat(bearerToken: string): Promise<string> {
    const res = await fetch('https://chat.qwen.ai/api/v2/chats/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({ model: 'qwen-max-latest' }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Qwen create chat ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as QwenCreateChatResponse;
    const chatId = data.data?.id;
    if (!chatId) {
      throw new Error('Qwen chat id missing');
    }
    return chatId;
  }
}
