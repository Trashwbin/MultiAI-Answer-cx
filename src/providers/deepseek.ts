import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface DeepSeekPowChallenge {
  algorithm?: string;
  challenge?: string;
  difficulty?: number;
}

interface DeepSeekPowEnvelope {
  challenge?: DeepSeekPowChallenge;
  data?: {
    challenge?: DeepSeekPowChallenge;
    biz_data?: {
      challenge?: DeepSeekPowChallenge;
    };
  };
}

export class DeepSeekProvider extends BaseProvider {
  private static readonly TARGET_PATH = '/api/v0/chat/completion';

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const challenge = await this.createPowChallenge(auth);
      const nonce = await this.solvePow(challenge.challenge, challenge.difficulty);
      const prompt = this.buildPrompt(question);

      const res = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Cookie: this.buildCookieHeader(auth.cookies),
          ...(auth.bearerToken ? { Authorization: `Bearer ${auth.bearerToken}` } : {}),
          'x-ds-pow-response': `${challenge.algorithm}:${challenge.challenge}:${challenge.difficulty}:${nonce}`,
        },
        body: JSON.stringify({
          model: 'deepseek_chat',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`DeepSeek API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const text = await res.text();
      const rawText = this.parseSseText(text);
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

  private async createPowChallenge(auth: { cookies: Record<string, string>; bearerToken?: string }): Promise<{
    algorithm: string;
    challenge: string;
    difficulty: number;
  }> {
    const res = await fetch('https://chat.deepseek.com/api/v0/chat/create_pow_challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: this.buildCookieHeader(auth.cookies),
        ...(auth.bearerToken ? { Authorization: `Bearer ${auth.bearerToken}` } : {}),
      },
      body: JSON.stringify({ target_path: DeepSeekProvider.TARGET_PATH }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DeepSeek PoW challenge failed: ${res.status} ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as DeepSeekPowEnvelope;
    const challenge = data.data?.biz_data?.challenge ?? data.data?.challenge ?? data.challenge;
    if (!challenge?.challenge || challenge.difficulty === undefined) {
      throw new Error('DeepSeek PoW challenge payload is missing required fields');
    }

    return {
      algorithm: challenge.algorithm ?? 'sha256',
      challenge: challenge.challenge,
      difficulty: challenge.difficulty,
    };
  }

  private async solvePow(challenge: string, difficulty: number): Promise<number> {
    const prefix = '0'.repeat(Math.max(0, difficulty));
    const encoder = new TextEncoder();

    for (let nonce = 0; nonce < 2_000_000; nonce += 1) {
      const input = encoder.encode(`${challenge}${nonce}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', input);
      const hashHex = this.bufferToHex(hashBuffer);
      if (hashHex.startsWith(prefix)) {
        return nonce;
      }
    }

    throw new Error('DeepSeek PoW solve timeout');
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (const byte of bytes) {
      out += byte.toString(16).padStart(2, '0');
    }
    return out;
  }

  private parseSseText(sse: string): string {
    const parts: string[] = [];
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = data.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          parts.push(delta);
        }
      } catch {
      }
    }
    return parts.join('');
  }
}
