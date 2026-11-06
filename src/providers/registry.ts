import { getEnabledModels } from '../config/model-sources';
import type { AIProvider, ModelProviderConfig } from '../types';
import { OpenAICompatibleProvider } from './openai-compatible';

function instantiate(config: ModelProviderConfig): AIProvider {
  return new OpenAICompatibleProvider(config);
}

/** Every enabled model across all configured API sources. */
export async function getEnabledProvidersAsync(): Promise<AIProvider[]> {
  return (await getEnabledModels()).map(instantiate);
}

/** Resolve a subset of enabled models by their provider ids. */
export async function getProvidersByIdsAsync(ids: string[]): Promise<AIProvider[]> {
  const idSet = new Set(ids);
  return (await getEnabledModels())
    .filter((config) => idSet.has(config.id))
    .map(instantiate);
}

/** Resolve one enabled model (used by per-model retransmit). */
export async function getProviderByIdAsync(id: string): Promise<AIProvider | undefined> {
  const config = (await getEnabledModels()).find((c) => c.id === id);
  return config ? instantiate(config) : undefined;
}
