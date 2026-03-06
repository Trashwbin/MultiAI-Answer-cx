import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class DoubaoProvider extends BaseProvider {
  private parseSse(sse: string): string {
    const parts: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as {
          text?: string;
          content?: string;
          delta?: string;
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const text =
          data.choices?.[0]?.delta?.content ??
          data.choices?.[0]?.message?.content ??
          data.text ??
          data.content ??
          data.delta;
        if (typeof text === 'string') parts.push(text);
      } catch {}
    }
    return parts.join('');
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);

      const res = await fetch(
        'https://www.doubao.com/samantha/chat/completion?aid=497858&device_platform=web&language=zh&pkg_type=release_version&real_aid=497858&region=CN&samantha_web=1&sys_region=CN&use_olympus_account=1&version_code=20800',
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Cookie: this.buildCookieHeader(auth.cookies),
          Referer: 'https://www.doubao.com/chat/',
          Origin: 'https://www.doubao.com',
          'Agw-js-conv': 'str',
        },
        body: JSON.stringify({
          messages: [
            {
              content: JSON.stringify({ text: `<|im_start|>user\n${prompt}<|im_end|>\n` }),
              content_type: 2001,
              attachments: [],
              references: [],
            },
          ],
          completion_option: {
            is_regen: false,
            with_suggest: true,
            need_create_conversation: true,
            launch_stage: 1,
            is_replace: false,
            is_delete: false,
            message_from: 0,
            event_id: '0',
          },
          conversation_id: '0',
          local_conversation_id: `local_16${Date.now().toString()}`,
          local_message_id: crypto.randomUUID(),
        }),
      },
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Doubao API ${res.status}: ${errorText.slice(0, 300)}`);
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
