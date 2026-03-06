import type { Question } from './question';
import type { ProviderResponse } from './answer';

interface QueryAIMessage {
  type: 'QUERY_AI';
  providerId: string;
  questions: Question[];
}

interface QueryAllAIMessage {
  type: 'QUERY_ALL_AI';
  questions: Question[];
  providerIds?: string[];
}

interface ShowAnswerMessage {
  type: 'SHOW_ANSWER';
  providerId: string;
  response: ProviderResponse;
}

interface AuthLoginMessage {
  type: 'AUTH_LOGIN';
  providerId: string;
}

interface AuthStatusMessage {
  type: 'AUTH_STATUS';
  providerId: string;
}

interface AuthLogoutMessage {
  type: 'AUTH_LOGOUT';
  providerId: string;
}

interface AuthStatusAllMessage {
  type: 'AUTH_STATUS_ALL';
}

interface QuestionPageReadyMessage {
  type: 'QUESTION_PAGE_READY';
}

export type ExtensionMessage =
  | QueryAIMessage
  | QueryAllAIMessage
  | ShowAnswerMessage
  | AuthLoginMessage
  | AuthStatusMessage
  | AuthLogoutMessage
  | AuthStatusAllMessage
  | QuestionPageReadyMessage;
