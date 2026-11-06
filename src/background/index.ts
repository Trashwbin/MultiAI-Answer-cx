import type { ExtensionMessage, Question, ProbeResult } from '../types';
import type { PromptMode, SessionCleanupMode } from '../types/provider';
import {
  getEnabledProvidersAsync,
  getProvidersByIdsAsync,
  getProviderByIdAsync,
} from '../providers/registry';
import { BaseProvider } from '../providers/base-provider';
import { probeApiSource } from '../providers/model-discovery';
import { prefetchCatalog, getCatalogStatus } from '../providers/model-catalog';
import {
  getApiSources,
  saveApiSource,
  deleteApiSource,
  getEnabledModels,
  getAggregationConfig,
  saveAggregationConfig,
  createSourceId,
} from '../config/model-sources';

const activePorts = new Set<chrome.runtime.Port>();
let activeQueries = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

/**
 * A silent chrome.runtime.Port does NOT keep an MV3 service worker alive:
 * Chrome terminates idle workers after ~30s, which aborts in-flight fetches
 * (visible upstream as HTTP 499). While queries are running, ping the ports
 * every 20s so the worker keeps receiving events.
 */
function startKeepalive(): void {
  activeQueries += 1;
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    for (const port of activePorts) {
      try { port.postMessage({ type: 'keepalive-ping' }); } catch { /* closed */ }
    }
  }, 20_000);
}

function stopKeepalive(): void {
  activeQueries = Math.max(0, activeQueries - 1);
  if (activeQueries === 0 && keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    activePorts.add(port);
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});

// Refresh the runtime model catalog in the background; never blocks messages.
void prefetchCatalog().catch(() => {});

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
        handleQuerySingleAI(
          message.providerId,
          message.questions,
          tabId,
          message.sessionCleanupMode,
        ).catch((err: unknown) => {
          console.error('[SW] QUERY_AI failed:', err);
        });
        sendResponse({ success: true });
        break;
      }

      case 'QUESTION_PAGE_READY':
        sendResponse({ success: true });
        break;

      case 'PROBE_MODELS': {
        const sourceId = createSourceId();
        probeApiSource(message.baseUrl, message.apiKey, sourceId)
          .then((result: ProbeResult) => sendResponse(result as unknown as Record<string, unknown>))
          .catch((err: unknown) =>
            sendResponse({ success: false, error: errorMessage(err), errorKind: 'unknown' }),
          );
        break;
      }

      case 'GET_API_SOURCES':
        getApiSources()
          .then((sources) => sendResponse({ success: true, sources }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'SAVE_API_SOURCE':
        saveApiSource(message.source)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'DELETE_API_SOURCE':
        deleteApiSource(message.sourceId)
          .then(() => sendResponse({ success: true }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'GET_ENABLED_MODELS':
        getEnabledModels()
          .then((models) => sendResponse({ success: true, models }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'GET_CATALOG_STATUS':
        sendResponse({ success: true, status: getCatalogStatus() });
        break;

      case 'GET_AGGREGATION_CONFIG':
        getAggregationConfig()
          .then((config) => sendResponse({ success: true, config }))
          .catch((err: unknown) => sendResponse({ success: false, error: errorMessage(err) }));
        break;

      case 'SET_AGGREGATION_CONFIG':
        saveAggregationConfig(message.config)
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
  } catch {
    // tab may have been closed
  }
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

  const aggregation = await getAggregationConfig();
  const weightProviderId = ids.includes(aggregation.weightProviderId ?? '')
    ? aggregation.weightProviderId
    : null;

  await safeSendToTab(senderTabId, {
    type: 'QUERY_START' as const,
    providerIds: ids,
    weightProviderId,
  });

  const start = performance.now();
  startKeepalive();

  try {
    await Promise.allSettled(
      providers.map(async (provider) => {
        const pid = provider.config.id;
        console.log(`[SW] ${pid}: starting query (${batch ? 'batch' : 'single'})...`);
        (provider as BaseProvider).promptMode = promptMode ?? 'standard';
        (provider as BaseProvider).sessionCleanupMode = sessionCleanupMode ?? 'on_success';

        try {
          if (batch) {
            const response = await provider.query(questions);
            await logAndSendResponse(pid, response, senderTabId);
          } else {
            for (const q of questions) {
              const response = await provider.query([q]);
              await logAndSendResponse(pid, response, senderTabId);
            }
          }
        } catch (err: unknown) {
          const errMsg = errorMessage(err);
          console.error(`[SW] ${pid}: EXCEPTION -`, errMsg);
          await safeSendToTab(senderTabId, {
            type: 'SHOW_ANSWER' as const,
            providerId: pid,
            response: { providerId: pid, answers: [], rawText: '', error: errMsg },
          });
        }
      }),
    );
  } finally {
    stopKeepalive();
  }

  const durationMs = Math.round(performance.now() - start);
  console.log(`[SW] QUERY_ALL_AI: done in ${durationMs}ms`);
  await safeSendToTab(senderTabId, { type: 'QUERY_COMPLETE' as const, durationMs });
}

async function logAndSendResponse(
  pid: string,
  response: import('../types').ProviderResponse,
  senderTabId: number,
): Promise<void> {
  if (response.error) console.error(`[SW] ${pid}: FAIL -`, response.error);
  else console.log(`[SW] ${pid}: OK, ${response.answers.length} answers`);

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
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  (provider as BaseProvider).sessionCleanupMode = sessionCleanupMode ?? 'on_success';
  startKeepalive();
  let response: import('../types').ProviderResponse;
  try {
    response = await provider.query(questions);
  } finally {
    stopKeepalive();
  }
  await safeSendToTab(senderTabId, {
    type: 'SHOW_ANSWER' as const,
    providerId,
    response,
  });
}

