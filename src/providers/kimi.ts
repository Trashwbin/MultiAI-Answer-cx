import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class KimiProvider extends BaseProvider {
  private async createConversation(bearerToken: string): Promise<string> {
    const res = await fetch('https://kimi.moonshot.cn/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        name: 'AI Answer',
        is_example: false,
        kimiplus_id: 'kimi',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Kimi create conversation ${res.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error('Kimi: conversation id missing');
    return data.id;
  }

  private parseSse(sse: string): string {
    const parts: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as { event?: string; text?: string };
        if (data.event === 'cmpl' && typeof data.text === 'string') {
          parts.push(data.text);
        }
      } catch {}
    }
    return parts.join('');
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const bearerToken = auth.bearerToken ?? auth.cookies['access_token'] ?? auth.cookies['kimi-auth'] ?? '';
      if (!bearerToken) throw new Error('Kimi: missing access_token — 请先登录 kimi.moonshot.cn');

      const prompt = this.buildPrompt(question);
      const conversationId = await this.createConversation(bearerToken);

      const res = await fetch(
        `https://kimi.moonshot.cn/api/chat/${conversationId}/completion/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            use_search: false,
            kimiplus_id: 'kimi',
            refs: [],
            refs_file: [],
          }),
        },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Kimi API ${res.status}: ${errorText.slice(0, 300)}`);
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
}
