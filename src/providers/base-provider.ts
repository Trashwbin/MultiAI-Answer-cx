import { getCredentials, saveCredentials } from '../auth/token-manager';
import { captureCookies, captureAllCookies } from '../auth/cookie-capture';
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

  abstract query(questions: Question[]): Promise<ProviderResponse>;

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
    const freshCookies = await captureAllCookies(this.config.id, this.config.domain);
    const freshCount = Object.keys(freshCookies).length;

    const merged: AuthCredentials = {
      cookies: { ...(stored?.cookies ?? {}), ...freshCookies },
      bearerToken: stored?.bearerToken,
      expiresAt: Date.now() + CREDENTIAL_TTL_MS,
    };

    const cookieKeys = Object.keys(merged.cookies);
    console.log(
      `[Auth] ${this.config.id}: cookies=[${cookieKeys.join(',')}] (stored=${Object.keys(stored?.cookies ?? {}).length}, fresh=${freshCount}) bearer=${merged.bearerToken ? 'yes' : 'no'}`,
    );

    if (cookieKeys.length === 0 && !merged.bearerToken) {
      throw new Error(`${this.config.name} is not authenticated`);
    }

    await saveCredentials(this.config.id, merged);
    return merged;
  }

  protected buildCookieHeader(cookies: Record<string, string>): string {
    return Object.entries(cookies)
      .filter(([key]) => key.length > 0)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }

  protected buildPrompt(questions: Question[]): string {
    return buildRichPrompt(questions, 'standard');
  }

  protected async findProviderTab(patterns?: string[]): Promise<number | undefined> {
    const urlPatterns = patterns ?? [`https://${this.config.domain}/*`, `https://www.${this.config.domain}/*`];
    for (const pattern of urlPatterns) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }
    return undefined;
  }
}
