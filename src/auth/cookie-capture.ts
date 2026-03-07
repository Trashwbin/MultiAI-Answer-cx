export const PROVIDER_COOKIE_KEYS: Record<string, string[]> = {
  deepseek: ['userToken', 'ds_session_id'],
  kimi: ['access_token', 'refresh_token', 'kimi-auth'],
  claude: ['sessionKey', 'CH_SESSION'],
  // TODO: ChatGPT auth cookies may have changed; verify latest key(s) used by /api/auth/session.
  chatgpt: ['__Secure-next-auth.session-token', 'cf_clearance'],
  gemini: ['SID', 'HSID', 'SSID'],
  doubao: ['sessionid', 'ttwid'],
  grok: ['sso', 'ct0'],
  'qwen-cn': ['tongyi_sso_ticket', 'login_aliyunid_ticket', 'XSRF-TOKEN', 'b-user-id', 'qwen_session'],
  'qwen-intl': ['token'],
  chatglm: ['chatglm_refresh_token', 'chatglm_token'],
};

const PROVIDER_EXTRA_DOMAINS: Record<string, string[]> = {
  deepseek: ['chat.deepseek.com', 'deepseek.com'],
  kimi: ['kimi.moonshot.cn', 'kimi.com', 'www.kimi.com'],
  claude: ['claude.ai', 'www.claude.ai'],
  chatgpt: ['chatgpt.com', 'auth0.openai.com', 'chat.openai.com'],
  gemini: ['gemini.google.com'],
  doubao: ['doubao.com', 'www.doubao.com'],
  grok: ['grok.com', 'x.com', 'twitter.com'],
  'qwen-cn': ['qianwen.com', 'www.qianwen.com', 'chat2.qianwen.com', 'chat.qwen.ai', 'tongyi.aliyun.com'],
  'qwen-intl': ['qwen.ai', 'chat.qwen.ai'],
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
  }

  return result;
}

export async function captureCookies(
  providerId: string,
  domain: string,
): Promise<Record<string, string>> {
  const allCookies = await captureAllCookies(providerId, domain);
  const relevantKeys = PROVIDER_COOKIE_KEYS[providerId] ?? [];
  const result: Record<string, string> = {};

  for (const key of relevantKeys) {
    if (allCookies[key]) {
      result[key] = allCookies[key];
    }
  }

  return result;
}
