export const PROVIDER_COOKIE_KEYS: Record<string, string[]> = {
  deepseek: ['userToken', 'ds_session_id'],
  kimi: ['access_token', 'refresh_token'],
  claude: ['sessionKey', 'CH_SESSION'],
  chatgpt: ['__Secure-next-auth.session-token', 'cf_clearance'],
  gemini: ['SID', 'HSID', 'SSID'],
  doubao: ['sessionid', 'ttwid'],
  grok: ['sso', 'ct0'],
  'qwen-cn': ['qwen_session', 'login_aliyunid_ticket'],
  'qwen-intl': ['qwen_session'],
  chatglm: ['chatglm_token'],
};

export async function captureCookies(
  providerId: string,
  domain: string,
): Promise<Record<string, string>> {
  const cookies = await chrome.cookies.getAll({ domain });
  const relevantKeys = PROVIDER_COOKIE_KEYS[providerId] ?? [];
  const result: Record<string, string> = {};

  for (const cookie of cookies) {
    if (relevantKeys.includes(cookie.name)) {
      result[cookie.name] = cookie.value;
    }
  }

  return result;
}
