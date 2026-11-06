import bundled from '../data/model-catalog-snapshot.json';
import type {
  CatalogEntry,
  CatalogStatus,
  ModelCatalogIndex,
} from '../types/provider';

const CATALOG_KEY = 'MODEL_CATALOG';
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MODELS_DEV_URL = 'https://models.dev/api.json';
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@opencode-ai/models@latest/dist/snapshot.js';

/** Minimal known-model rules, derived from model-probe's MIT rules.json. */
const REASONING_RE = /(?:^|[-_/])(r1|o1|o3|o4|thinking|think|reasoner|reasoning|qwq|qwen3.*think)(?:[-_/]|$)|deepseek-r|glm-[zZ]?-?[45].*think/i;
const VISION_RE = /(?:vision|-vl|vl-|[-_]4o|4v|claude-3|gemini.*(?:vision|flash|pro)|pixtral|llava|gpt-4o|gpt-5|gpt-4\.1|qwen.*vl)/i;

interface RuntimeCache {
  index: ModelCatalogIndex;
  fetchedAt: number;
  etag?: string;
  sourceUrl: string;
}

const L0 = bundled as ModelCatalogIndex;
let runtime: RuntimeCache | null = null;
let loaded = false;
let refreshPromise: Promise<void> | null = null;
let lastError: string | undefined;

function visionFromModalities(input: unknown): boolean | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.some((m) => typeof m === 'string' && m.toLowerCase() === 'image');
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Build the same slim index from a live api.json payload (or SDK snapshot). */
function buildIndex(payload: unknown, sourceUrl: string): ModelCatalogIndex {
  const rawProviders =
    (payload as { providers?: unknown })?.providers ?? payload;
  const models: Record<string, CatalogEntry> = {};

  const put = (id: string, entry: CatalogEntry): void => {
    if (!id) return;
    const key = id.toLowerCase();
    models[key] = models[key] ? { ...models[key], ...entry } : entry;
  };

  if (rawProviders && typeof rawProviders === 'object') {
    for (const provider of Object.values(rawProviders as Record<string, unknown>)) {
      const modelMap = (provider as { models?: unknown })?.models;
      if (!modelMap || typeof modelMap !== 'object') continue;
      for (const [rawId, model] of Object.entries(modelMap as Record<string, unknown>)) {
        const m = model as Record<string, unknown> | undefined;
        if (!m || typeof m !== 'object') continue;
        const entry: CatalogEntry = {};
        if (typeof m.reasoning === 'boolean') entry.reasoning = m.reasoning;
        const vision = visionFromModalities(
          (m.modalities as { input?: unknown } | undefined)?.input,
        );
        if (vision !== undefined) entry.vision = vision;
        const context = num((m.limit as { context?: unknown } | undefined)?.context);
        if (context !== undefined) entry.context = context;
        const maxOutput = num((m.limit as { output?: unknown } | undefined)?.output);
        if (maxOutput !== undefined) entry.maxOutput = maxOutput;
        if (typeof m.canonical_model_id === 'string' && m.canonical_model_id) {
          entry.canonicalId = m.canonical_model_id;
        }
        put(rawId, entry);
        if (entry.canonicalId && entry.canonicalId !== rawId) {
          put(entry.canonicalId, entry);
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: `models.dev runtime (${sourceUrl})`,
    models,
  };
}

function parsePayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // The SDK snapshot is ESM: `const data = JSON.parse("<escaped json>")`.
    const match = text.match(/JSON\.parse\(("(?:[^"\\]|\\.)*")\)/);
    if (match?.[1]) {
      return JSON.parse(JSON.parse(match[1]) as string);
    }
    throw new Error('unrecognized catalog payload');
  }
}

async function fetchJson(url: string): Promise<{ payload: unknown; etag?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    // Only send the ETag back to the origin that produced it.
    if (runtime?.etag && runtime.sourceUrl === url) {
      headers['If-None-Match'] = runtime.etag;
    }
    const res = await fetch(url, { headers, signal: controller.signal });
    if (res.status === 304) return { payload: null };
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const text = await res.text();
    return { payload: parsePayload(text), etag: res.headers.get('etag') ?? undefined };
  } finally {
    clearTimeout(timer);
  }
}

function writeCache(cache: RuntimeCache): Promise<void> {
  runtime = cache;
  return chrome.storage.local.set({ [CATALOG_KEY]: cache });
}

async function loadCache(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await chrome.storage.local.get(CATALOG_KEY);
    const cache = stored[CATALOG_KEY] as RuntimeCache | undefined;
    if (cache?.index?.models && Object.keys(cache.index.models).length > 0) {
      runtime = cache;
    }
  } catch (err) {
    lastError = errorMessage(err);
  }
}

