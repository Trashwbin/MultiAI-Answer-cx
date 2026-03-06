import { parseAIResponse } from '../core/json-parser';
import type { AuthCredentials, ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

interface ClaudeOrganization {
  uuid?: string;
}

interface ClaudeConversation {
  uuid?: string;
}

export class ClaudeProvider extends BaseProvider {
  private cachedOrgId: string | null = null;
  private cachedDeviceId: string | null = null;

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);
      const orgId = await this.resolveOrganizationId(auth);
      const conversationId = await this.createConversation(auth, orgId);
      const deviceId = this.resolveDeviceId(auth.cookies);

      const completionRes = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            'anthropic-client-platform': 'web_claude_ai',
            'anthropic-device-id': deviceId,
            Cookie: this.buildCookieHeader(auth.cookies),
          },
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

      if (!completionRes.ok) {
        const errorText = await completionRes.text();
        throw new Error(`Claude API ${completionRes.status}: ${errorText.slice(0, 300)}`);
      }

      const sse = await completionRes.text();
      const rawText = this.parseCompletionSse(sse);
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

  private async resolveOrganizationId(auth: AuthCredentials): Promise<string> {
    const known = this.cachedOrgId ?? auth.orgId;
    if (known) {
      this.cachedOrgId = known;
      auth.orgId = known;
      return known;
    }

    const deviceId = this.resolveDeviceId(auth.cookies);
    const res = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'anthropic-client-platform': 'web_claude_ai',
        'anthropic-device-id': deviceId,
        Cookie: this.buildCookieHeader(auth.cookies),
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Claude organizations ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const orgs = (await res.json()) as ClaudeOrganization[];
    const orgId = orgs[0]?.uuid;
    if (!orgId) {
      throw new Error('Claude organization id not found');
    }

    this.cachedOrgId = orgId;
    auth.orgId = orgId;
    return orgId;
  }

  private async createConversation(auth: AuthCredentials, orgId: string): Promise<string> {
    const deviceId = this.resolveDeviceId(auth.cookies);
    const res = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'anthropic-client-platform': 'web_claude_ai',
        'anthropic-device-id': deviceId,
        Cookie: this.buildCookieHeader(auth.cookies),
      },
      body: JSON.stringify({
        name: `Conversation ${new Date().toISOString()}`,
        uuid: crypto.randomUUID(),
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Claude conversation create ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = (await res.json()) as ClaudeConversation;
    const conversationId = data.uuid;
    if (!conversationId) {
      throw new Error('Claude conversation uuid missing');
    }
    return conversationId;
  }

  private resolveDeviceId(cookies: Record<string, string>): string {
    return cookies['anthropic-device-id'] || (this.cachedDeviceId ??= crypto.randomUUID());
  }

  private parseCompletionSse(sse: string): string {
    let content = '';
    for (const line of sse.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload) as { completion?: string };
        const completion = data.completion;
        if (typeof completion !== 'string') continue;
        if (completion.startsWith(content)) {
          content = completion;
        } else {
          content += completion;
        }
      } catch {
      }
    }
    return content;
  }
}
