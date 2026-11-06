import type { Question } from './question';
import type { ProviderResponse } from './answer';

export type PromptMode = 'standard' | 'analysis';
export type SessionCleanupMode = 'off' | 'on_success';

/** Minimal config shared by every provider instance (one instance per enabled model). */
export interface ProviderConfig {
  id: string;
  name: string;
  color: string;
}

/** Concrete config used by OpenAICompatibleProvider. */
export interface ModelProviderConfig extends ProviderConfig {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
}

export type CapabilitySource = 'endpoint' | 'catalog' | 'rule' | 'default';

/** A model as discovered from an API source's catalog endpoint. */
export interface DiscoveredModel {
  /** Globally unique provider id: `${sourceId}::${modelId}`. */
  id: string;
  /** Raw model id as sent to the API. */
  modelId: string;
  displayName?: string;
  ownedBy?: string;
  created?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  reasoningLevels?: string[];
  vision?: boolean;
  /** Where each capability value came from, so the UI can label guesses. */
  source: {
    reasoning: CapabilitySource;
    vision: CapabilitySource;
    contextWindow: CapabilitySource;
    maxOutputTokens: CapabilitySource;
  };
  rawMeta?: Record<string, unknown>;
  enabled: boolean;
}

export type CatalogStyle = 'openai' | 'ollama';
export type ChatStyle = 'openai-chat' | 'ollama-chat';

/** A user-configured API source (one base URL + apikey). */
export interface ApiSource {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  color: string;
  catalogStyle: CatalogStyle;
  /** Full URL that answered the model-list request. */
  catalogPath: string;
  chatStyle: ChatStyle;
  /** Full URL used for chat completions. */
  chatPath: string;
  models: DiscoveredModel[];
  createdAt: number;
  lastFetchedAt?: number;
}

export interface AIProvider {
  config: ProviderConfig;
  promptMode: PromptMode;
  sessionCleanupMode: SessionCleanupMode;
  query(questions: Question[]): Promise<ProviderResponse>;
}

/* ── models.dev catalog types ─────────────────────────── */

export interface CatalogEntry {
  reasoning?: boolean;
  vision?: boolean;
  context?: number;
  maxOutput?: number;
  canonicalId?: string;
}

/** Shape of both the bundled snapshot and the runtime cache. */
export interface ModelCatalogIndex {
  generatedAt: string;
  source: string;
  models: Record<string, CatalogEntry>;
}

export interface CatalogStatus {
  /** Which layer is currently serving lookups. */
  active: 'runtime' | 'bundled';
  bundledGeneratedAt: string;
  runtimeFetchedAt?: number;
  runtimeSource?: string;
  entryCount: number;
  lastError?: string;
}

/** Global answer-aggregation preference. */
export interface AggregationConfig {
  /** Model id (`sourceId::modelId`) whose answer wins open questions and ties. */
  weightProviderId: string | null;
}
