import type { ExtensionMessage, Question, QuestionAnswer, ProviderResponse } from '../types';
import { queryAllProviders } from '../core/orchestrator';
import { getProviderById } from '../providers/registry';
import { AI_PROVIDERS } from '../config/ai-config';
import { startGuidedLogin } from '../auth/guided-login';
import { clearCredentials } from '../auth/token-manager';

const activePorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    activePorts.add(port);
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: Record<string, unknown>) => void,
  ) => {
    switch (message.type) {
      case 'QUERY_ALL_AI': {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
          sendResponse({ success: false, error: 'No sender tab' });
          break;
        }
        handleQueryAllAI(message.questions, tabId, message.providerIds).catch((err: unknown) => {
          console.error('[SW] QUERY_ALL_AI failed:', err);
        });
        sendResponse({ success: true });
        break;
      }

      case 'QUERY_AI': {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
          sendResponse({ success: false, error: 'No sender tab' });
          break;
        }
        handleQuerySingleAI(message.providerId, message.questions, tabId).catch(
          (err: unknown) => {
            console.error('[SW] QUERY_AI failed:', err);
          },
        );
        sendResponse({ success: true });
        break;
      }

      case 'AUTH_LOGIN':
        startGuidedLogin(message.providerId)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'AUTH_STATUS': {
        const provider = getProviderById(message.providerId);
        if (!provider) {
          sendResponse({ success: false, error: `Unknown provider: ${message.providerId}` });
          break;
        }
        provider
          .checkAuth()
          .then((status) => sendResponse({ success: true, status }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;
      }

      case 'AUTH_LOGOUT':
        clearCredentials(message.providerId)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'AUTH_STATUS_ALL':
        handleAuthStatusAll()
          .then((statuses) => sendResponse({ success: true, statuses }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'QUESTION_PAGE_READY':
        sendResponse({ success: true });
        break;

      case 'SHOW_ANSWER':
        break;
    }

    return true;
  },
);

async function safeSendToTab(tabId: number, message: Record<string, unknown>): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {}
}

async function handleAuthStatusAll(): Promise<Record<string, string>> {
  const statuses: Record<string, string> = {};
  await Promise.all(
    AI_PROVIDERS.map(async (config) => {
      const provider = getProviderById(config.id);
      if (provider) {
        try {
          statuses[config.id] = await provider.checkAuth();
        } catch {
          statuses[config.id] = 'error';
        }
      } else {
        statuses[config.id] = 'error';
      }
    }),
  );
  return statuses;
}

async function handleQueryAllAI(
  questions: Question[],
  senderTabId: number,
  providerIds?: string[],
): Promise<void> {
  const result = await queryAllProviders(questions, { providerIds });

  for (const response of result.responses) {
    await safeSendToTab(senderTabId, {
      type: 'SHOW_ANSWER' as const,
      providerId: response.providerId,
      response,
    });
  }
}

async function handleQuerySingleAI(
  providerId: string,
  questions: Question[],
  senderTabId: number,
): Promise<void> {
  const provider = getProviderById(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const allAnswers: QuestionAnswer[] = [];
  const rawTexts: string[] = [];

  for (const question of questions) {
    const resp = await provider.query(question);
    allAnswers.push(...resp.answers);
    rawTexts.push(resp.rawText);
  }

  const response: ProviderResponse = {
    providerId,
    answers: allAnswers,
    rawText: rawTexts.join('\n---\n'),
  };

  await safeSendToTab(senderTabId, {
    type: 'SHOW_ANSWER' as const,
    providerId,
    response,
  });
}
