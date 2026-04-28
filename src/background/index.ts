import type { ExtensionMessage, Question } from '../types';
import type { PromptMode, SessionCleanupMode } from '../types/provider';
import { QuestionType } from '../types/question';
import { getProviderById, getProvidersByIds, getEnabledProviders, getEnabledProvidersAsync, getProvidersByIdsAsync, getProviderByIdAsync } from '../providers/registry';
import { AI_PROVIDERS, getProviderById as getProviderConfig, getCustomProviders, saveCustomProvider, deleteCustomProvider } from '../config/ai-config';
import { startGuidedLogin } from '../auth/guided-login';
import { clearCredentials, mergeCredentials } from '../auth/token-manager';
import { captureAllCookies } from '../auth/cookie-capture';
import { BaseProvider } from '../providers/base-provider';
import { cleanupAllMultiAiGroups } from '../utils/tab-group';

const activePorts = new Set<chrome.runtime.Port>();

void cleanupAllMultiAiGroups().catch((err) => {
  console.warn('[TabGroup] startup cleanup failed:', err);
});

chrome.runtime.onStartup?.addListener(() => {
  void cleanupAllMultiAiGroups().catch((err) => {
    console.warn('[TabGroup] onStartup cleanup failed:', err);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void cleanupAllMultiAiGroups().catch((err) => {
    console.warn('[TabGroup] onInstalled cleanup failed:', err);
  });
});

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
  'https://www.doubao.com/samantha/*',
  'https://chatglm.cn/chatglm/*',
  'https://chat2.qianwen.com/*',
];

const URL_TO_PROVIDER: Record<string, string> = {
  'chat.deepseek.com': 'deepseek',
  'kimi.moonshot.cn': 'kimi',
  'www.kimi.com': 'kimi',
  'kimi.com': 'kimi',
  'www.doubao.com': 'doubao',
  'chatglm.cn': 'chatglm',
  'chat2.qianwen.com': 'qwen-cn',
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
        handleQueryAllAI(
          message.questions,
          tabId,
          message.providerIds,
          message.batchMode,
          message.promptMode,
          message.sessionCleanupMode,
        ).catch((err: unknown) => {
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
        handleQuerySingleAI(message.providerId, message.questions, tabId, message.sessionCleanupMode).catch(
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

      case 'EXEC_PAGE_FUNC': {
        const tabId = sender.tab?.id;
        if (tabId === undefined) {
          sendResponse({ success: false, error: 'No sender tab' });
          break;
        }
        const { funcName, args } = message;
        chrome.scripting
          .executeScript({
            target: { tabId },
            world: 'MAIN',
            func: (fn: string, fnArgs: string[]) => {
              const w = window as unknown as Record<string, unknown>;
              const func = w[fn];
              if (typeof func === 'function') {
                (func as (...a: string[]) => void)(...fnArgs);
              }
            },
            args: [funcName, args],
          })
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) =>
            sendResponse({ success: false, error: errorMessage(err) }),
          );
        break;
      }

      case 'SAVE_CUSTOM_PROVIDER':
        saveCustomProvider(message.config)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'DELETE_CUSTOM_PROVIDER':
        deleteCustomProvider(message.providerId)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'GET_CUSTOM_PROVIDERS':
        getCustomProviders()
          .then((providers) => sendResponse({ success: true, providers }))
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
  const customConfigs = await getCustomProviders();
  for (const config of customConfigs) {
    statuses[config.id] = 'authenticated';
  }
  return statuses;
}

async function handleQueryAllAI(
  questions: Question[],
  senderTabId: number,
  providerIds?: string[],
  batchMode?: boolean,
  promptMode?: PromptMode,
  sessionCleanupMode?: SessionCleanupMode,
): Promise<void> {
  const batch = batchMode !== false;
  const providers = providerIds?.length
    ? await getProvidersByIdsAsync(providerIds)
    : await getEnabledProvidersAsync();

  const ids = providers.map((p) => p.config.id);
  console.log(`[SW] QUERY_ALL_AI: querying ${ids.join(', ')} (${batch ? 'batch' : 'single'})`);

  await safeSendToTab(senderTabId, {
    type: 'QUERY_START' as const,
    providerIds: ids,
  });

  const start = performance.now();

  await Promise.allSettled(
    providers.map(async (provider) => {
      const pid = provider.config.id;
      console.log(`[SW] ${pid}: starting query (${batch ? 'batch' : 'single'})...`);
      (provider as BaseProvider).promptMode = promptMode ?? 'standard';
      (provider as BaseProvider).sessionCleanupMode = sessionCleanupMode ?? 'on_success';

      try {
        if (batch) {
          const response = await provider.query(questions);
          logAndSendResponse(pid, response, senderTabId);
        } else {
          for (const q of questions) {
            const response = await provider.query([q]);
            await logAndSendResponse(pid, response, senderTabId);
          }
        }
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

async function logAndSendResponse(
  pid: string,
  response: import('../types').ProviderResponse,
  senderTabId: number,
): Promise<void> {
  if (response.error) {
    console.error(`[SW] ${pid}: FAIL -`, response.error);
  } else {
    console.log(`[SW] ${pid}: OK, ${response.answers.length} answers, rawText ${response.rawText.length} chars`);
  }

  await safeSendToTab(senderTabId, {
    type: 'SHOW_ANSWER' as const,
    providerId: pid,
    response,
  });
}

async function handleQuerySingleAI(
  providerId: string,
  questions: Question[],
  senderTabId: number,
  sessionCleanupMode?: SessionCleanupMode,
): Promise<void> {
  const provider = await getProviderByIdAsync(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  (provider as BaseProvider).sessionCleanupMode = sessionCleanupMode ?? 'on_success';
  const response = await provider.query(questions);

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
    displayNumber: '1',
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
    const resp = await provider.query([testQuestion]);
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
