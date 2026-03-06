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
    'www.kimi.com': 'kimi',
    'kimi.moonshot.cn': 'kimi',
    'claude.ai': 'claude',
    'chatgpt.com': 'chatgpt',
    'gemini.google.com': 'gemini',
    'doubao.com': 'doubao',
    'www.doubao.com': 'doubao',
    'grok.com': 'grok',
    'chat.qwen.ai': 'qwen-cn',
    'www.qianwen.com': 'qwen-cn',
    'qianwen.com': 'qwen-cn',
    'chatglm.cn': 'chatglm',
    'www.chatglm.cn': 'chatglm',
  };

  const PROVIDER_STORAGE_KEYS: Record<string, string[]> = {
    kimi: ['access_token', 'refresh_token'],
    deepseek: ['userToken'],
  };

  const PROVIDER_META_KEYS: Record<string, Array<{ selector: string; key: string }>> = {
    'qwen-cn': [{ selector: 'meta[name="x-xsrf-token"]', key: 'xsrf-token' }],
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

  function captureMetaTags(pid: string): Record<string, string> {
    const metas = PROVIDER_META_KEYS[pid];
    if (!metas) return {};

    const result: Record<string, string> = {};
    for (const meta of metas) {
      const el = document.querySelector(meta.selector);
      const content = el?.getAttribute('content');
      if (content) {
        result[meta.key] = content;
      }
    }
    return result;
  }

  function captureLocalStorage(pid: string): void {
    const keys = PROVIDER_STORAGE_KEYS[pid];
    if (!keys || keys.length === 0) return;

    const msgId = '__MULTIAI_STORAGE_' + Date.now() + '__';
    const keysJson = JSON.stringify(keys);

    window.addEventListener('message', function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.data?.type !== msgId) return;
      window.removeEventListener('message', handler);

      const storage = event.data.storage as Record<string, string>;
      if (Object.keys(storage).length > 0) {
        console.log(`[AuthContent] ${pid}: captured localStorage keys:`, Object.keys(storage).join(', '));
        chrome.runtime.sendMessage({
          type: 'STORAGE_CAPTURED',
          providerId: pid,
          storage,
        });
      }
    });

    const script = document.createElement('script');
    script.textContent = `(function(){var ks=${keysJson};var r={};for(var i=0;i<ks.length;i++){var v=localStorage.getItem(ks[i]);if(v)r[ks[i]]=v;}window.postMessage({type:"${msgId}",storage:r},"*");})();`;
    document.documentElement.appendChild(script);
    script.remove();
  }

  const maybeProvider = detectProvider();
  if (!maybeProvider) return;
  const pid: string = maybeProvider;

  let reported = false;
  let storageCaptured = false;

  function check(): void {
    if (!storageCaptured) {
      storageCaptured = true;
      captureLocalStorage(pid);

      const metaData = captureMetaTags(pid);
      if (Object.keys(metaData).length > 0) {
        chrome.runtime.sendMessage({
          type: 'STORAGE_CAPTURED',
          providerId: pid,
          storage: metaData,
        });
      }
    }

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
