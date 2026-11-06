// Generates src/data/model-catalog-snapshot.json — the offline baseline of the
// models.dev catalog, shipped inside the extension.
//
// Source: @opencode-ai/models/snapshot (official models.dev SDK, MIT).
// Run: npm run build:catalog   (or: node -I scripts/build-model-snapshot.mjs)
//
// The SDK snapshot mirrors https://models.dev/api.json. We keep only the fields
// needed for capability lookups so the bundled JSON stays small.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outFile = resolve(root, 'src/data/model-catalog-snapshot.json');

const pkgDir = resolve(root, 'node_modules/@opencode-ai/models');
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));
const snapshotUrl = pathToFileURL(resolve(pkgDir, 'dist/snapshot.js')).href;

const snap = await import(snapshotUrl);
const providers = snap.providers ?? snap.default?.providers ?? snap.default;
if (!providers || typeof providers !== 'object') {
  throw new Error('Could not read providers from @opencode-ai/models/snapshot');
}

/** vision must come from input modalities; `attachment` also covers pdf/audio. */
function hasVision(model) {
  const input = model?.modalities?.input;
  if (!Array.isArray(input)) return undefined;
  return input.some((m) => typeof m === 'string' && m.toLowerCase() === 'image');
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

const models = {};
let skipped = 0;

function put(id, entry) {
  if (!id) return;
  const key = id.toLowerCase();
  const prev = models[key];
  models[key] = prev ? { ...prev, ...entry } : entry;
}

for (const provider of Object.values(providers)) {
  const modelMap = provider?.models;
  if (!modelMap || typeof modelMap !== 'object') continue;

  for (const [rawId, model] of Object.entries(modelMap)) {
    if (!model || typeof model !== 'object') { skipped++; continue; }
    const entry = {};
    if (typeof model.reasoning === 'boolean') entry.reasoning = model.reasoning;
    const vision = hasVision(model);
    if (vision !== undefined) entry.vision = vision;
    const context = num(model.limit?.context);
    if (context !== undefined) entry.context = context;
    const maxOutput = num(model.limit?.output);
    if (maxOutput !== undefined) entry.maxOutput = maxOutput;
    if (typeof model.canonical_model_id === 'string' && model.canonical_model_id) {
      entry.canonicalId = model.canonical_model_id;
    }
    put(rawId, entry);

    // Alias the canonical lab/model id so `provider/model` ids also resolve.
    if (entry.canonicalId && entry.canonicalId !== rawId) {
      put(entry.canonicalId, entry);
    }
  }
}

const generatedAt = snap.generatedAt ?? snap.default?.generatedAt ?? new Date().toISOString();
const index = {
  generatedAt,
  source: `@opencode-ai/models@${pkg.version} (models.dev, MIT)`,
  models,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(index), 'utf8');
console.log(
  `[build:catalog] wrote ${Object.keys(models).length} entries (${skipped} skipped) ` +
  `from ${index.source}, generatedAt=${generatedAt}`,
);
