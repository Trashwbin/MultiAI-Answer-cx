import { lookupModelInfo, ruleBasedInfo } from './model-catalog';
import { modelProviderId } from '../config/model-sources';
import type {
  CapabilitySource,
  CatalogStyle,
  ChatStyle,
  DiscoveredModel,
} from '../types/provider';
import type { ProbeResult } from '../types/messages';

const PROBE_TIMEOUT_MS = 4000;

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Normalize a user-entered base URL to an origin (+ optional path, no trailing /). */
function normalizeBase(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '');
  // A pasted chat-completions URL should be treated as its /v1 root.
  s = s.replace(/\/chat\/completions$/i, '');
  // Accept scheme-less input (e.g. "api.example.com/v1").
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function isLocal(origin: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin);
}

function originOf(base: string): string {
  try { return new URL(base).origin; } catch { return base; }
}

/** Derive the chat/completions URL from the base that actually answered. */
function deriveChatPath(base: string, catalogStyle: CatalogStyle, openAiCatalogHit: boolean): {
  chatStyle: ChatStyle;
  chatPath: string;
} {
  // Many gateways serve OpenAI chat on /v1/chat/completions even when their
  // model list was discovered via /api/tags.
  if (openAiCatalogHit || catalogStyle !== 'ollama') {
    const root = base.replace(/\/v1$/i, '');
    return { chatStyle: 'openai-chat', chatPath: `${root}/v1/chat/completions` };
  }
  return { chatStyle: 'ollama-chat', chatPath: `${base.replace(/\/v1$/i, '')}/api/chat` };
}

function candidateBases(raw: string): string[] {
  const base = normalizeBase(raw);
  const out = [base];
  // ± /v1 adaptation
  if (/\/v1$/i.test(base)) out.push(base.replace(/\/v1$/i, ''));
  else out.push(`${base}/v1`);
  // non-local http -> https fallback
  if (/^http:\/\//i.test(base) && !isLocal(originOf(base))) {
    out.push(base.replace(/^http:/i, 'https:'));
    out.push(`${base.replace(/^http:/i, 'https:')}/v1`);
  }
  return [...new Set(out)];
}

