import { getCredentials, saveCredentials } from '../auth/token-manager';
import { captureCookies } from '../auth/cookie-capture';
import { buildPrompt as buildRichPrompt } from '../config/prompts';
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
    if (stored) {
      console.log(
        `[Auth] ${this.config.id}: stored credentials — cookies=[${Object.keys(stored.cookies).join(',')}] bearer=${stored.bearerToken ? 'yes' : 'no'}`,
      );
      return stored;
    }

    const cookies = await captureCookies(this.config.id, this.config.domain);
    console.log(
      `[Auth] ${this.config.id}: captured cookies from ${this.config.domain} — [${Object.keys(cookies).join(',')}]`,
    );
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
    return buildRichPrompt([question], 'standard');
  }
}
