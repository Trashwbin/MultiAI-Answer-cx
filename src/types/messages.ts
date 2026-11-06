import type { Question } from './question';
import type { ProviderResponse } from './answer';
import type { PromptMode, ApiSource, AggregationConfig, SessionCleanupMode } from './provider';

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

interface QueryStartMessage {
  type: 'QUERY_START';
  providerIds: string[];
  weightProviderId?: string | null;
}

interface QueryCompleteMessage {
  type: 'QUERY_COMPLETE';
  durationMs: number;
}

interface QuestionPageReadyMessage {
  type: 'QUESTION_PAGE_READY';
}

interface ProbeModelsMessage {
  type: 'PROBE_MODELS';
  baseUrl: string;
  apiKey: string;
}

interface GetApiSourcesMessage {
  type: 'GET_API_SOURCES';
}

interface SaveApiSourceMessage {
  type: 'SAVE_API_SOURCE';
  source: ApiSource;
}

interface DeleteApiSourceMessage {
  type: 'DELETE_API_SOURCE';
  sourceId: string;
}

interface GetEnabledModelsMessage {
  type: 'GET_ENABLED_MODELS';
}

interface GetCatalogStatusMessage {
  type: 'GET_CATALOG_STATUS';
}

interface GetAggregationConfigMessage {
  type: 'GET_AGGREGATION_CONFIG';
}

interface SetAggregationConfigMessage {
  type: 'SET_AGGREGATION_CONFIG';
  config: AggregationConfig;
}

export type ExtensionMessage =
  | QueryAIMessage
  | QueryAllAIMessage
  | ShowAnswerMessage
  | QueryStartMessage
  | QueryCompleteMessage
  | QuestionPageReadyMessage
  | ProbeModelsMessage
  | GetApiSourcesMessage
  | SaveApiSourceMessage
  | DeleteApiSourceMessage
  | GetEnabledModelsMessage
  | GetCatalogStatusMessage
  | GetAggregationConfigMessage
  | SetAggregationConfigMessage;

/** Result of PROBE_MODELS, sent back through sendResponse. */
export interface ProbeResult {
  success: boolean;
  error?: string;
  errorKind?: 'auth' | 'network' | 'not_found' | 'parse' | 'permission' | 'unknown';
  catalogStyle?: ApiSource['catalogStyle'];
  catalogPath?: string;
  chatStyle?: ApiSource['chatStyle'];
  chatPath?: string;
  models?: import('./provider').DiscoveredModel[];
  baseUrl?: string;
}
