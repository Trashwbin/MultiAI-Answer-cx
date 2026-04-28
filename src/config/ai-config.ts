import type { ProviderConfig, CustomProviderConfig } from '../types/provider';

export const AI_PROVIDERS: readonly ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domain: 'chat.deepseek.com',
    color: '#4D6BFE',
    iconPath: 'icons/providers/deepseek.ico',
    weight: 1.2,
    enabled: true,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    domain: 'www.kimi.com',
    color: '#1A73E8',
    iconPath: 'icons/providers/kimi.ico',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'doubao',
    name: '豆包',
    domain: 'doubao.com',
    color: '#FF6B35',
    iconPath: 'icons/providers/doubao.png',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'qwen-cn',
    name: '通义千问',
    domain: 'qianwen.com',
    color: '#FF6A00',
    iconPath: 'icons/providers/qwen.png',
    weight: 1.0,
    enabled: true,
  },
  {
    id: 'chatglm',
    name: '智谱清言',
    domain: 'chatglm.cn',
    color: '#36B37E',
    iconPath: 'icons/providers/chatglm.ico',
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

const CUSTOM_PROVIDERS_KEY = 'CUSTOM_PROVIDERS';

export async function getCustomProviders(): Promise<CustomProviderConfig[]> {
  const result = await chrome.storage.local.get(CUSTOM_PROVIDERS_KEY);
  const providers = result[CUSTOM_PROVIDERS_KEY] as CustomProviderConfig[] | undefined;
  return providers ?? [];
}

export async function saveCustomProvider(config: CustomProviderConfig): Promise<void> {
  const providers = await getCustomProviders();
  providers.push(config);
  await chrome.storage.local.set({ [CUSTOM_PROVIDERS_KEY]: providers });
}

export async function deleteCustomProvider(id: string): Promise<void> {
  const providers = await getCustomProviders();
  const filtered = providers.filter((p) => p.id !== id);
  await chrome.storage.local.set({ [CUSTOM_PROVIDERS_KEY]: filtered });
}

export async function updateCustomProvider(config: CustomProviderConfig): Promise<void> {
  const providers = await getCustomProviders();
  const index = providers.findIndex((p) => p.id === config.id);
  if (index !== -1) {
    providers[index] = config;
    await chrome.storage.local.set({ [CUSTOM_PROVIDERS_KEY]: providers });
  }
}
