import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class ClaudeProvider extends BaseProvider {
  private cachedDeviceId: string | null = null;

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(question);
      const tabId = await this.ensureClaudeTab();

      const auth = await this.getAuth();
      const deviceId = auth.cookies['anthropic-device-id'] || (this.cachedDeviceId ??= crypto.randomUUID());

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: claudePageQuery,
        args: [prompt, deviceId],
      });

      const result = results[0]?.result as
        | { ok: true; text: string }
        | { ok: false; error: string }
        | undefined;

      if (!result) throw new Error('Claude: executeScript 无返回');
      if (!result.ok) throw new Error(result.error);

      const rawText = result.text;
      const parsed = parseAIResponse(rawText, this.config.id);
      return { ...parsed, rawText };
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureClaudeTab(): Promise<number> {
    for (const pattern of ['https://claude.ai/*', 'https://www.claude.ai/*']) {
      const tabs = await chrome.tabs.query({ url: pattern });
      const tab = tabs.find((t) => t.id !== undefined);
      if (tab?.id !== undefined) return tab.id;
    }

    const tab = await chrome.tabs.create({ url: 'https://claude.ai/', active: false });
    if (tab.id === undefined) throw new Error('Claude: chrome.tabs.create 无 id');

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Claude: tab 加载超时'));
      }, 15_000);

      function listener(id: number, info: chrome.tabs.TabChangeInfo) {
        if (id === tab.id && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    return tab.id;
  }
}

// Runs inside claude.ai MAIN world — MUST be fully self-contained.
// Handles: org resolution → conversation creation → completion → SSE parsing.
function claudePageQuery(
  prompt: string,
  deviceId: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return (async () => {
    try {
      const baseHeaders = {
        'anthropic-client-platform': 'web_claude_ai',
        'anthropic-device-id': deviceId,
      };

      const orgRes = await fetch('https://claude.ai/api/organizations', {
        headers: { Accept: 'application/json', ...baseHeaders },
      });
      if (!orgRes.ok) {
        return { ok: false as const, error: `Claude organizations ${orgRes.status} — 请先登录 claude.ai` };
      }
      const orgs = await orgRes.json();
      const orgId = Array.isArray(orgs) && orgs.length > 0 ? orgs[0].uuid : null;
      if (!orgId) return { ok: false as const, error: 'Claude: organization uuid not found' };

      const convRes = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...baseHeaders },
          body: JSON.stringify({ name: `Conv ${Date.now()}`, uuid: crypto.randomUUID() }),
        },
      );
      if (!convRes.ok) return { ok: false as const, error: `Claude conversation create ${convRes.status}` };
      const conv = await convRes.json();
      const convId = conv?.uuid;
      if (!convId) return { ok: false as const, error: 'Claude: conversation uuid missing' };

      const compRes = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${convId}/completion`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...baseHeaders },
          body: JSON.stringify({
            prompt,
            parent_message_uuid: '00000000-0000-4000-8000-000000000000',
            model: 'claude-sonnet-4-6',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            rendering_mode: 'messages',
            attachments: [],
            files: [],
            locale: 'en-US',
            personalized_styles: [],
            sync_sources: [],
            tools: [],
          }),
        },
      );
      if (!compRes.ok) {
        const errText = await compRes.text();
        return { ok: false as const, error: `Claude completion ${compRes.status}: ${errText.slice(0, 300)}` };
      }

      const sse = await compRes.text();
      const parts: string[] = [];
      for (const line of sse.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const data = JSON.parse(payload);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            parts.push(data.delta.text);
          } else if (typeof data.completion === 'string') {
            parts.push(data.completion);
          } else {
            const cd = data.choices?.[0]?.delta?.content;
            if (typeof cd === 'string') parts.push(cd);
            else {
              const t = data.text ?? data.content ?? (typeof data.delta === 'string' ? data.delta : undefined);
              if (typeof t === 'string') parts.push(t);
            }
          }
        } catch {}
      }

      return { ok: true as const, text: parts.join('') };
    } catch (e: unknown) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  })();
}
