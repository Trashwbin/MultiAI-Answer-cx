import type { ExtensionMessage, Question, QuestionAnswer, ProviderResponse } from '../types';
import { QuestionType } from '../types/question';
import { getProviderById, getProvidersByIds, getEnabledProviders } from '../providers/registry';
import { AI_PROVIDERS, getProviderById as getProviderConfig } from '../config/ai-config';
import { startGuidedLogin } from '../auth/guided-login';
import { clearCredentials, mergeCredentials } from '../auth/token-manager';
import { captureAllCookies } from '../auth/cookie-capture';

const activePorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    activePorts.add(port);
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});

const BEARER_INTERCEPT_URLS = [
  'https://chat.deepseek.com/api/*',
  'https://kimi.moonshot.cn/api/*',
  'https://www.kimi.com/api/*',
  'https://www.kimi.com/apiv2/*',
  'https://kimi.com/api/*',
  'https://claude.ai/api/*',
  'https://www.doubao.com/samantha/*',
  'https://chatglm.cn/chatglm/*',
  'https://chat2.qianwen.com/*',
  'https://chat.qwen.ai/api/*',
];

const URL_TO_PROVIDER: Record<string, string> = {
  'chat.deepseek.com': 'deepseek',
  'kimi.moonshot.cn': 'kimi',
  'www.kimi.com': 'kimi',
  'kimi.com': 'kimi',
  'claude.ai': 'claude',
  'www.doubao.com': 'doubao',
  'chatglm.cn': 'chatglm',
  'chat2.qianwen.com': 'qwen-cn',
  'chat.qwen.ai': 'qwen-intl',
};

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;

    const authHeader = details.requestHeaders.find(
      (h) => h.name.toLowerCase() === 'authorization',
    );
    if (!authHeader?.value?.startsWith('Bearer ')) return;

    const bearer = authHeader.value.slice(7);
    if (bearer.length < 10) return;

    try {
      const url = new URL(details.url);
      const providerId = URL_TO_PROVIDER[url.hostname];
      if (!providerId) return;

      console.log(`[WebRequest] Captured Bearer for ${providerId} (${bearer.length} chars)`);
      mergeCredentials(providerId, { bearerToken: bearer }).catch(() => {});
    } catch {}
  },
  { urls: BEARER_INTERCEPT_URLS },
  ['requestHeaders', 'extraHeaders'],
);

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

      case 'TEST_PROVIDER': {
        const testProviderId = message.providerId;
        const testQuestion = message.question;
        handleTestProvider(testProviderId, testQuestion)
          .then((result) => sendResponse(result))
          .catch((err: unknown) =>
            sendResponse({
              success: false,
              providerId: testProviderId,
              error: errorMessage(err),
              elapsed: 0,
            }),
          );
        break;
      }

      case 'DEBUG_COOKIES': {
        const debugId = message.providerId;
        const cfg = getProviderConfig(debugId);
        if (!cfg) {
          sendResponse({ success: false, error: `Unknown provider: ${debugId}` });
          break;
        }
        Promise.all([
          captureAllCookies(debugId, cfg.domain),
          import('../auth/token-manager').then((m) => m.getCredentials(debugId)),
        ])
          .then(([cookies, storedCreds]) => {
            const names = Object.keys(cookies);
            console.log(`[DEBUG] ${debugId}: found ${names.length} cookies:`, names.join(', '));
            sendResponse({
              success: true,
              providerId: debugId,
              cookieCount: names.length,
              cookieNames: names,
              cookies,
              storedBearer: storedCreds?.bearerToken ? `${storedCreds.bearerToken.slice(0, 20)}...` : null,
              storedCookieKeys: storedCreds ? Object.keys(storedCreds.cookies) : [],
            });
          })
          .catch((err: unknown) =>
            sendResponse({ success: false, error: errorMessage(err) }),
          );
        break;
      }

      case 'CLEAR_ALL_CREDENTIALS':
        Promise.all(AI_PROVIDERS.map((p) => clearCredentials(p.id)))
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) =>
            sendResponse({ success: false, error: errorMessage(err) }),
          );
        break;

      case 'STORAGE_CAPTURED':
        console.log(`[SW] Storage captured for ${message.providerId}:`, Object.keys(message.storage).join(', '));
        mergeCredentials(message.providerId, { cookies: message.storage })
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'BEARER_CAPTURED':
        console.log(`[SW] Bearer captured for ${message.providerId} (${message.bearerToken.length} chars)`);
        mergeCredentials(message.providerId, { bearerToken: message.bearerToken })
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'SHOW_ANSWER':
      case 'QUERY_START':
      case 'QUERY_COMPLETE':
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
  const providers = providerIds?.length
    ? getProvidersByIds(providerIds)
    : getEnabledProviders();

  const ids = providers.map((p) => p.config.id);
  console.log('[SW] QUERY_ALL_AI: querying', ids.join(', '));

  await safeSendToTab(senderTabId, {
    type: 'QUERY_START' as const,
    providerIds: ids,
  });

  const start = performance.now();

  await Promise.allSettled(
    providers.map(async (provider) => {
      const pid = provider.config.id;
      console.log(`[SW] ${pid}: starting query...`);

      try {
        const allAnswers: QuestionAnswer[] = [];
        const rawTexts: string[] = [];
        let firstError: string | undefined;

        for (const question of questions) {
          const resp = await provider.query(question);
          if (resp.error && !firstError) {
            firstError = resp.error;
          }
          allAnswers.push(...resp.answers);
          rawTexts.push(resp.rawText);
        }

        const joinedRaw = rawTexts.join('\n---\n');
        const response: ProviderResponse = {
          providerId: pid,
          answers: allAnswers,
          rawText: joinedRaw,
          ...(allAnswers.length === 0 && firstError ? { error: firstError } : {}),
        };

        if (response.error) {
          console.error(`[SW] ${pid}: FAIL -`, response.error);
        } else {
          console.log(`[SW] ${pid}: OK, ${allAnswers.length} answers, rawText ${joinedRaw.length} chars`);
        }

        await safeSendToTab(senderTabId, {
          type: 'SHOW_ANSWER' as const,
          providerId: pid,
          response,
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SW] ${pid}: EXCEPTION -`, errMsg);
        await safeSendToTab(senderTabId, {
          type: 'SHOW_ANSWER' as const,
          providerId: pid,
          response: {
            providerId: pid,
            answers: [],
            rawText: '',
            error: errMsg,
          },
        });
      }
    }),
  );

  const durationMs = Math.round(performance.now() - start);
  console.log(`[SW] QUERY_ALL_AI: done in ${durationMs}ms`);
  await safeSendToTab(senderTabId, {
    type: 'QUERY_COMPLETE' as const,
    durationMs,
  });
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

async function handleTestProvider(
  providerId: string,
  questionText: string,
): Promise<Record<string, unknown>> {
  const provider = getProviderById(providerId);
  if (!provider) {
    return { success: false, providerId, error: `Unknown provider: ${providerId}`, elapsed: 0 };
  }

  const testQuestion: Question = {
    id: 'test-1',
    number: '1',
    type: QuestionType.SINGLE_CHOICE,
    content: questionText,
    options: [
      { label: 'A', text: '1' },
      { label: 'B', text: '2' },
      { label: 'C', text: '3' },
      { label: 'D', text: '4' },
    ],
    blankCount: 0,
  };

  const start = performance.now();
  try {
    const resp = await provider.query(testQuestion);
    const elapsed = Math.round(performance.now() - start);
    return {
      success: true,
      providerId,
      answers: resp.answers,
      rawText: resp.rawText,
      error: resp.error ?? null,
      elapsed,
    };
  } catch (err: unknown) {
    const elapsed = Math.round(performance.now() - start);
    return {
      success: false,
      providerId,
      error: errorMessage(err),
      elapsed,
    };
  }
}
