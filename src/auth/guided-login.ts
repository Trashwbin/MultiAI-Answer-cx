import type { AuthCredentials } from '../types';
import { getProviderById } from '../config/ai-config';
import { saveCredentials } from './token-manager';
import { captureCookies } from './cookie-capture';
import { startIntercepting, stopIntercepting } from './request-interceptor';

const LOGIN_TIMEOUT_MS = 300_000;
const CREDENTIAL_TTL_MS = 86_400_000;

interface AuthLoginSuccessMessage {
  type: 'AUTH_LOGIN_SUCCESS';
  providerId: string;
}

function isAuthLoginSuccess(msg: unknown): msg is AuthLoginSuccessMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as Record<string, unknown>).type === 'AUTH_LOGIN_SUCCESS' &&
    typeof (msg as Record<string, unknown>).providerId === 'string'
  );
}

export function startGuidedLogin(providerId: string): Promise<AuthCredentials> {
  const provider = getProviderById(providerId);
  if (!provider) {
    return Promise.reject(new Error(`Unknown provider: ${providerId}`));
  }

  const { domain } = provider;
  const loginUrl = `https://${domain}/`;

  return new Promise<AuthCredentials>((resolve, reject) => {
    let capturedToken: string | undefined;
    let tabId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      stopIntercepting(providerId);
      chrome.runtime.onMessage.removeListener(messageListener);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    startIntercepting(providerId, domain, (token) => {
      capturedToken = token;
    });

    const messageListener = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
    ): void => {
      if (!isAuthLoginSuccess(message) || message.providerId !== providerId) {
        return;
      }

      void (async () => {
        try {
          const cookies = await captureCookies(providerId, domain);
          const credentials: AuthCredentials = {
            cookies,
            bearerToken: capturedToken,
            expiresAt: Date.now() + CREDENTIAL_TTL_MS,
          };

          await saveCredentials(providerId, credentials);

          if (tabId !== undefined) {
            chrome.tabs.remove(tabId).catch(() => {});
          }

          cleanup();
          resolve(credentials);
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    };

    chrome.runtime.onMessage.addListener(messageListener);

    timeoutId = setTimeout(() => {
      cleanup();
      if (tabId !== undefined) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
      reject(
        new Error(
          `Guided login timed out after ${LOGIN_TIMEOUT_MS / 1000}s for ${providerId}`,
        ),
      );
    }, LOGIN_TIMEOUT_MS);

    chrome.tabs
      .create({ url: loginUrl, active: true })
      .then((tab) => {
        tabId = tab.id;
      })
      .catch((err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
