import { getCredentials, saveCredentials } from '../auth/token-manager';
import { captureCookies } from '../auth/cookie-capture';
import type {
  AIProvider,
  AuthCredentials,
  AuthStatus,
  ProviderConfig,
  ProviderResponse,
  Question,
} from '../types';

const CREDENTIAL_TTL_MS = 86_400_000;

export abstract class BaseProvider implements AIProvider {
  constructor(public readonly config: ProviderConfig) {}

  abstract query(question: Question): Promise<ProviderResponse>;

  async checkAuth(): Promise<AuthStatus> {
    try {
      const stored = await getCredentials(this.config.id);
      if (stored) return 'authenticated';

      const cookies = await captureCookies(this.config.id, this.config.domain);
      if (Object.keys(cookies).length > 0) {
        await saveCredentials(this.config.id, {
          cookies,
          expiresAt: Date.now() + CREDENTIAL_TTL_MS,
        });
        return 'authenticated';
      }

      return 'unauthenticated';
    } catch {
      return 'error';
    }
  }

  protected async getAuth(): Promise<AuthCredentials> {
    const stored = await getCredentials(this.config.id);
    if (stored) return stored;

    const cookies = await captureCookies(this.config.id, this.config.domain);
    if (Object.keys(cookies).length > 0) {
      const creds: AuthCredentials = {
        cookies,
        expiresAt: Date.now() + CREDENTIAL_TTL_MS,
      };
      await saveCredentials(this.config.id, creds);
      return creds;
    }

    throw new Error(`${this.config.name} is not authenticated`);
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
