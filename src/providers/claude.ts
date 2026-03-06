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

  async query(question: Question): Promise<ProviderResponse> {
    try {
      const auth = await this.getAuth();
      const prompt = this.buildPrompt(question);
      const orgId = await this.resolveOrganizationId(auth);
      const conversationId = await this.createConversation(auth, orgId);

      const completionRes = await fetch(
        `https://claude.ai/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            Cookie: this.buildCookieHeader(auth.cookies),
          },
          body: JSON.stringify({
            prompt,
            model: 'claude-opus-4-5',
            timezone: 'UTC',
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

    const res = await fetch('https://claude.ai/api/organizations', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
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
    const res = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: this.buildCookieHeader(auth.cookies),
      },
      body: JSON.stringify({
        name: '',
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
