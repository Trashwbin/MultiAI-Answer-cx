import type { Question, FinalAnswer, ProviderResponse, ExtensionMessage } from '../types';
import type { PromptMode } from '../types/provider';
import { extractQuestionsFromXXT } from './extractor/extractor';
import { autoFillAnswers } from './auto-fill/auto-fill';
import { showAnswerPanel, updateAnswerPanel, updateProviderStatus, setAutoFillCallback } from './panel/panel';
import { showQuestionList as showQuestionListModal, initQuestionList, setQuestionListSendCallback, hideQuestionList } from './panel/question-list';
import { showAISelector } from './panel/ai-selector';

let extensionEnabled = true;
let questions: Question[] = [];
let finalAnswers: FinalAnswer[] = [];
const providerResponses = new Map<string, ProviderResponse | 'querying'>();
let selectedProviderIds: string[] = [];
let weightProviderId: string | null = null;
let keepAlivePort: chrome.runtime.Port | null = null;

function connectKeepAlive(): void {
  if (!chrome.runtime?.id) return; // Extension context invalidated, stop reconnecting
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'keepalive' });
    keepAlivePort.onDisconnect.addListener(() => {
      keepAlivePort = null;
      void chrome.runtime.lastError;
      if (chrome.runtime?.id) {
        setTimeout(connectKeepAlive, 1000);
      }
    });
  } catch {
    keepAlivePort = null;
    if (chrome.runtime?.id) {
      setTimeout(connectKeepAlive, 5000);
    }
  }
}

function handleBackgroundMessage(message: ExtensionMessage): void {
  switch (message.type) {
    case 'QUERY_START': {
      console.log('[CX] Query started:', message.providerIds.join(', '));
      providerResponses.clear();
      finalAnswers = [];
      for (const id of message.providerIds) {
        providerResponses.set(id, 'querying');
      }
      updateProviderStatus(providerResponses);
      break;
    }

    case 'SHOW_ANSWER': {
      const { providerId, response } = message;
      if (response.error) {
        console.warn(`[CX] ${providerId}: error — ${response.error}`);
      } else {
        console.log(`[CX] ${providerId}: OK, ${response.answers.length} answers`);
      }

      providerResponses.set(providerId, response);
      finalAnswers = aggregateFinalAnswers(providerResponses);

      updateAnswerPanel(finalAnswers, providerResponses);
      break;
    }

    case 'QUERY_COMPLETE':
      console.log(`[CX] All queries done in ${message.durationMs}ms`);
      break;

    default:
      break;
  }
}

function aggregateFinalAnswers(
  responses: Map<string, ProviderResponse | 'querying'>,
): FinalAnswer[] {
  const answerMap = new Map<string, FinalAnswer>();

  for (const entry of responses.values()) {
    if (entry === 'querying') continue;
    if (entry.error) continue;

    for (const pa of entry.answers) {
      const existing = answerMap.get(pa.questionNumber);
      if (existing) {
        const answerKey = Array.isArray(pa.answer) ? pa.answer.join(',') : pa.answer;
        const existingKey = Array.isArray(existing.answer) ? existing.answer.join(',') : existing.answer;
        if (answerKey === existingKey) {
          existing.votes += 1;
        } else if (existing.votes <= 1) {
          existing.answer = pa.answer;
        }
        existing.totalProviders += 1;
      } else {
        answerMap.set(pa.questionNumber, {
          questionNumber: pa.questionNumber,
          answer: pa.answer,
          votes: 1,
          totalProviders: 1,
        });
      }
    }
  }

  return Array.from(answerMap.values());
}

function safeSendMessage(message: ExtensionMessage): void {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage(message).catch(() => {});
}

function sendQueryAllAI(providerIds?: string[], batchMode?: boolean, promptMode?: PromptMode): void {
  if (questions.length === 0) return;

  safeSendMessage({ type: 'QUERY_ALL_AI', questions, providerIds, batchMode, promptMode });
}

