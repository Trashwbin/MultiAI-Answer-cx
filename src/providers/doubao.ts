import { parseAIResponse } from '../core/json-parser';
import type { ProviderResponse, Question } from '../types';
import { proxyFetch } from '../utils/page-proxy';
import { createGroupedTab } from '../utils/tab-group';
import { BaseProvider } from './base-provider';

export class DoubaoProvider extends BaseProvider {
  private parseDoubaoSse(sse: string): { text: string; conversationId?: string; error?: string } {
    const chunks: string[] = [];
    let conversationId: string | undefined;
    let streamError: string | undefined;

    for (const eventBlock of sse.split(/\n\n+/)) {
      const trimmedBlock = eventBlock.trim();
      if (!trimmedBlock) continue;

      let eventName = '';
      const dataLines: string[] = [];
      for (const line of trimmedBlock.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) continue;
      const jsonStr = dataLines.join('\n');

      try {
        const data = JSON.parse(jsonStr) as Record<string, unknown>;

        if (eventName === 'SSE_ACK') {
          const ackMeta = data.ack_client_meta as Record<string, unknown> | undefined;
          const ackConversationId = ackMeta?.conversation_id;
          if (typeof ackConversationId === 'string' && ackConversationId) {
            conversationId = ackConversationId;
          }
          continue;
        }

        if (eventName === 'STREAM_ERROR') {
          const errorMsg = data.error_msg;
          if (typeof errorMsg === 'string' && errorMsg) {
            streamError = errorMsg;
          }
          continue;
        }

        if (eventName === 'STREAM_MSG_NOTIFY') {
          const content = data.content as Record<string, unknown> | undefined;
          this.collectTextBlocks(content?.content_block, chunks);
          continue;
        }

        if (eventName === 'CHUNK_DELTA') {
          const text = data.text;
          if (typeof text === 'string' && text) {
            chunks.push(text);
          }
          continue;
        }

        if (eventName === 'STREAM_CHUNK') {
          const patchOps = data.patch_op;
          if (!Array.isArray(patchOps)) continue;

          for (const patch of patchOps) {
            if (!patch || typeof patch !== 'object') continue;
            const patchObject = (patch as Record<string, unknown>).patch_object;
            if (patchObject !== 1) continue;

            const patchValue = (patch as Record<string, unknown>).patch_value as Record<string, unknown> | undefined;
            this.collectTextBlocks(patchValue?.content_block, chunks);
          }
        }
      } catch {
        continue;
      }
    }

    return {
      text: chunks.join(''),
      conversationId,
      error: chunks.length === 0 ? streamError : undefined,
    };
  }

