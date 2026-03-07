export const PROVIDER_COOKIE_KEYS: Record<string, string[]> = {
  deepseek: ['userToken', 'ds_session_id'],
  kimi: ['access_token', 'refresh_token', 'kimi-auth'],
  chatgpt: ['__Secure-next-auth.session-token', 'cf_clearance'],
  gemini: ['SID', 'HSID', 'SSID'],
  doubao: ['sessionid', 'ttwid'],
  grok: ['sso', 'ct0'],
  'qwen-cn': ['tongyi_sso_ticket', 'login_aliyunid_ticket', 'XSRF-TOKEN', 'b-user-id', 'qwen_session'],
  chatglm: ['chatglm_refresh_token', 'chatglm_token'],
};

const PROVIDER_EXTRA_DOMAINS: Record<string, string[]> = {
  deepseek: ['chat.deepseek.com', 'deepseek.com'],
  kimi: ['kimi.moonshot.cn', 'kimi.com', 'www.kimi.com'],
  chatgpt: ['chatgpt.com', 'auth0.openai.com', 'chat.openai.com'],
  gemini: ['gemini.google.com'],
  doubao: ['doubao.com', 'www.doubao.com'],
  grok: ['grok.com', 'x.com', 'twitter.com'],
  'qwen-cn': ['qianwen.com', 'www.qianwen.com', 'chat2.qianwen.com', 'tongyi.aliyun.com'],
  chatglm: ['chatglm.cn', 'www.chatglm.cn', 'open.bigmodel.cn'],
};

export async function captureAllCookies(
  providerId: string,
  domain: string,
): Promise<Record<string, string>> {
  const domains = PROVIDER_EXTRA_DOMAINS[providerId] ?? [domain];
  if (!domains.includes(domain)) domains.push(domain);

  const result: Record<string, string> = {};
  for (const d of domains) {
    const urlBased = await chrome.cookies.getAll({ url: `https://${d}/` });
    const domainBased = await chrome.cookies.getAll({ domain: d });
    const partitioned = await chrome.cookies.getAll({ domain: d, ...{ partitionKey: {} } }).catch(() => [] as chrome.cookies.Cookie[]);

    for (const cookie of urlBased) {
      if (cookie.name && !result[cookie.name]) {
        result[cookie.name] = cookie.value;
      }
    }
    for (const cookie of domainBased) {
      if (cookie.name && !result[cookie.name]) {
        result[cookie.name] = cookie.value;
      }
    }
    for (const cookie of partitioned) {
      if (cookie.name && !result[cookie.name]) {
        result[cookie.name] = cookie.value;
      }
    }
  }

  return result;
}

export async function captureCookies(
  providerId: string,
  domain: string,
): Promise<Record<string, string>> {
  const allCookies = await captureAllCookies(providerId, domain);
  const relevantKeys = PROVIDER_COOKIE_KEYS[providerId] ?? [];
  const domains = PROVIDER_EXTRA_DOMAINS[providerId] ?? [domain];
  const result: Record<string, string> = {};

  for (const key of relevantKeys) {
    if (allCookies[key]) {
      result[key] = allCookies[key];
      continue;
    }
    // Fallback: chrome.cookies.get() uses a different code path than getAll()
    // and may find cookies that getAll() misses (Chrome partitioning bug).
    for (const d of domains) {
      try {
        const cookie = await chrome.cookies.get({ url: `https://${d}/`, name: key });
        if (cookie?.value) {
          result[key] = cookie.value;
          console.log(`[CookieCapture] ${providerId}: found '${key}' via get() fallback on ${d}`);
          break;
        }
      } catch { /* get() failed — try next domain */ }
    }
  }

  return result;
}
