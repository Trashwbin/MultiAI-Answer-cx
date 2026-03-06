import type { Question, FinalAnswer, ExtensionMessage } from '../types';
import { extractQuestionsFromXXT } from './extractor/extractor';
import { autoFillAnswers } from './auto-fill/auto-fill';
import { showAnswerPanel, updateAnswerPanel, setAutoFillCallback } from './panel/panel';
import { showQuestionList as showQuestionListModal, initQuestionList, setQuestionListSendCallback, hideQuestionList } from './panel/question-list';
import { showAISelector } from './panel/ai-selector';

let extensionEnabled = true;
let questions: Question[] = [];
let finalAnswers: FinalAnswer[] = [];
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

function handleShowAnswer(message: ExtensionMessage): void {
  if (message.type !== 'SHOW_ANSWER') return;

  const providerAnswers = message.response.answers;
  for (const pa of providerAnswers) {
    const existing = finalAnswers.find(
      (fa) => fa.questionNumber === pa.questionNumber,
    );
    if (existing) {
      existing.answer = pa.answer;
      existing.votes += 1;
      existing.totalProviders += 1;
    } else {
      finalAnswers.push({
        questionNumber: pa.questionNumber,
        answer: pa.answer,
        votes: 1,
        totalProviders: 1,
      });
    }
  }

  updateAnswerPanel(finalAnswers);
}

function safeSendMessage(message: ExtensionMessage): void {
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage(message).catch(() => {});
}

function sendQueryAllAI(providerIds?: string[]): void {
  if (questions.length === 0) return;

  safeSendMessage({ type: 'QUERY_ALL_AI', questions, providerIds });
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
      showAISelector((providerIds) => {
        finalAnswers = [];
        showAnswerPanel({ questions, finalAnswers, isLoading: true });
        sendQueryAllAI(providerIds);
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
    showAISelector((providerIds) => {
      finalAnswers = [];
      showAnswerPanel({ questions, finalAnswers, isLoading: true });
      sendQueryAllAI(providerIds);
    });
  });

  connectKeepAlive();

  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, _sendResponse) => {
      handleShowAnswer(message);
    },
  );

  chrome.runtime.onMessage.addListener(handlePopupMessage);

  removePageRestrictions();

  if (questions.length > 0) {
    safeSendMessage({ type: 'QUESTION_PAGE_READY' });
  }
}

initialize();
