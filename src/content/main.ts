import type { Question, FinalAnswer, ProviderResponse, ExtensionMessage } from '../types';
import { QuestionType } from '../types';
import type { SessionCleanupMode } from '../types/provider';
import { autoFillAnswers } from './auto-fill/auto-fill';
import { showAnswerPanel, updateAnswerPanel, updateProviderStatus, setAutoFillCallback, minimizePanel } from './panel/panel';
import { showQuestionList as showQuestionListModal, initQuestionList, setQuestionListSendCallback, hideQuestionList } from './panel/question-list';
import { startWatermarkRemoval, removePasteRestriction, removeSelectRestriction, addCopyButtons } from './page-enhancements';
import { buildQuestionLookup } from '../utils/question-key';
import { resolveQuestionRuntime } from './question-runtime/adapters';
import type { QuestionRuntime } from './question-runtime/types';
import { decodeSecretFontInDocument } from './secret-font/decoder';

let extensionEnabled = true;
let questions: Question[] = [];
let questionRuntime: QuestionRuntime | null = null;
let finalAnswers: FinalAnswer[] = [];
const providerResponses = new Map<string, ProviderResponse | 'querying'>();
let selectedProviderIds: string[] = [];
let selectedSessionCleanupMode: SessionCleanupMode = 'on_success';
/** Model whose answer wins open questions and breaks ties (from QUERY_START). */
let weightProviderId: string | null = null;
let keepAlivePort: chrome.runtime.Port | null = null;

function connectKeepAlive(): void {
  if (!chrome.runtime?.id) return; // Extension context invalidated, stop reconnecting
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'keepalive' });
    // The SW pings us during long queries to stay alive; receiving the ping
    // keeps this end of the port healthy too.
    keepAlivePort.onMessage.addListener(() => {});
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

function refreshQuestions(): Question[] {
  questionRuntime = resolveQuestionRuntime();
  if (questionRuntime) {
    decodeSecretFontInDocument(questionRuntime.root.doc);
  }
  questions = questionRuntime ? questionRuntime.adapter.extract(questionRuntime.root) : [];
  return questions;
}

function ensureQuestions(): boolean {
  if (questions.length === 0) {
    refreshQuestions();
  }
  return questions.length > 0;
}

