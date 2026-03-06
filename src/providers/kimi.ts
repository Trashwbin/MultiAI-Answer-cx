import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class KimiProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const bearerToken = auth.bearerToken ?? auth.cookies['kimi-auth'] ?? '';
      if (!bearerToken) throw new Error('Kimi: 缺少 kimi-auth — 请先登录 www.kimi.com');

      const prompt = this.buildPrompt(question);
      const req = {
        scenario: 'SCENARIO_K2',
        message: {
          role: 'user' as const,
          blocks: [{ message_id: '', text: { content: prompt } }],
          scenario: 'SCENARIO_K2',
        },
        options: { thinking: false },
      };
      const enc = new TextEncoder().encode(JSON.stringify(req));
      const buf = new ArrayBuffer(5 + enc.byteLength);
      const dv = new DataView(buf);
      dv.setUint8(0, 0x00);
      dv.setUint32(1, enc.byteLength, false);
      new Uint8Array(buf, 5).set(enc);

      const res = await fetch('https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/connect+json',
          'Connect-Protocol-Version': '1',
          Accept: '*/*',
          Origin: 'https://www.kimi.com',
          Referer: 'https://www.kimi.com/',
          'X-Language': 'zh-CN',
          'X-Msh-Platform': 'web',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: buf,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Kimi API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const arr = await res.arrayBuffer();
      const u8 = new Uint8Array(arr);
      const texts: string[] = [];
      const decoder = new TextDecoder();
      let o = 0;
      while (o + 5 <= u8.length) {
        const len = new DataView(u8.buffer, u8.byteOffset + o + 1, 4).getUint32(0, false);
        if (o + 5 + len > u8.length) break;

        const chunk = u8.slice(o + 5, o + 5 + len);
        try {
          const obj = JSON.parse(decoder.decode(chunk)) as {
            block?: { text?: { content?: string } };
            op?: string;
            done?: boolean;
            error?: { message?: string; code?: string };
          };

          if (obj.error) {
            throw new Error(
              `Kimi RPC error: ${obj.error.message ?? obj.error.code ?? JSON.stringify(obj.error).slice(0, 200)}`,
            );
          }

          if (obj.block?.text?.content && ['set', 'append'].includes(obj.op ?? '')) {
            texts.push(obj.block.text.content);
          }
          if (obj.done) break;
        } catch (e) {
          if (e instanceof Error && e.message.startsWith('Kimi RPC')) throw e;
        }

        o += 5 + len;
      }
      const rawText = texts.join('');

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
