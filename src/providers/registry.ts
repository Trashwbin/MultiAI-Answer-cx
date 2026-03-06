import { AI_PROVIDERS, getEnabledProviders as getEnabledConfigs } from '../config/ai-config';
import type { AIProvider, ProviderConfig } from '../types';
import { ChatGLMProvider } from './chatglm';
import { ChatGPTProvider } from './chatgpt';
import { ClaudeProvider } from './claude';
import { DeepSeekProvider } from './deepseek';
import { DoubaoProvider } from './doubao';
import { GeminiProvider } from './gemini';
import { GrokProvider } from './grok';
import { KimiProvider } from './kimi';
import { MockProvider } from './mock';
import { QwenProvider } from './qwen';

type ProviderFactory = (config: ProviderConfig) => AIProvider;

const FACTORIES: Record<string, ProviderFactory> = {
  deepseek: (config) => new DeepSeekProvider(config),
  kimi: (config) => new KimiProvider(config),
  claude: (config) => new ClaudeProvider(config),
  chatgpt: (config) => new ChatGPTProvider(config),
  gemini: (config) => new GeminiProvider(config),
  doubao: (config) => new DoubaoProvider(config),
  grok: (config) => new GrokProvider(config),
  'qwen-cn': (config) => new QwenProvider(config),
  'qwen-intl': (config) => new QwenProvider(config),
  chatglm: (config) => new ChatGLMProvider(config),
  'mock-fast': (config) => new MockProvider(config),
  'mock-slow': (config) => new MockProvider(config),
  'mock-fail': (config) => new MockProvider(config),
};

export function getEnabledProviders(): AIProvider[] {
  return getEnabledConfigs()
    .map((config) => {
      const factory = FACTORIES[config.id];
      return factory ? factory(config) : undefined;
    })
    .filter((provider): provider is AIProvider => provider !== undefined);
}

export function getProvidersByIds(ids: string[]): AIProvider[] {
  const idSet = new Set(ids);
  return AI_PROVIDERS
    .filter((config) => idSet.has(config.id))
    .map((config) => {
      const factory = FACTORIES[config.id];
      return factory ? factory(config) : undefined;
    })
    .filter((provider): provider is AIProvider => provider !== undefined);
}

export function getProviderById(id: string): AIProvider | undefined {
  const config = AI_PROVIDERS.find((provider) => provider.id === id);
  if (!config) {
    return undefined;
  }
  const factory = FACTORIES[config.id];
  return factory ? factory(config) : undefined;
}
