import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { proxyFetch } from '../utils/page-proxy';
import { BaseProvider } from './base-provider';

/**
 * Doubao Samantha API SSE format (triple-nested JSON):
 *   event_type 2001 → event_data → message.content → {text}
 *   event_type 2003 → end
 *   event_type 2005 → error (rate limit / captcha)
 *
 * Reference: openclaw-zero-token/src/providers/doubao-web-client.ts:473-497
 */
export class DoubaoProvider extends BaseProvider {
  private parseSamanthaSse(sse: string): string {
    const chunks: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!jsonStr || jsonStr === '[DONE]') continue;
      try {
        const raw = JSON.parse(jsonStr) as {
          event_type?: number;
          event_data?: string;
          code?: number;
        };

        if (raw.code != null && raw.code !== 0) continue;

        if (raw.event_type === 2005 && raw.event_data) {
          const errData = JSON.parse(raw.event_data) as {
            code?: number;
            message?: string;
            error_detail?: { message?: string };
          };
          const msg = errData.error_detail?.message ?? errData.message ?? `code ${errData.code}`;
          throw new Error(`Doubao 风控拦截: ${msg}`);
        }

        if (raw.event_type === 2003) continue;
        if (raw.event_type !== 2001 || !raw.event_data) continue;

        const result = JSON.parse(raw.event_data) as {
          message?: { content?: string; content_type?: number };
          is_finish?: boolean;
        };
        if (result.is_finish) continue;

        const message = result.message;
        if (!message || ![2001, 2008].includes(message.content_type ?? 0) || !message.content) {
          continue;
        }

        const content = JSON.parse(message.content) as { text?: string };
        if (content.text) chunks.push(content.text);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Doubao 风控')) throw e;
      }
    }
    return chunks.join('');
  }

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);

      const url =
        'https://www.doubao.com/samantha/chat/completion?aid=497858&device_platform=web&language=zh&pkg_type=release_version&real_aid=497858&region=CN&samantha_web=1&sys_region=CN&use_olympus_account=1&version_code=20800';

      const body = JSON.stringify({
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
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Referer: 'https://www.doubao.com/chat/',
        Origin: 'https://www.doubao.com',
        'Agw-js-conv': 'str',
      };

      const cookieHeader = this.buildCookieHeader(auth.cookies);
      if (cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      const res = await proxyFetch('www.doubao.com', url, {
        method: 'POST',
        headers,
        body,
      });

      if (!res.ok) {
        throw new Error(`Doubao API ${res.status}: ${res.body.slice(0, 300)}`);
      }

      const rawText = this.parseSamanthaSse(res.body);
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
