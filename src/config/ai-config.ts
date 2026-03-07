import type { ProviderConfig } from '../types/provider';

export const AI_PROVIDERS: readonly ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domain: 'chat.deepseek.com',
    color: '#4D6BFE',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    domain: 'www.kimi.com',
    color: '#1A73E8',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'claude',
    name: 'Claude',
    domain: 'claude.ai',
    color: '#D97706',
    weight: 1.2,
    enabled: true,
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    domain: 'chatgpt.com',
    color: '#10A37F',
    weight: 1.2,
    enabled: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    domain: 'gemini.google.com',
    color: '#4285F4',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'doubao',
    name: '豆包',
    domain: 'doubao.com',
    color: '#FF6B35',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'grok',
    name: 'Grok',
    domain: 'grok.com',
    color: '#000000',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'qwen-cn',
    name: '通义千问',
    domain: 'qianwen.com',
    color: '#FF6A00',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'qwen-intl',
    name: 'Qwen (Intl)',
    domain: 'chat.qwen.ai',
    color: '#FF6A00',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'chatglm',
    name: '智谱清言',
    domain: 'chatglm.cn',
    color: '#36B37E',
    weight: 1.0,
    enabled: true,
  },

] as const satisfies readonly ProviderConfig[];

const providerMap = new Map<string, ProviderConfig>(
  AI_PROVIDERS.map((p) => [p.id, p]),
);

export function getProviderById(id: string): ProviderConfig | undefined {
  return providerMap.get(id);
}

export function getEnabledProviders(): ProviderConfig[] {
  return AI_PROVIDERS.filter((p) => p.enabled);
}

export function getProviderByDomain(hostname: string): ProviderConfig | undefined {
  return AI_PROVIDERS.find((p) => hostname === p.domain || hostname.endsWith(`.${p.domain}`));
}
