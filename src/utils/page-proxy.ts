/**
 * Page-context fetch proxy.
 *
 * Some AI providers (e.g. Doubao) reject requests whose Origin is
 * `chrome-extension://...`.  The reference open-source project works around
 * this by executing `fetch()` inside a real browser page via Playwright
 * `page.evaluate()`.
 *
 * We achieve the same effect with `chrome.scripting.executeScript` in the
 * MAIN world: the fetch runs in the page's own JS context, so Origin,
 * cookies, and anti-bot tokens all behave exactly as if the user clicked
 * a button on the site.
 */

interface PageProxyInit {
  method: string;
  headers: Record<string, string>;
  body?: string | null;
}

interface PageProxyResult {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
}

const TAB_LOAD_TIMEOUT_MS = 15_000;

export async function proxyFetch(
  targetDomain: string,
  url: string,
  init: PageProxyInit,
): Promise<{ ok: boolean; status: number; body: string }> {
  const tabId = await ensureTab(targetDomain);

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: pageContextFetch,
    args: [url, init.method, init.headers, init.body ?? null],
  });

  const result = results[0]?.result as PageProxyResult | undefined;
  if (!result) {
    throw new Error(`[PageProxy] executeScript returned no result for ${targetDomain}`);
  }
  if (result.error) {
    throw new Error(`[PageProxy] ${result.error}`);
  }
  return { ok: result.ok, status: result.status, body: result.body };
}

// ---------------------------------------------------------------------------
// This function is serialised and sent to the page — it CANNOT reference
// any outer-scope variables.  Keep it fully self-contained.
// ---------------------------------------------------------------------------
async function pageContextFetch(
  fetchUrl: string,
  fetchMethod: string,
  fetchHeaders: Record<string, string>,
  fetchBody: string | null,
): Promise<PageProxyResult> {
  try {
    const res = await fetch(fetchUrl, {
      method: fetchMethod,
      headers: fetchHeaders,
      body: fetchBody,
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e: unknown) {
    return {
      ok: false,
      status: 0,
      body: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function ensureTab(domain: string): Promise<number> {
  for (const pattern of [`https://${domain}/*`, `https://www.${domain}/*`]) {
    const tabs = await chrome.tabs.query({ url: pattern });
    const tab = tabs.find((t) => t.id !== undefined);
    if (tab?.id !== undefined) {
      console.log(`[PageProxy] Reusing tab ${tab.id} for ${domain}`);
      return tab.id;
    }
  }

  console.log(`[PageProxy] Creating background tab for ${domain}`);
  const tab = await chrome.tabs.create({
    url: `https://${domain}/`,
    active: false,
  });

  if (tab.id === undefined) {
    throw new Error(`[PageProxy] chrome.tabs.create returned no id for ${domain}`);
  }

  await waitForTabLoad(tab.id);
  return tab.id;
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`[PageProxy] Tab ${tabId} load timeout (${TAB_LOAD_TIMEOUT_MS}ms)`));
    }, TAB_LOAD_TIMEOUT_MS);

    function listener(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}