/** Fetch the newest catalog. Never throws; failures silently keep the old layer. */
export function prefetchCatalog(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    await loadCache();
    if (runtime && Date.now() - runtime.fetchedAt < TTL_MS) return;

    for (const url of [MODELS_DEV_URL, CDN_URL]) {
      try {
        const { payload, etag } = await fetchJson(url);
        if (!payload) {
          // 304 / not modified — keep data, refresh the timestamp.
          if (runtime) await writeCache({ ...runtime, fetchedAt: Date.now() });
          lastError = undefined;
          return;
        }
        let index = buildIndex(payload, url);
        const liveCount = Object.keys(index.models).length;
        if (liveCount === 0) continue;
        // Guard against a truncated/partial response wiping the offline
        // baseline: merge L0 underneath whenever the live catalog is much
        // smaller than the bundled one.
        const baseCount = Object.keys(L0.models).length;
        if (baseCount > 0 && liveCount < baseCount * 0.5) {
          index = { ...index, models: { ...L0.models, ...index.models } };
        }
        await writeCache({
          index,
          fetchedAt: Date.now(),
          etag: etag ?? runtime?.etag,
          sourceUrl: url,
        });
        lastError = undefined;
        return;
      } catch (err) {
        lastError = errorMessage(err);
      }
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Strip relay decoration so catalog ids can match. */
function normalizedCandidates(id: string): string[] {
  const out = new Set<string>();
  const add = (v: string): void => { if (v) out.add(v.toLowerCase()); };
  add(id);
  // provider/model -> model
  const slash = id.lastIndexOf('/');
  if (slash !== -1) add(id.slice(slash + 1));
  // strip @date, [1m], :tag suffixes
  add(id.replace(/@\d{6,8}$/, '').replace(/\[[^\]]*\]$/, '').replace(/:[^:/]+$/, ''));
  const slash2 = id.lastIndexOf('/');
  if (slash2 !== -1) add(id.slice(slash2 + 1).replace(/@\d{6,8}$/, ''));
  return [...out];
}

export function lookupModelInfo(modelId: string): CatalogEntry | undefined {
  const index = runtime?.index ?? L0;
  for (const candidate of normalizedCandidates(modelId)) {
    const hit = index.models[candidate];
    if (hit) return hit;
  }
  // canonical id pass (index keys are lowercased)
  for (const candidate of normalizedCandidates(modelId)) {
    for (const entry of Object.values(index.models)) {
      if (entry.canonicalId?.toLowerCase() === candidate) return entry;
    }
  }
  return undefined;
}

/** Last-resort name heuristics, only used when no catalog entry matched. */
export function ruleBasedInfo(modelId: string): CatalogEntry {
  return {
    reasoning: REASONING_RE.test(modelId),
    vision: VISION_RE.test(modelId),
  };
}

export function getCatalogStatus(): CatalogStatus {
  const index = runtime?.index ?? L0;
  return {
    active: runtime ? 'runtime' : 'bundled',
    bundledGeneratedAt: L0.generatedAt,
    runtimeFetchedAt: runtime?.fetchedAt,
    runtimeSource: runtime?.sourceUrl,
    entryCount: Object.keys(index.models).length,
    lastError,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
