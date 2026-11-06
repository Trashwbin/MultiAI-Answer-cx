import type {
  ApiSource,
  CatalogStatus,
  DiscoveredModel,
  ModelProviderConfig,
} from '../types';
import type { ProbeResult } from '../types/messages';
import { nextSourceColor } from '../config/model-sources';

/* ── tiny DOM helpers ─────────────────────────────────── */

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}

function sourceLabel(s: DiscoveredModel['source'], key: keyof DiscoveredModel['source']): string {
  const v = s[key];
  return v === 'endpoint' ? '端点' : v === 'catalog' ? '目录' : v === 'rule' ? '推断' : '默认';
}

function fmtTokens(n?: number): string {
  if (n === undefined) return '—';
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/* ── state ────────────────────────────────────────────── */

let sources: ApiSource[] = [];
let probeResult: ProbeResult | null = null;
let enabledSelection = new Set<string>();
let editingSourceId: string | null = null;
/** True once the editor re-probed (vs. just showing saved models). */
let refetchedInEditor = false;
/** Model ids in the currently displayed table, indexed by row. */
let displayedModelIds: string[] = [];

async function send(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return await chrome.runtime.sendMessage(msg) as Record<string, unknown>;
}

/** Normalize to an absolute URL (accepts scheme-less input). */
function absoluteBase(baseUrl: string): string {
  const s = baseUrl.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

/** Is this base URL covered by the manifest's host_permissions already? */
function isLocalBase(baseUrl: string): boolean {
  try {
    const host = new URL(absoluteBase(baseUrl)).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
  } catch {
    return false;
  }
}

/**
 * chrome.permissions.request() requires an active user gesture and loses it
 * across any await or across a runtime.sendMessage hop. Therefore it MUST be
 * called directly inside the click handler, before any other await.
 * Returns the origin pattern or null when denied / not applicable.
 */
async function ensureHostPermission(baseUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isLocalBase(baseUrl)) return { ok: true };
  let origin: string;
  try {
    origin = new URL(absoluteBase(baseUrl)).origin;
  } catch {
    return { ok: false, error: 'Base URL 格式无效' };
  }
  const pattern = `${origin}/*`;
  try {
    // request() is a no-op (returns true without prompting) when the origin
    // is already granted, so skip the extra contains() await that would
    // consume the user gesture.
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) return { ok: false, error: '已取消授权' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ── rendering ────────────────────────────────────────── */

function renderSources(): void {
  const list = $('sourceList');
  if (sources.length === 0) {
    list.innerHTML = '<div class="card empty">还没有接入源。点右上角「+ 添加接入源」开始。</div>';
    return;
  }

  list.innerHTML = sources.map((s) => {
    const enabled = s.models.filter((m) => m.enabled).length;
    const fetched = s.lastFetchedAt
      ? new Date(s.lastFetchedAt).toLocaleString() : '—';
    return `
      <div class="card">
        <div class="source-head">
          <div class="dot" style="background:${esc(s.color)}"></div>
          <div class="source-info">
            <div class="source-name">${esc(s.name)}</div>
            <div class="source-url">${esc(s.baseUrl)}</div>
          </div>
          <div class="source-actions">
            <button class="btn btn-blue btn-sm" data-act="edit" data-id="${esc(s.id)}">编辑</button>
            <button class="btn btn-danger btn-sm" data-act="delete" data-id="${esc(s.id)}">删除</button>
          </div>
        </div>
        <div class="chips">
          <span class="chip">目录：${esc(s.catalogStyle)} · ${esc(s.catalogPath)}</span>
          <span class="chip">对话：${esc(s.chatPath)}</span>
          <span class="chip">模型 ${s.models.length} 个 · 已启用 ${enabled} 个</span>
          <span class="chip">上次拉取 ${esc(fetched)}</span>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['id'] ?? '';
      if (btn.dataset['act'] === 'edit') openEditor(id);
      else void deleteSource(id);
    });
  });
}

async function renderStatus(): Promise<void> {
  const bar = $('statusBar');
  try {
    const res = await send({ type: 'GET_CATALOG_STATUS' });
    const status = res.status as CatalogStatus | undefined;
    const modelsRes = await send({ type: 'GET_ENABLED_MODELS' });
    const total = Array.isArray(modelsRes.models)
      ? (modelsRes.models as ModelProviderConfig[]).length : 0;

    if (!status) {
      bar.textContent = `当前已启用 ${total} 个模型。`;
      return;
    }
    const activeLabel = status.active === 'runtime'
      ? '<span class="tag-runtime">运行时最新</span>'
      : '<span class="tag-bundled">随扩展打包的离线基线</span>';
    const runtimeInfo = status.runtimeFetchedAt
      ? ` · 运行时抓取于 ${new Date(status.runtimeFetchedAt).toLocaleString()}`
      : '';
    const err = status.lastError ? ` · <span style="color:#e53e3e">刷新失败：${esc(status.lastError)}</span>` : '';
    bar.innerHTML =
      `<strong>当前已启用 ${total} 个模型</strong> · 能力目录：${activeLabel}` +
      `（${status.entryCount} 条）· 基线生成于 ${esc(new Date(status.bundledGeneratedAt).toLocaleString())}` +
      `${runtimeInfo}${err}<br>` +
      `<span style="color:#a0aec0">数据来源 models.dev（MIT）；能力标签优先取端点内联字段，其次目录、名字推断。打包基线离线可用，联网时自动刷新。</span>`;
  } catch {
    bar.textContent = '目录状态读取失败。';
  }
}

function renderProbeResult(): void {
  if (!probeResult?.models) return;
  const models = probeResult.models;
  displayedModelIds = models.map((m) => m.id);
  $('probeResult').classList.remove('hidden');
  const heading = editingSourceId ? '当前模型列表' : '探测成功';
  $('probeSummary').innerHTML =
    `<strong>${heading}</strong>：<strong>${esc(probeResult.catalogStyle ?? '')}</strong> · ` +
    `目录 ${esc(probeResult.catalogPath ?? '')} · 对话 ${esc(probeResult.chatPath ?? '')} · ` +
    `<strong>${models.length}</strong> 个模型` +
    (editingSourceId
      ? '<br><span style="color:#718096">修改下方勾选后点「保存修改」。需要更新模型清单时点「重新拉取模型」，已有勾选会按模型 ID 保留。</span>'
      : '');

  $('modelBody').innerHTML = models.map((m, i) => {
    const on = enabledSelection.has(m.id);
    const rBadge = m.reasoning
      ? `<span class="badge badge-reasoning">推理</span><span class="src-tag">${sourceLabel(m.source, 'reasoning')}</span>`
      : '<span class="badge badge-off">—</span>';
    const vBadge = m.vision
      ? `<span class="badge badge-vision">视觉</span><span class="src-tag">${sourceLabel(m.source, 'vision')}</span>`
      : '';
    const levels = m.reasoningLevels?.length
      ? `<div class="model-name">档位：${esc(m.reasoningLevels.join(' / '))}</div>` : '';
    return `
      <tr>
        <td><input type="checkbox" data-i="${i}" ${on ? 'checked' : ''} style="accent-color:#4caf50;width:16px;height:16px;cursor:pointer"></td>
        <td>
          <div class="model-id">${esc(m.modelId)}</div>
          ${m.displayName ? `<div class="model-name">${esc(m.displayName)}</div>` : ''}
        </td>
        <td>${rBadge} ${vBadge}${levels}</td>
        <td class="meta-cell">${fmtTokens(m.contextWindow)}${m.maxOutputTokens ? ` / 出 ${fmtTokens(m.maxOutputTokens)}` : ''}</td>
        <td class="meta-cell">${esc(m.ownedBy ?? '—')}</td>
      </tr>`;
  }).join('');

  $('modelBody').querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = displayedModelIds[Number(cb.dataset['i'])];
      if (!id) return;
      if (cb.checked) enabledSelection.add(id);
      else enabledSelection.delete(id);
      updateSelCount();
    });
  });
  updateSelCount();
}

function updateSelCount(): void {
  const n = enabledSelection.size;
  const total = probeResult?.models?.length ?? 0;
  $('selCount').textContent = `已勾选 ${n} / ${total}`;
  ($<HTMLButtonElement>('saveBtn')).disabled = n === 0;
}

/* ── actions ──────────────────────────────────────────── */

function setMsg(text: string, kind: 'error' | 'ok' | '' = ''): void {
  const el = $('probeMsg');
  el.textContent = text;
  el.className = `msg ${kind === 'error' ? 'msg-error' : kind === 'ok' ? 'msg-ok' : ''}`;
}

async function loadSources(): Promise<void> {
  const res = await send({ type: 'GET_API_SOURCES' });
  sources = Array.isArray(res.sources) ? res.sources as ApiSource[] : [];
  renderSources();
  await renderStatus();
  await loadWeightSelect();
}

/** Fill the weight-model dropdown from currently enabled models. */
async function loadWeightSelect(): Promise<void> {
  const sel = $<HTMLSelectElement>('weightSelect');
  const [modelsRes, cfgRes] = await Promise.all([
    send({ type: 'GET_ENABLED_MODELS' }),
    send({ type: 'GET_AGGREGATION_CONFIG' }),
  ]);
  const models = Array.isArray(modelsRes.models)
    ? modelsRes.models as ModelProviderConfig[] : [];
  const config = cfgRes.config as { weightProviderId?: string | null } | undefined;
  const current = config?.weightProviderId ?? '';

  sel.innerHTML = '<option value="">不设置（全部按普通投票）</option>';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  }
  // Drop a stale selection (e.g. model was disabled or its source deleted).
  sel.value = models.some((m) => m.id === current) ? current : '';
}

async function saveWeight(): Promise<void> {
  const sel = $<HTMLSelectElement>('weightSelect');
  const msg = $('weightMsg');
  try {
    await send({
      type: 'SET_AGGREGATION_CONFIG',
      config: { weightProviderId: sel.value || null },
    });
    msg.textContent = '已保存';
    msg.className = 'msg msg-ok';
  } catch (err) {
    msg.textContent = `保存失败：${err instanceof Error ? err.message : String(err)}`;
    msg.className = 'msg msg-error';
  }
}

function setFormMode(editing: boolean): void {
  $('formTitle').textContent = editing ? '编辑接入源' : '添加接入源';
  ($<HTMLButtonElement>('saveBtn')).textContent = editing ? '保存修改' : '保存接入源';
  $('probeBtn').classList.toggle('hidden', editing);
  $('refetchBtn').classList.toggle('hidden', !editing);
}

function resetForm(): void {
  probeResult = null;
  enabledSelection = new Set();
  displayedModelIds = [];
  editingSourceId = null;
  refetchedInEditor = false;
  $('probeResult').classList.add('hidden');
  $('addCard').classList.add('hidden');
  $('probeMsg').textContent = '';
  ($<HTMLInputElement>('inName')).value = '';
  ($<HTMLInputElement>('inUrl')).value = '';
  ($<HTMLInputElement>('inKey')).value = '';
  for (const id of ['inName', 'inUrl', 'inKey']) $(id).classList.remove('err');
  setFormMode(false);
}

/** Open the form pre-filled from a saved source, showing its model checklist. */
function openEditor(id: string): void {
  const source = sources.find((s) => s.id === id);
  if (!source) return;
  resetForm();
  editingSourceId = id;

  ($<HTMLInputElement>('inName')).value = source.name;
  ($<HTMLInputElement>('inUrl')).value = source.baseUrl;
  ($<HTMLInputElement>('inKey')).value = source.apiKey;
  setFormMode(true);

  // Reuse the same table/render path as a fresh probe: build a ProbeResult-
  // shaped object from the saved models. No network needed.
  probeResult = {
    success: true,
    baseUrl: source.baseUrl,
    catalogStyle: source.catalogStyle,
    catalogPath: source.catalogPath,
    chatStyle: source.chatStyle,
    chatPath: source.chatPath,
    models: source.models,
  };
  enabledSelection = new Set(
    source.models.filter((m) => m.enabled).map((m) => m.id),
  );
  setMsg('已载入保存的模型列表，直接修改勾选即可', 'ok');
  renderProbeResult();

  $('addCard').classList.remove('hidden');
  $('addCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function doProbe(): Promise<void> {
  const name = $<HTMLInputElement>('inName').value.trim();
  const url = $<HTMLInputElement>('inUrl').value.trim();
  const key = $<HTMLInputElement>('inKey').value.trim();
  $('inName').classList.toggle('err', !name);
  $('inUrl').classList.toggle('err', !url);
  if (!name || !url) { setMsg('请填写显示名称和 Base URL', 'error'); return; }

  const btn = $<HTMLButtonElement>('probeBtn');
  btn.disabled = true;
  setMsg('正在探测接口并拉取模型…');

  try {
    // Must be the first await: permissions.request() needs the click gesture.
    const perm = await ensureHostPermission(url);
    if (!perm.ok) {
      setMsg(`授权失败：${perm.error}`, 'error');
      return;
    }

    const res = await send({ type: 'PROBE_MODELS', baseUrl: url, apiKey: key }) as unknown as ProbeResult;
    if (!res.success || !res.models) {
      const hint = res.errorKind === 'auth' ? '（API Key 可能不对）'
        : res.errorKind === 'network' ? '（网络/CORS/权限）' : '';
      setMsg(`拉取失败：${res.error ?? '未知错误'}${hint}`, 'error');
      return;
    }
    // In edit mode, keep the previous enable/disable choices by modelId and
    // re-key the freshly probed ids back onto the source being edited.
    const previousByModelId = new Map(
      (probeResult?.models ?? []).map((m) => [m.modelId, enabledSelection.has(m.id)]),
    );
    const baseId = editingSourceId ?? res.models[0]?.id.split('::')[0] ?? 'src';
    const remapped = res.models.map((m) => ({
      ...m,
      id: `${baseId}::${m.modelId}`,
      enabled: previousByModelId.get(m.modelId) ?? false,
    }));
    probeResult = { ...res, models: remapped };
    refetchedInEditor = editingSourceId !== null;
    enabledSelection = new Set(
      remapped.filter((m) => m.enabled).map((m) => m.id),
    );
    setMsg(
      editingSourceId
        ? `成功拉取 ${remapped.length} 个模型，已保留原有启用状态`
        : `成功拉取 ${remapped.length} 个模型`,
      'ok',
    );
    renderProbeResult();
  } catch (err) {
    setMsg(`拉取失败：${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function doSave(): Promise<void> {
  if (!probeResult?.models) return;
  const existing = editingSourceId
    ? sources.find((s) => s.id === editingSourceId) : undefined;
  const id = existing?.id ?? `src-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const urlInput = $<HTMLInputElement>('inUrl').value.trim();
  const keyInput = $<HTMLInputElement>('inKey').value.trim();
  // Editing the endpoint/key without re-probing would leave catalogPath and
  // chatPath pointing at the old host. Force a re-probe in that case.
  if (existing && !refetchedInEditor &&
      (urlInput !== existing.baseUrl || keyInput !== existing.apiKey)) {
    setMsg('修改 Base URL 或 API Key 后请先点「重新拉取模型」再保存', 'error');
    return;
  }

  const models = probeResult.models.map((m) => ({
    ...m,
    id: `${id}::${m.modelId}`,
    enabled: enabledSelection.has(m.id),
  }));

  const source: ApiSource = {
    id,
    name: $<HTMLInputElement>('inName').value.trim(),
    baseUrl: probeResult.baseUrl ?? urlInput,
    apiKey: keyInput,
    color: existing?.color ?? nextSourceColor(sources),
    catalogStyle: probeResult.catalogStyle ?? 'openai',
    catalogPath: probeResult.catalogPath ?? '',
    chatStyle: probeResult.chatStyle ?? 'openai-chat',
    chatPath: probeResult.chatPath ?? '',
    models,
    createdAt: existing?.createdAt ?? Date.now(),
    lastFetchedAt: refetchedInEditor || !existing
      ? Date.now()
      : existing.lastFetchedAt,
  };

  const btn = $<HTMLButtonElement>('saveBtn');
  btn.disabled = true;
  try {
    await send({ type: 'SAVE_API_SOURCE', source });
    resetForm();
    await loadSources();
  } catch (err) {
    setMsg(`保存失败：${err instanceof Error ? err.message : String(err)}`, 'error');
    btn.disabled = false;
  }
}

async function deleteSource(id: string): Promise<void> {
  const s = sources.find((x) => x.id === id);
  if (!window.confirm(`删除接入源「${s?.name ?? id}」？已启用模型将不再参与发送。`)) return;
  await send({ type: 'DELETE_API_SOURCE', sourceId: id });
  await loadSources();
}

/* ── wiring ───────────────────────────────────────────── */

$('addBtn').addEventListener('click', () => {
  if ($('addCard').classList.contains('hidden')) {
    resetForm();
    $('addCard').classList.remove('hidden');
    $<HTMLInputElement>('inName').focus();
  } else {
    resetForm();
  }
});
$('cancelBtn').addEventListener('click', resetForm);
$('discardBtn').addEventListener('click', resetForm);
$('probeBtn').addEventListener('click', () => void doProbe());
$('refetchBtn').addEventListener('click', () => void doProbe());
$('saveBtn').addEventListener('click', () => void doSave());
$('saveWeightBtn').addEventListener('click', () => void saveWeight());
$('selAll').addEventListener('click', () => {
  enabledSelection = new Set((probeResult?.models ?? []).map((m) => m.id));
  renderProbeResult();
});
$('selNone').addEventListener('click', () => {
  enabledSelection = new Set();
  renderProbeResult();
});

void loadSources();
