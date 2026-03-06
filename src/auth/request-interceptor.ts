type HeaderListener = (
  details: chrome.webRequest.WebRequestHeadersDetails,
) => void;

const activeListeners = new Map<string, HeaderListener>();

export function startIntercepting(
  providerId: string,
  domain: string,
  onToken: (token: string) => void,
): void {
  stopIntercepting(providerId);

  const filter: chrome.webRequest.RequestFilter = {
    urls: [`*://${domain}/*`, `*://*.${domain}/*`],
  };

  const listener: HeaderListener = (details) => {
    const headers = details.requestHeaders;
    if (!headers) return;

    for (const header of headers) {
      if (
        header.name.toLowerCase() === 'authorization' &&
        header.value?.startsWith('Bearer ')
      ) {
        onToken(header.value.slice(7));
        break;
      }
    }
  };

  chrome.webRequest.onBeforeSendHeaders.addListener(listener, filter, [
    'requestHeaders',
    'extraHeaders',
  ]);

  activeListeners.set(providerId, listener);
}

export function stopIntercepting(providerId: string): void {
  const listener = activeListeners.get(providerId);
  if (listener) {
    chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
    activeListeners.delete(providerId);
  }
}