  private collectTextBlocks(blocks: unknown, chunks: string[]): void {
    if (!Array.isArray(blocks)) return;

    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const content = (block as Record<string, unknown>).content as Record<string, unknown> | undefined;
      const textBlock = content?.text_block as Record<string, unknown> | undefined;
      const text = textBlock?.text;
      if (typeof text === 'string' && text) {
        chunks.push(text);
      }
    }
  }

  async query(questions: Question[]): Promise<ProviderResponse> {
    try {
      const prompt = this.buildPrompt(questions);
      const tabId = await this.ensureDoubaoTab();

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: doubaoPageQuery,
        args: [prompt, this.promptMode === 'analysis'],
      });

      const result = results[0]?.result as
        | { ok: true; sse: string }
        | { ok: false; error: string }
        | undefined;

      if (!result) throw new Error('Doubao: executeScript 无返回');
      if (!result.ok) throw new Error(result.error);

      const parsedStream = this.parseDoubaoSse(result.sse);
      if (parsedStream.error && !parsedStream.text.trim()) {
        throw new Error(`Doubao: ${parsedStream.error}`);
      }

      const rawText = parsedStream.text;
      const parsed = parseAIResponse(rawText, this.config.id);
      const response = { ...parsed, rawText, cleanupSessionId: parsedStream.conversationId };
      if ((parsed.answers.length > 0 || rawText.trim()) && response.cleanupSessionId && this.sessionCleanupMode === 'on_success') {
        void this.deleteConversation(response.cleanupSessionId).catch((err) => {
          console.warn('[Doubao] Auto cleanup failed:', err);
        });
      }
      return response;
    } catch (error) {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async ensureDoubaoTab(): Promise<number> {
    const tabId = await this.findProviderTab(['https://www.doubao.com/*', 'https://doubao.com/*']);
    if (tabId !== undefined) {
      return tabId;
    }

    const tab = await createGroupedTab({ url: 'https://www.doubao.com/chat/', active: false });
    if (tab.id === undefined) {
      throw new Error('Doubao: chrome.tabs.create 无 id');
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Doubao: tab 加载超时'));
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

  async deleteConversation(sessionId: string): Promise<boolean> {
    if (!sessionId) return false;

    const auth = await this.getAuth();
    const body = JSON.stringify({
      cmd: 4171,
      uplink_body: {
        batch_delete_user_conversation_uplink_body: {
          conversation_id: [sessionId],
          delete_all: false,
          conversation_type: 3,
        },
      },
      sequence_id: crypto.randomUUID(),
      channel: 2,
      version: '1',
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; encoding=utf-8',
      Accept: 'application/json, text/plain, */*',
      Referer: `https://www.doubao.com/chat/${sessionId}`,
      Origin: 'https://www.doubao.com',
      'Agw-js-conv': 'str',
    };

    const cookieHeader = this.buildCookieHeader(auth.cookies);
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const res = await proxyFetch(
      'www.doubao.com',
      'https://www.doubao.com/im/conversation/batch_del_user_conv?version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&region=&sys_region=&samantha_web=1&use-olympus-account=1',
      {
        method: 'POST',
        headers,
        body,
      },
    );

    if (!res.ok) {
      console.warn(`[Doubao] delete conversation failed ${res.status}: ${res.body.slice(0, 200)}`);
      return false;
    }

    try {
      const data = JSON.parse(res.body) as {
        status_code?: number;
        downlink_body?: {
          batch_delete_user_conversation_downlink_body?: {
            result?: Record<string, boolean>;
          };
        };
      };
      return data.status_code === 0 && data.downlink_body?.batch_delete_user_conversation_downlink_body?.result?.[sessionId] === true;
    } catch {
      return false;
    }
  }
}

function doubaoPageQuery(
  message: string,
  enableDeepThink: boolean,
): Promise<{ ok: true; sse: string } | { ok: false; error: string }> {
  return (async () => {
    try {
      const readCookie = (name: string): string => {
        const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
        return match?.[1] ?? '';
      };

      const readJsonStorage = (key: string): Record<string, unknown> => {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) as Record<string, unknown> : {};
        } catch {
          return {};
        }
      };

      const randomHex = (length: number): string => {
        const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
      };

      const runtimeContext = (() => {
        const flowTokens = readJsonStorage('__tea_cache_tokens_497858');
        const webInfo = readJsonStorage('samantha_web_web_id');
        const deviceId = typeof webInfo.web_id === 'string' ? webInfo.web_id : '';
        const webId = typeof flowTokens.web_id === 'string' ? flowTokens.web_id : deviceId;
        const fp = readCookie('s_v_web_id');
        const persistedWebTabId = sessionStorage.getItem('__multiai_doubao_web_tab_id') ?? '';
        const webTabId = persistedWebTabId || crypto.randomUUID();
        sessionStorage.setItem('__multiai_doubao_web_tab_id', webTabId);
        return { deviceId, webId, fp, webTabId };
      })();

      if (!runtimeContext.deviceId || !runtimeContext.webId || !runtimeContext.fp) {
        return {
          ok: false as const,
          error: 'Doubao: 缺少 deviceId/webId/fp 运行时上下文',
        };
      }

      const now = Date.now();
      const localConversationId = `local_${now}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
      const localMessageId = crypto.randomUUID();
      const blockId = crypto.randomUUID();
      const uniqueKey = crypto.randomUUID();

      const url = new URL('/chat/completion', location.origin);
      url.searchParams.set('aid', '497858');
      url.searchParams.set('device_id', runtimeContext.deviceId);
      url.searchParams.set('device_platform', 'web');
      url.searchParams.set('fp', runtimeContext.fp);
      url.searchParams.set('language', 'zh');
      url.searchParams.set('pc_version', '3.16.3');
      url.searchParams.set('pkg_type', 'release_version');
      url.searchParams.set('real_aid', '497858');
      url.searchParams.set('region', '');
      url.searchParams.set('samantha_web', '1');
      url.searchParams.set('sys_region', '');
      url.searchParams.set('tea_uuid', runtimeContext.webId);
      url.searchParams.set('use-olympus-account', '1');
      url.searchParams.set('version_code', '20800');
      url.searchParams.set('web_id', runtimeContext.webId);
      url.searchParams.set('web_tab_id', runtimeContext.webTabId);

      const body = {
        client_meta: {
          local_conversation_id: localConversationId,
          conversation_id: '',
          bot_id: '7338286299411103781',
          last_section_id: '',
          last_message_index: null,
        },
        messages: [
          {
            local_message_id: localMessageId,
            content_block: [
              {
                block_type: 10000,
                content: {
                  text_block: {
                    text: message,
                    icon_url: '',
                    icon_url_dark: '',
                    summary: '',
                  },
                  pc_event_block: '',
                },
                block_id: blockId,
                parent_id: '',
                meta_info: [],
                append_fields: [],
              },
            ],
            message_status: 0,
          },
        ],
        option: {
          send_message_scene: '',
          create_time_ms: now,
          collect_id: '',
          is_audio: false,
          answer_with_suggest: false,
          tts_switch: false,
          need_deep_think: enableDeepThink ? 1 : 0,
          click_clear_context: false,
          from_suggest: false,
          is_regen: false,
          is_replace: false,
          disable_sse_cache: false,
          select_text_action: '',
          resend_for_regen: false,
          scene_type: 0,
          unique_key: uniqueKey,
          start_seq: 0,
          need_create_conversation: true,
          conversation_init_option: {
            need_ack_conversation: true,
          },
          regen_query_id: [],
          edit_query_id: [],
          regen_instruction: '',
          no_replace_for_regen: false,
          message_from: 0,
          shared_app_name: '',
          shared_app_id: '',
          sse_recv_event_options: {
            support_chunk_delta: true,
          },
          is_ai_playground: false,
          recovery_option: {
            is_recovery: false,
            req_create_time_sec: Math.floor(now / 1000),
            append_sse_event_scene: 0,
          },
        },
        ext: {
          conversation_init_option: '{"need_ack_conversation":true}',
          fp: runtimeContext.fp,
          commerce_credit_config_enable: '0',
          sub_conv_firstmet_type: '1',
        },
      };

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          'Agw-js-conv': 'str',
          'Last-Event-Id': 'undefined',
          'X-Flow-Trace': `04-${randomHex(32)}-${randomHex(16)}-01`,
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const sse = await res.text();
      if (!res.ok) {
        return {
          ok: false as const,
          error: `Doubao API ${res.status}: ${sse.slice(0, 300)}`,
        };
      }

      return { ok: true as const, sse };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();
}
