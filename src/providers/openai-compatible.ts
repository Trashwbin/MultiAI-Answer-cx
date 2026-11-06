import { parseAIResponse } from '../core/json-parser';
import type {
  ModelProviderConfig,
  ProviderResponse,
  Question,
} from '../types';
import { BaseProvider } from './base-provider';

interface OpenAIChatCompletionChunk {
  choices?: Array<{ delta?: { content?: unknown } }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown };
}

/** Talks to any OpenAI-compatible chat/completions endpoint. */
export class OpenAICompatibleProvider extends BaseProvider {
  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const config = this.config as ModelProviderConfig;
      const prompt = this.buildPrompt(questions);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (config.apiKey.trim()) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      // Deliberately minimal: no temperature / max_tokens / top_p. Let the
      // gateway apply its own defaults.
      const res = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelName,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI-compatible API ${res.status}: ${errorText.slice(0, 300)}`);
      }

      const rawText = await this.readStream(res);
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

  /**
   * Read the response as a stream instead of awaiting the whole body.
   * Each chunk is a service-worker event, which keeps the MV3 worker alive
   * during long reasoning responses instead of being killed at the 30s
   * idle timeout (that kill showed up as a 499 at the gateway).
   */
  private async readStream(res: Response): Promise<string> {
    const contentType = res.headers.get('content-type') ?? '';
    const isSse = contentType.includes('text/event-stream') || !res.body;

    if (!res.body) {
      const text = await res.text();
      return contentType.includes('text/event-stream')
        ? this.parseSseText(text)
        : this.parseJsonResponse(text);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawBody = '';
    const parts: string[] = [];
    let sawDataLine = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      rawBody += decoded;
      buffer += decoded;

      // SSE frames are line-oriented; keep the trailing partial line.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        sawDataLine = true;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const content = this.parseSseDelta(payload);
        if (content) parts.push(content);
      }
    }

    // Flush the last partial line.
    if (buffer.trim().startsWith('data:')) {
      sawDataLine = true;
      const payload = buffer.trim().slice(5).trim();
      if (payload && payload !== '[DONE]') {
        const content = this.parseSseDelta(payload);
        if (content) parts.push(content);
      }
    }

    // Not actually SSE (e.g. a plain JSON error/response body).
    if (!sawDataLine && !isSse) {
      return this.parseJsonResponse(rawBody);
    }

    return parts.join('');
  }

  private parseSseDelta(payload: string): string {
    try {
      const data = JSON.parse(payload) as OpenAIChatCompletionChunk;
      const deltaContent = data.choices?.[0]?.delta?.content;
      return typeof deltaContent === 'string' ? deltaContent : '';
    } catch {
      return '';
    }
  }

  private parseSseText(text: string): string {
    const parts: string[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      const content = this.parseSseDelta(payload);
      if (content) parts.push(content);
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
