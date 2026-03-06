(function authContentScript(): void {
  const LOGIN_SUCCESS_SELECTORS: Record<string, string[]> = {
    deepseek: ['.ds-avatar', '[class*="userAvatar"]'],
    kimi: ['.user-avatar', '[class*="avatar"]'],
    claude: ['[data-testid="user-menu"]', '.user-menu'],
    chatgpt: ['[data-testid="profile-button"]', 'nav [class*="avatar"]'],
    gemini: ['.gb_A.gb_Da'],
    doubao: ['.user-avatar', '[class*="userAvatar"]'],
    grok: ['[data-testid="user-avatar"]'],
    'qwen-cn': ['.user-avatar', '.login-user'],
    'qwen-intl': ['.user-avatar'],
    chatglm: ['.user-avatar', '[class*="avatar"]'],
  };

  const DOMAIN_TO_PROVIDER: Record<string, string> = {
    'chat.deepseek.com': 'deepseek',
    'kimi.com': 'kimi',
    'kimi.moonshot.cn': 'kimi',
    'claude.ai': 'claude',
    'chatgpt.com': 'chatgpt',
    'gemini.google.com': 'gemini',
    'doubao.com': 'doubao',
    'grok.com': 'grok',
    'chat.qwen.ai': 'qwen-cn',
    'chatglm.cn': 'chatglm',
  };

  function detectProvider(): string | null {
    const hostname = location.hostname;
    if (DOMAIN_TO_PROVIDER[hostname]) {
      return DOMAIN_TO_PROVIDER[hostname] ?? null;
    }
    for (const [domain, provider] of Object.entries(DOMAIN_TO_PROVIDER)) {
      if (hostname.endsWith(`.${domain}`)) {
        return provider;
      }
    }
    return null;
  }

  function checkLoginSuccess(pid: string): boolean {
    const selectors = LOGIN_SUCCESS_SELECTORS[pid];
    if (!selectors) return false;
    for (const selector of selectors) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    return false;
  }

  const maybeProvider = detectProvider();
  if (!maybeProvider) return;
  const pid: string = maybeProvider;

  let reported = false;

  function check(): void {
    if (reported) return;
    if (!checkLoginSuccess(pid)) return;

    reported = true;
    chrome.runtime.sendMessage({
      type: 'AUTH_LOGIN_SUCCESS',
      providerId: pid,
    });
  }

  const observer = new MutationObserver(() => {
    check();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  const interval = setInterval(() => {
    check();
    if (reported) {
      clearInterval(interval);
      observer.disconnect();
    }
  }, 2000);

  check();

  setTimeout(() => {
    if (!reported) {
      clearInterval(interval);
      observer.disconnect();
    }
  }, 300_000);
})();
