import { getCredentials } from '../auth/token-manager';
import type {
  AIProvider,
  AuthCredentials,
  AuthStatus,
  ProviderConfig,
  ProviderResponse,
  Question,
} from '../types';

export abstract class BaseProvider implements AIProvider {
  constructor(public readonly config: ProviderConfig) {}

  abstract query(question: Question): Promise<ProviderResponse>;

  async checkAuth(): Promise<AuthStatus> {
    try {
      const creds = await getCredentials(this.config.id);
      if (!creds) {
        return 'unauthenticated';
      }
      if (Date.now() >= creds.expiresAt) {
        return 'expired';
      }
      return 'authenticated';
    } catch {
      return 'error';
    }
  }

  protected async getAuth(): Promise<AuthCredentials> {
    const creds = await getCredentials(this.config.id);
    if (!creds) {
      throw new Error(`${this.config.name} is not authenticated`);
    }
    return creds;
  }

  protected buildCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .filter(([key]) => key.length > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  protected buildPrompt(question: Question): string {
    const options = question.options.map((opt) => `${opt.label}. ${opt.text}`);
    const payload: Record<string, string | number | string[]> = {
      id: question.number,
      type: question.type,
      content: question.content,
    };
    if (options.length > 0) {
      payload.options = options;
    }
    if (question.blankCount > 0) {
      payload.blankCount = question.blankCount;
    }

    return [
      '请根据题目返回 JSON。',
      '只返回如下结构，不要 markdown：{"answers":[{"questionNumber":"题号","answer":"答案"}]}',
      '题目：',
      JSON.stringify([payload], null, 2),
    ].join('\n');
  }
}