function handleBackgroundMessage(message: ExtensionMessage): void {
  switch (message.type) {
    case 'QUERY_START': {
      console.log('[CX] Query started:', message.providerIds.join(', '));
      weightProviderId = message.weightProviderId ?? null;
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

const OPEN_QUESTION_TYPES = new Set<QuestionType>([
  QuestionType.QA,
  QuestionType.WORD_DEFINITION,
  QuestionType.READING_COMPREHENSION,
  QuestionType.OTHER,
]);

function answerKey(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join('\0') : answer;
}

/**
 * Open questions have free-form answers that cannot be compared for equality,
 * so the weight model's answer is used directly. For objective questions we
 * keep plain majority voting, but break ties in favour of the weight model.
 */
function aggregateFinalAnswers(
  responses: Map<string, ProviderResponse | 'querying'>,
): FinalAnswer[] {
  const lookup = buildQuestionLookup(questions);

  // Collect valid answers per question id, remembering which provider said what.
  const byQuestion = new Map<string, Array<{
    providerId: string;
    answer: string | string[];
  }>>();

  for (const [providerId, entry] of responses) {
    if (entry === 'querying' || entry.error) continue;
    for (const pa of entry.answers) {
      const list = byQuestion.get(pa.id) ?? [];
      list.push({ providerId, answer: pa.answer });
      byQuestion.set(pa.id, list);
    }
  }

  const answerMap = new Map<string, FinalAnswer>();

  for (const [id, votes] of byQuestion) {
    const question = lookup.get(id);
    const isOpen = question ? OPEN_QUESTION_TYPES.has(question.type) : false;
    const weightVote = weightProviderId
      ? votes.find((v) => v.providerId === weightProviderId)
      : undefined;

    // Open question: take the weight model's answer verbatim, if it answered.
    if (isOpen && weightVote) {
      answerMap.set(id, {
        id,
        answer: weightVote.answer,
        votes: 1,
        totalProviders: votes.length,
      });
      continue;
    }

    // Otherwise group identical answers and count.
    const buckets = new Map<string, { answer: string | string[]; count: number; weightCount: number }>();
    for (const v of votes) {
      const key = answerKey(v.answer);
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        if (v.providerId === weightProviderId) existing.weightCount += 1;
      } else {
        buckets.set(key, {
          answer: v.answer,
          count: 1,
          weightCount: v.providerId === weightProviderId ? 1 : 0,
        });
      }
    }

    // Highest count wins; on a tie prefer the group containing the weight
    // model's answer (equivalent to giving it one extra vote).
    let winner: { answer: string | string[]; count: number } | undefined;
    for (const bucket of buckets.values()) {
      if (
        !winner ||
        bucket.count > winner.count ||
        (bucket.count === winner.count && bucket.weightCount > 0)
      ) {
        winner = bucket;
      }
    }

    if (winner) {
      answerMap.set(id, {
        id,
        answer: winner.answer,
        votes: winner.count,
        totalProviders: votes.length,
      });
    }
  }

  return Array.from(answerMap.values()).sort((a, b) => {
    const qA = lookup.get(a.id);
    const qB = lookup.get(b.id);
    const orderA = qA?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = qB?.globalOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.id.localeCompare(b.id);
  });
}

function safeSendMessage(message: ExtensionMessage): void {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage(message).catch(() => {});
}

function sendQueryAllAI(): void {
  if (!ensureQuestions()) return;

  // No providerIds: the background expands every enabled model from the
  // configuration page. Sending is configuration-free.
  safeSendMessage({
    type: 'QUERY_ALL_AI',
    questions,
    batchMode: true,
    promptMode: 'standard' as const,
    sessionCleanupMode: 'on_success' as const,
  });
}

function buildPanelCallbacks(): {
  onAutoFill: () => void;
  onRetransmit: (providerId: string) => void;
  onRemoveProvider: (providerId: string) => void;
} {
  return {
    onAutoFill: () => void autoFillAnswers(finalAnswers, questions, questionRuntime),
    onRetransmit: (providerId: string) => {
      providerResponses.set(providerId, 'querying');
      safeSendMessage({ type: 'QUERY_AI', providerId, questions, sessionCleanupMode: selectedSessionCleanupMode });
    },
    onRemoveProvider: (providerId: string) => {
      providerResponses.delete(providerId);
      selectedProviderIds = selectedProviderIds.filter((id) => id !== providerId);
      finalAnswers = aggregateFinalAnswers(providerResponses);
    },
  };
}

function openPanelAndQuery(): void {
  selectedProviderIds = [];
  selectedSessionCleanupMode = 'on_success';
  finalAnswers = [];
  providerResponses.clear();
  showAnswerPanel(
    { questions, finalAnswers, providerIds: [], isLoading: true },
    buildPanelCallbacks(),
  );
  sendQueryAllAI();
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
      ensureQuestions();

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
      ensureQuestions();
      if (questions.length === 0) {
        sendResponse({ success: false, error: '\u5F53\u524D\u9875\u9762\u672A\u627E\u5230\u9898\u76EE' });
        break;
      }
      openPanelAndQuery();
      sendResponse({ success: true });
      break;

    case 'autoFill':
      minimizePanel();
      setTimeout(() => void autoFillAnswers(finalAnswers, questions, questionRuntime), 350);
      sendResponse({ success: true });
      break;

    case 'togglePasteLimit':
      location.reload();
      sendResponse({ success: true });
      break;

    case 'toggleCopyBtn':
      location.reload();
      sendResponse({ success: true });
      break;

    case 'toggleTextSelect':
      location.reload();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
      break;
  }

  return true;
}

async function initialize(): Promise<void> {
  if (!extensionEnabled) return;

  const stored = await chrome.storage.local.get([
    'pasteLimitDisabled',
    'textSelectEnabled',
    'copyBtnEnabled',
  ]);
  const pasteLimitDisabled = (stored.pasteLimitDisabled as boolean | undefined) ?? true;
  const textSelectEnabled = (stored.textSelectEnabled as boolean | undefined) ?? true;
  const copyBtnEnabled = (stored.copyBtnEnabled as boolean | undefined) ?? true;

  refreshQuestions();

  setAutoFillCallback(() => {
    void autoFillAnswers(finalAnswers, questions, questionRuntime);
  });

  setQuestionListSendCallback((selected) => {
    questions = selected;
    hideQuestionList();
    openPanelAndQuery();
  });

  connectKeepAlive();

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, _sendResponse) => {
      handleBackgroundMessage(message);
    },
  );

  chrome.runtime.onMessage.addListener(handlePopupMessage);

  startWatermarkRemoval();
  if (pasteLimitDisabled) {
    removePasteRestriction();
  }
  if (textSelectEnabled) {
    removeSelectRestriction();
  }
  if (copyBtnEnabled) {
    addCopyButtons();
  }

  if (questions.length > 0) {
    safeSendMessage({ type: 'QUESTION_PAGE_READY' });
  }
}

void initialize();
