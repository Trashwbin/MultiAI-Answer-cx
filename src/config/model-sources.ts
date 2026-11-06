import type { AggregationConfig, ApiSource, ModelProviderConfig } from '../types/provider';

const API_SOURCES_KEY = 'API_SOURCES';
const AGGREGATION_KEY = 'AGGREGATION_CONFIG';

/** Stable palette, assigned in order when a source is created. */
const SOURCE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

export function nextSourceColor(existing: ApiSource[]): string {
  return SOURCE_COLORS[existing.length % SOURCE_COLORS.length] ?? SOURCE_COLORS[0]!;
}

export function createSourceId(): string {
  return `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function modelProviderId(sourceId: string, modelId: string): string {
  return `${sourceId}::${modelId}`;
}

export async function getApiSources(): Promise<ApiSource[]> {
  const result = await chrome.storage.local.get(API_SOURCES_KEY);
  const sources = result[API_SOURCES_KEY] as ApiSource[] | undefined;
  return Array.isArray(sources) ? sources : [];
}

export async function saveApiSource(source: ApiSource): Promise<void> {
  const sources = await getApiSources();
  const index = sources.findIndex((s) => s.id === source.id);
  if (index === -1) sources.push(source);
  else sources[index] = source;
  await chrome.storage.local.set({ [API_SOURCES_KEY]: sources });
}

export async function deleteApiSource(id: string): Promise<void> {
  const sources = await getApiSources();
  await chrome.storage.local.set({
    [API_SOURCES_KEY]: sources.filter((s) => s.id !== id),
  });
}

/** Flat list of every enabled model, used by the registry and the UI. */
export async function getEnabledModels(): Promise<ModelProviderConfig[]> {
  const sources = await getApiSources();
  const out: ModelProviderConfig[] = [];
  for (const source of sources) {
    for (const model of source.models) {
      if (!model.enabled) continue;
      out.push({
        id: model.id,
        name: model.displayName || model.modelId,
        color: source.color,
        apiEndpoint: source.chatPath,
        apiKey: source.apiKey,
        modelName: model.modelId,
      });
    }
  }
  return out;
}

export async function getAggregationConfig(): Promise<AggregationConfig> {
  const result = await chrome.storage.local.get(AGGREGATION_KEY);
  const config = result[AGGREGATION_KEY] as AggregationConfig | undefined;
  return config ?? { weightProviderId: null };
}

export async function saveAggregationConfig(config: AggregationConfig): Promise<void> {
  await chrome.storage.local.set({ [AGGREGATION_KEY]: config });
}
