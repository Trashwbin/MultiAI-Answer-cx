import type { Question } from './question';
import type { ProviderResponse } from './answer';

export interface AuthCredentials {
  cookies: Record<string, string>;
  bearerToken?: string;
  orgId?: string;
  expiresAt: number;
}

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'expired' | 'error';

export interface ProviderConfig {
  id: string;
  name: string;
  domain: string;
  color: string;
  weight: number;
  enabled: boolean;
}

export interface AIProvider {
  config: ProviderConfig;
  query(questions: Question[]): Promise<ProviderResponse>;
  checkAuth(): Promise<AuthStatus>;
}
