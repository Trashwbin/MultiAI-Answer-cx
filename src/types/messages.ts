import type { Question } from './question';
import type { ProviderResponse } from './answer';
import type { PromptMode, CustomProviderConfig, SessionCleanupMode } from './provider';

interface QueryAIMessage {
  type: 'QUERY_AI';
  providerId: string;
  questions: Question[];
  sessionCleanupMode?: SessionCleanupMode;
}

interface QueryAllAIMessage {
  type: 'QUERY_ALL_AI';
  questions: Question[];
  providerIds?: string[];
  batchMode?: boolean;
  promptMode?: PromptMode;
  sessionCleanupMode?: SessionCleanupMode;
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

interface QueryStartMessage {
  type: 'QUERY_START';
  providerIds: string[];
}

interface QueryCompleteMessage {
  type: 'QUERY_COMPLETE';
  durationMs: number;
}

interface QuestionPageReadyMessage {
  type: 'QUESTION_PAGE_READY';
}

interface TestProviderMessage {
  type: 'TEST_PROVIDER';
  providerId: string;
  question: string;
}

interface DebugCookiesMessage {
  type: 'DEBUG_COOKIES';
  providerId: string;
}

interface ClearAllCredentialsMessage {
  type: 'CLEAR_ALL_CREDENTIALS';
}

interface StorageCapturedMessage {
  type: 'STORAGE_CAPTURED';
  providerId: string;
  storage: Record<string, string>;
}

interface BearerCapturedMessage {
  type: 'BEARER_CAPTURED';
  providerId: string;
  bearerToken: string;
}

interface ExecPageFuncMessage {
  type: 'EXEC_PAGE_FUNC';
  funcName: string;
  args: string[];
}

interface SaveCustomProviderMessage {
  type: 'SAVE_CUSTOM_PROVIDER';
  config: CustomProviderConfig;
}

interface DeleteCustomProviderMessage {
  type: 'DELETE_CUSTOM_PROVIDER';
  providerId: string;
}

interface GetCustomProvidersMessage {
  type: 'GET_CUSTOM_PROVIDERS';
}

export type ExtensionMessage =
  | QueryAIMessage
  | QueryAllAIMessage
  | ShowAnswerMessage
  | QueryStartMessage
  | QueryCompleteMessage
  | AuthLoginMessage
  | AuthStatusMessage
  | AuthLogoutMessage
  | AuthStatusAllMessage
  | QuestionPageReadyMessage
  | TestProviderMessage
  | DebugCookiesMessage
  | ClearAllCredentialsMessage
  | StorageCapturedMessage
  | BearerCapturedMessage
  | ExecPageFuncMessage
  | SaveCustomProviderMessage
  | DeleteCustomProviderMessage
  | GetCustomProvidersMessage;