function buildPanelCallbacks(): {
  onAutoFill: () => void;
  onRetransmit: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
  onWeightChange: (providerId: string | null) => void;
} {
  return {
    onAutoFill: () => void autoFillAnswers(finalAnswers, questions),
    onRetransmit: (providerId: string) => {
      providerResponses.set(providerId, 'querying');
      safeSendMessage({ type: 'QUERY_AI', providerId, questions });
    },
    onRemoveProvider: (providerId: string) => {
      providerResponses.delete(providerId);
      selectedProviderIds = selectedProviderIds.filter((id) => id !== providerId);
      finalAnswers = aggregateFinalAnswers(providerResponses);
    },
    onWeightChange: (newWeightId: string | null) => {
      weightProviderId = newWeightId;
    },
  };
}

function openPanelAndQuery(providerIds: string[], wId: string | null, batch?: boolean, promptMode?: PromptMode): void {
  selectedProviderIds = providerIds;
  weightProviderId = wId;
  finalAnswers = [];
  providerResponses.clear();
  showAnswerPanel(
    { questions, finalAnswers, providerIds, weightProviderId: wId, isLoading: true },
    buildPanelCallbacks(),
  );
  sendQueryAllAI(providerIds, batch, promptMode);
}

function handlePopupMessage(
  message: { action: string; enabled?: boolean },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean; redirected?: boolean; cancelled?: boolean; error?: string }) => void,
): boolean {
  switch (message.action) {
    case 'toggleExtension':
      extensionEnabled = message.enabled ?? true;
      location.reload();
      sendResponse({ success: true });
      break;

    case 'showQuestionList': {
      if (questions.length === 0) {
        questions = extractQuestionsFromXXT();
      }

      if (questions.length > 0) {
        initQuestionList(questions);
        showQuestionListModal(questions);
        sendResponse({ success: true });
        break;
      }

      const previewBtn = document.querySelector<HTMLElement>(
        '.completeBtn[onclick*="topreview"]',
      );
      if (previewBtn) {
        previewBtn.addEventListener(
          'click',
          (e) => e.preventDefault(),
          { once: true, capture: true },
        );
        previewBtn.click();
        sendResponse({ success: true, redirected: true });
        return true;
      }

      sendResponse({ success: false, error: '当前页面未找到题目' });
      break;
    }

    case 'showAnswers':
      if (questions.length === 0) {
        questions = extractQuestionsFromXXT();
      }
      if (questions.length === 0) {
        sendResponse({ success: false, error: '\u5F53\u524D\u9875\u9762\u672A\u627E\u5230\u9898\u76EE' });
        break;
      }
      showAISelector(({ providerIds, weightProviderId: wId, batchMode: batch, promptMode: pm }) => {
        openPanelAndQuery(providerIds, wId, batch, pm);
      });
      sendResponse({ success: true });
      break;

    case 'autoFill':
      void autoFillAnswers(finalAnswers, questions);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
      break;
  }

  return true;
}

function removePageRestrictions(): void {
  document.addEventListener(
    'paste',
    (e) => e.stopImmediatePropagation(),
    true,
  );

  document.addEventListener(
    'copy',
    (e) => e.stopImmediatePropagation(),
    true,
  );

  const style = document.createElement('style');
  style.textContent = `
    * { -webkit-user-select: text !important; user-select: text !important; }
    .watermark, [class*="watermark"] { display: none !important; }
  `;
  document.head.appendChild(style);
}

function initialize(): void {
  if (!extensionEnabled) return;

  questions = extractQuestionsFromXXT();

  setAutoFillCallback(() => {
    void autoFillAnswers(finalAnswers, questions);
  });

  setQuestionListSendCallback((selected) => {
    questions = selected;
    hideQuestionList();
    showAISelector(({ providerIds, weightProviderId: wId, batchMode: batch, promptMode: pm }) => {
      openPanelAndQuery(providerIds, wId, batch, pm);
    });
  });

  connectKeepAlive();

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, _sendResponse) => {
      handleBackgroundMessage(message);
    },
  );

  chrome.runtime.onMessage.addListener(handlePopupMessage);

  removePageRestrictions();

  if (questions.length > 0) {
    safeSendMessage({ type: 'QUESTION_PAGE_READY' });
  }
}

initialize();