async function getJson(
  url: string,
  apiKey: string,
  extra?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ ok: true; data: unknown; status: number } | { ok: false; status: number; error: string; kind: ProbeResult['errorKind'] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', ...(extra?.headers ?? {}) };
    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['x-api-key'] = apiKey;
      headers['x-goog-api-key'] = apiKey;
    }
    if (extra?.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      method: extra?.method ?? 'GET',
      headers,
      body: extra?.body === undefined ? undefined : JSON.stringify(extra.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const kind: ProbeResult['errorKind'] =
        res.status === 401 || res.status === 403 ? 'auth'
          : res.status === 404 ? 'not_found' : 'unknown';
      return { ok: false, status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, kind };
    }
    const text = await res.text();
    let data: unknown;
    try { data = JSON.parse(text); }
    catch { return { ok: false, status: res.status, error: '响应不是 JSON', kind: 'parse' }; }
    return { ok: true, data, status: res.status };
  } catch (err) {
    const msg = errorMessage(err);
    return {
      ok: false,
      status: 0,
      error: /abort/i.test(msg) ? '请求超时' : msg,
      kind: 'network',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the raw model array + detect the catalog shape from a /models response. */
function extractRawModels(data: unknown): { items: unknown[]; style: CatalogStyle } | undefined {
  if (!isRecord(data)) return undefined;
  if (Array.isArray(data.data)) return { items: data.data, style: 'openai' };
  if (Array.isArray(data.models)) {
    // Ollama /api/tags uses { models: [...] }; Gemini native uses same key.
    return { items: data.models, style: 'ollama' };
  }
  if (Array.isArray(data)) return { items: data, style: 'openai' };
  return undefined;
}

function baseId(item: Json): string | undefined {
  return str(item.id) ?? str(item.name) ?? str(item.model) ?? str(item.model_name);
}

interface InlineMeta {
  modelId: string;
  displayName?: string;
  ownedBy?: string;
  created?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoning?: boolean;
  reasoningLevels?: string[];
  vision?: boolean;
  rawMeta?: Json;
}

/** Parse inline metadata carried by the catalog response itself. */
function parseInline(item: Json, style: CatalogStyle): InlineMeta | undefined {
  const modelId = baseId(item);
  if (!modelId) return undefined;

  const meta: InlineMeta = { modelId, rawMeta: item };
  meta.displayName = str(item.display_name) ?? str(item.displayName) ?? str(item.name);
  meta.ownedBy = str(item.owned_by) ?? str(item.ownedBy);
  meta.created = num(item.created);

  // context / output limits — many naming conventions across gateways.
  meta.contextWindow =
    num(item.context_window) ?? num(item.contextWindow) ??
    num(item.context_length) ?? num(item.inputTokenLimit) ??
    num((item.top_provider as Json | undefined)?.context_length) ??
    num((item.limit as Json | undefined)?.context) ??
    num((item.meta as Json | undefined)?.context_window) ??
    num((item.details as Json | undefined)?.context_length);
  meta.maxOutputTokens =
    num(item.max_output_tokens) ?? num(item.maxOutputTokens) ??
    num((item.top_provider as Json | undefined)?.max_completion_tokens) ??
    num((item.limit as Json | undefined)?.output);

  // reasoning — inline fields used by various OpenAI-compatible gateways.
  const inlineReasoning = bool(item.reasoning);
  if (inlineReasoning !== undefined) {
    meta.reasoning = inlineReasoning;
  } else if (Array.isArray(item.supported_parameters)) {
    meta.reasoning = (item.supported_parameters as unknown[]).includes('reasoning');
  }
  const levels = item.supported_reasoning_levels ?? item.reasoning_levels;
  if (Array.isArray(levels)) {
    meta.reasoningLevels = (levels as unknown[])
      .map((l) => (isRecord(l) ? str(l.effort) : str(l)))
      .filter((v): v is string => !!v);
  }

  // vision — input modalities only; `attachment` also covers pdf/audio.
  const modalities = item.modalities;
  const inputModalities = Array.isArray(modalities)
    ? modalities
    : (isRecord(modalities) ? modalities.input : undefined) ??
      (item.architecture as Json | undefined)?.input_modalities;
  if (Array.isArray(inputModalities)) {
    meta.vision = (inputModalities as unknown[]).some(
      (m) => typeof m === 'string' && m.toLowerCase() === 'image',
    );
  }

  // Ollama-style /api/tags exposes capabilities + details.
  if (Array.isArray(item.capabilities)) {
    const caps = (item.capabilities as unknown[]).filter(
      (c): c is string => typeof c === 'string',
    ).map((c) => c.toLowerCase());
    if (meta.vision === undefined && caps.includes('vision')) meta.vision = true;
    if (meta.reasoning === undefined &&
        (caps.includes('thinking') || caps.includes('reasoning'))) {
      meta.reasoning = true;
    }
  }
  if (style === 'ollama' && isRecord(item.details)) {
    meta.ownedBy = str((item.details as Json).family) ?? meta.ownedBy;
  }
  return meta;
}

/** Fill capability gaps from the catalog / rules / defaults, tagging sources. */
function finalize(meta: InlineMeta): DiscoveredModel['source'] {
  const catalog = lookupModelInfo(meta.modelId);
  const rules = ruleBasedInfo(meta.modelId);
  const source: DiscoveredModel['source'] = {
    reasoning: 'default', vision: 'default',
    contextWindow: 'default', maxOutputTokens: 'default',
  };

  const set = (
    field: keyof DiscoveredModel['source'],
    inline: unknown,
    catalogValue: unknown,
    ruleValue: unknown,
    apply: (v: never) => void,
  ): void => {
    if (inline !== undefined) { source[field] = 'endpoint'; apply(inline as never); }
    else if (catalogValue !== undefined) { source[field] = 'catalog'; apply(catalogValue as never); }
    else if (ruleValue !== undefined) { source[field] = 'rule'; apply(ruleValue as never); }
    else { source[field] = 'default'; }
  };

  const result: Partial<InlineMeta> = {};
  set('reasoning', meta.reasoning, catalog?.reasoning, rules.reasoning,
    (v) => { result.reasoning = v as boolean; });
  set('vision', meta.vision, catalog?.vision, rules.vision,
    (v) => { result.vision = v as boolean; });
  set('contextWindow', meta.contextWindow, catalog?.context, undefined,
    (v) => { result.contextWindow = v as number; });
  set('maxOutputTokens', meta.maxOutputTokens, catalog?.maxOutput, undefined,
    (v) => { result.maxOutputTokens = v as number; });

  Object.assign(meta, result);
  if (meta.reasoning === undefined) meta.reasoning = false;
  if (meta.vision === undefined) meta.vision = false;
  return source;
}

function toDiscovered(meta: InlineMeta, sourceId: string, source: DiscoveredModel['source']): DiscoveredModel {
  return {
    id: modelProviderId(sourceId, meta.modelId),
    modelId: meta.modelId,
    displayName: meta.displayName,
    ownedBy: meta.ownedBy,
    created: meta.created,
    contextWindow: meta.contextWindow,
    maxOutputTokens: meta.maxOutputTokens,
    reasoning: meta.reasoning,
    reasoningLevels: meta.reasoningLevels,
    vision: meta.vision,
    source,
    rawMeta: meta.rawMeta,
    enabled: false,
  };
}

/** Best-effort extra context from Ollama /api/show (one call per model, bounded). */
async function enrichOllama(base: string, apiKey: string, items: Json[]): Promise<void> {
  const root = base.replace(/\/v1$/i, '');
  const limited = items.slice(0, 40);
  await Promise.all(limited.map(async (item) => {
    const name = baseId(item);
    if (!name) return;
    const res = await getJson(`${root}/api/show`, apiKey, {
      method: 'POST', body: { name },
    });
    if (res.ok && isRecord(res.data)) {
      const info = res.data;
      const ctx = num((info.model_info as Json | undefined)?.['general.context_length']);
      if (ctx !== undefined) (item as Json)._contextWindow = ctx;
    }
  }));
}

export async function probeApiSource(
  rawBaseUrl: string,
  apiKey: string,
  sourceId: string,
): Promise<ProbeResult> {
  const bases = candidateBases(rawBaseUrl);
  const primaryBase = normalizeBase(rawBaseUrl);
  const origin = originOf(primaryBase);

  // 1. Host permission check. chrome.permissions.request() MUST run in a
  //    user gesture, so the options page requests it before sending us a
  //    probe message. Here we only verify; a missing grant is reported back
  //    with errorKind 'permission' so the UI can retry from a click handler.
  if (!isLocal(origin)) {
    try {
      const has = await chrome.permissions.contains({ origins: [`${origin}/*`] });
      if (!has) {
        return {
          success: false,
          error: '缺少该域名的访问权限，请在配置页重新点击拉取以授权',
          errorKind: 'permission',
        };
      }
    } catch (err) {
      return { success: false, error: errorMessage(err), errorKind: 'permission' };
    }
  }

  // 2. Probe catalog endpoints.
  let lastError = '';
  let lastKind: ProbeResult['errorKind'] = 'unknown';
  let hit: { base: string; path: string; items: unknown[]; style: CatalogStyle } | undefined;
  // Many gateways expose both an Ollama-style /api/tags catalog and an
  // OpenAI-style chat endpoint. If any OpenAI endpoint answered, prefer it.
  let sawOpenAiChat = false;

  for (const base of bases) {
    const candidates: Array<{ path: string; style: CatalogStyle }> = [
      { path: '/v1/models', style: 'openai' },
      { path: '/models', style: 'openai' },
      { path: '/api/tags', style: 'ollama' },
    ];
    if (/\/v1$/i.test(base)) {
      candidates.unshift({ path: '/models', style: 'openai' });
    }
    for (const cand of candidates) {
      const url = `${base}${cand.path}`;
      const res = await getJson(url, apiKey);
      if (!res.ok) {
        lastError = res.error;
        lastKind = res.kind;
        // Auth failure is decisive — don't keep hammering with the same key.
        if (res.kind === 'auth') {
          return { success: false, error: res.error, errorKind: 'auth' };
        }
        continue;
      }
      if (cand.style === 'openai') sawOpenAiChat = true;
      const extracted = extractRawModels(res.data);
      if (extracted && extracted.items.length > 0) {
        hit = { base, path: cand.path, items: extracted.items, style: extracted.style };
        break;
      }
      lastError = '模型列表为空或格式无法识别';
      lastKind = 'parse';
    }
    if (hit) break;
  }

  if (!hit) {
    return { success: false, error: lastError || '未找到可用的模型列表端点', errorKind: lastKind };
  }

  // 3. catalogStyle / chatStyle are separate: the model-list protocol does
  //    not dictate the chat protocol. Prefer OpenAI chat whenever an OpenAI
  //    endpoint answered, even when the catalog came from /api/tags.
  const catalogPath = `${hit.base}${hit.path}`;
  const openAiCatalogHit = hit.path !== '/api/tags';
  const catalogStyle: CatalogStyle = hit.style;
  const { chatStyle, chatPath } = deriveChatPath(
    hit.base, catalogStyle, openAiCatalogHit || sawOpenAiChat,
  );

  if (hit.style === 'ollama') {
    await enrichOllama(hit.base, apiKey, hit.items.filter(isRecord));
  }

  const models: DiscoveredModel[] = [];
  for (const raw of hit.items) {
    if (!isRecord(raw)) continue;
    const meta = parseInline(raw, hit.style);
    if (!meta) continue;
    const showCtx = num((raw as Json)._contextWindow);
    if (meta.contextWindow === undefined && showCtx !== undefined) {
      meta.contextWindow = showCtx;
    }
    const source = finalize(meta);
    models.push(toDiscovered(meta, sourceId, source));
  }

  if (models.length === 0) {
    return { success: false, error: '模型列表中没有可识别的模型', errorKind: 'parse' };
  }

  return {
    success: true,
    baseUrl: hit.base,
    catalogStyle,
    catalogPath,
    chatStyle,
    chatPath,
    models,
  };
}

export function capabilityLabel(source: CapabilitySource): string {
  switch (source) {
    case 'endpoint': return '端点';
    case 'catalog': return '目录';
    case 'rule': return '推断';
    case 'default': return '默认';
  }
}
