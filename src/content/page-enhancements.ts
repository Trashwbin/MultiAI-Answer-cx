const COPY_BTN_CLASS = 'cx-copy-btn';
const TOAST_ID = 'cx-copy-toast';
const SPIN_STYLE_ID = 'cx-copy-spin-style';

export function startWatermarkRemoval(): void {
  removeWatermarks();
  setInterval(removeWatermarks, 2000);
}

function removeWatermarks(): void {
  document.querySelectorAll('div[id^="mask_div"]').forEach((el) => el.remove());
}

export function removePasteRestriction(): void {
  document.addEventListener('paste', (e) => e.stopImmediatePropagation(), true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        if (node instanceof HTMLIFrameElement) {
          handleEditorIframe(node);
        }
        node.querySelectorAll('iframe').forEach((iframe) => {
          handleEditorIframe(iframe);
        });
      }
    }
  });

  const observeRoot = document.body ?? document.documentElement;
  observer.observe(observeRoot, { childList: true, subtree: true });

  document.querySelectorAll('iframe').forEach((iframe) => {
    handleEditorIframe(iframe);
  });
}

function handleEditorIframe(iframe: Element): void {
  if (!(iframe instanceof HTMLIFrameElement)) return;

  const enableFromIframe = (): void => {
    try {
      enablePaste(iframe.contentDocument);
    } catch {}
  };

  enableFromIframe();
  iframe.addEventListener('load', enableFromIframe);
}

function enablePaste(doc: Document | null): void {
  if (!doc) return;

  const body = doc.body ?? doc.documentElement;
  if (!body) return;

  const handlePaste = (e: Event): boolean => {
    e.stopImmediatePropagation();
    return true;
  };

  body.addEventListener('paste', handlePaste, true);
  body.setAttribute('contenteditable', 'true');
  body.style.userSelect = 'text';
  body.style.setProperty('-webkit-user-select', 'text');

  if (doc.defaultView) {
    doc.defaultView.onpaste = null;
    doc.defaultView.addEventListener('paste', handlePaste, true);
  }
}

export function removeSelectRestriction(): void {
  const existingStyle = document.getElementById('cx-remove-select-restriction');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'cx-remove-select-restriction';
    style.textContent = `
      * {
        user-select: text !important;
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
      }
      *::selection {
        background: #b4d5fe !important;
        color: inherit !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('selectstart', (e) => e.stopPropagation(), true);
  document.addEventListener('copy', (e) => e.stopPropagation(), true);
  document.addEventListener('contextmenu', (e) => e.stopPropagation(), true);

  document.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.style.userSelect = 'text';
    el.style.setProperty('-webkit-user-select', 'text');
    el.oncontextmenu = null;
    el.onselectstart = null;
    el.oncopy = null;
  });
}

export function addCopyButtons(): void {
  const primary = document.querySelectorAll<HTMLElement>('.singleQuesId');
  const questionDivs = primary.length > 0
    ? primary
    : document.querySelectorAll<HTMLElement>('.questionLi[id^="sigleQuestionDiv_"], [id^="question"]');

  questionDivs.forEach((questionDiv) => {
    const hasMarkName = questionDiv.querySelector('.mark_name') !== null;
    if (!hasMarkName) return;
    if (questionDiv.querySelector(`.${COPY_BTN_CLASS}`)) return;
    addCopyButton(questionDiv);
  });
}

function addCopyButton(questionDiv: HTMLElement): void {
  const copyButton = mk('button', {
    className: COPY_BTN_CLASS,
    style: j(
      'position:absolute',
      'left:-20px',
      'top:10px',
      'background:white',
      'border:1px solid #e0e0e0',
      'border-radius:4px',
      'width:32px',
      'height:32px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'cursor:pointer',
      'opacity:0',
      'transition:opacity 0.2s ease, background-color 0.2s ease, transform 0.2s ease',
      'color:#666',
      'z-index:1000',
      'box-shadow:0 2px 4px rgba(0,0,0,0.1)'
    ),
  }) as HTMLButtonElement;
  copyButton.innerHTML = copyIconSvg();

  questionDiv.style.position = questionDiv.style.position || 'relative';

  questionDiv.addEventListener('mouseenter', () => {
    copyButton.style.opacity = '1';
    copyButton.style.transform = 'scale(1)';
  });
  questionDiv.addEventListener('mouseleave', () => {
    copyButton.style.opacity = '0';
    copyButton.style.transform = 'scale(0.95)';
  });

  copyButton.addEventListener('mouseenter', () => {
    copyButton.style.backgroundColor = '#f5f5f5';
    copyButton.style.transform = 'scale(1.05)';
  });
  copyButton.addEventListener('mouseleave', () => {
    copyButton.style.backgroundColor = 'white';
    copyButton.style.transform = 'scale(1)';
  });

  copyButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (copyButton.disabled) return;
    void copyQuestionAsImage(questionDiv, copyButton);
  });

  questionDiv.appendChild(copyButton);
}

async function copyQuestionAsImage(questionDiv: HTMLElement, copyButton: HTMLButtonElement): Promise<void> {
  let container: HTMLElement | null = null;

  try {
    ensureSpinStyle();
    copyButton.innerHTML = loadingIconSvg();
    copyButton.style.backgroundColor = '#f5f5f5';
    copyButton.disabled = true;

    const titleElem = questionDiv.querySelector('.mark_name');
    const titleText = titleElem?.textContent?.trim() ?? '';
    const [number, ...rest] = titleText.split('.');
    const typeMatch = rest.join('.').match(/\((.*?)[,，]/);
    const type = typeMatch?.[1]?.trim() || '题目';
    const questionNumber = number?.trim() || '';
    const fileName = `${type}${questionNumber}.png`;

    container = mk('div', {
      style: j(
        'position:fixed',
        'top:-9999px',
        'left:-9999px',
        'background:white',
        'padding:20px',
        'border-radius:8px',
        'box-shadow:0 2px 4px rgba(0,0,0,0.1)',
        'max-width:800px',
        'font-family:system-ui,-apple-system,sans-serif'
      ),
    });

    const clone = questionDiv.cloneNode(true);
    if (!(clone instanceof HTMLElement)) {
      throw new Error('题目节点克隆失败');
    }
    clone.querySelectorAll(`.${COPY_BTN_CLASS}`).forEach((btn) => btn.remove());
    container.appendChild(clone);
    document.body.appendChild(container);

    const canvas = await html2canvas(container, {
      backgroundColor: 'white',
      scale: 2,
      logging: false,
      useCORS: true,
    });

    const blob = await canvasToBlob(canvas);

    if (typeof ClipboardItem === 'undefined') {
      throw new Error('当前环境不支持 ClipboardItem');
    }

    const clipboardItem = new ClipboardItem({ 'image/png': blob });
    await navigator.clipboard.write([clipboardItem]);
    showCopyToast(`✓ ${type}${questionNumber} 已复制到剪贴板`, blob, fileName);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CX] 复制题目失败:', err);
    showCopyToast(`✕ 复制失败: ${msg}`);
  } finally {
    if (container?.parentElement) {
      container.remove();
    }
    copyButton.innerHTML = copyIconSvg();
    copyButton.style.backgroundColor = 'white';
    copyButton.disabled = false;
  }
}

function showCopyToast(message: string, blob?: Blob, fileName?: string): void {
  document.getElementById(TOAST_ID)?.remove();

  const toast = mk('div', {
    id: TOAST_ID,
    style: j(
      'position:fixed',
      'top:20px',
      'left:50%',
      'transform:translateX(-50%) translateY(-100%)',
      `background:${message.startsWith('✕') ? '#f44336' : '#4CAF50'}`,
      'color:white',
      'padding:12px 24px',
      'border-radius:8px',
      'font-size:14px',
      'font-weight:500',
      'z-index:10002',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
      'opacity:0',
      'transition:transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease',
      'display:flex',
      'align-items:center',
      'gap:12px'
    ),
  });

  const text = mk('span');
  text.textContent = message;
  toast.appendChild(text);

  if (blob && fileName) {
    const downloadButton = mk('button', {
      style: j(
        'background:rgba(255,255,255,0.2)',
        'border:none',
        'padding:4px 8px',
        'border-radius:4px',
        'color:white',
        'cursor:pointer',
        'font-size:12px',
        'transition:background-color 0.2s ease'
      ),
    }) as HTMLButtonElement;
    downloadButton.textContent = '下载';
    downloadButton.addEventListener('mouseenter', () => {
      downloadButton.style.backgroundColor = 'rgba(255,255,255,0.3)';
    });
    downloadButton.addEventListener('mouseleave', () => {
      downloadButton.style.backgroundColor = 'rgba(255,255,255,0.2)';
    });
    downloadButton.addEventListener('click', () => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
    toast.appendChild(downloadButton);
  }

  document.body.appendChild(toast);
  void toast.offsetHeight;
  toast.style.transform = 'translateX(-50%) translateY(0)';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-100%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, 3000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('无法生成图片')); 
    }, 'image/png');
  });
}

function ensureSpinStyle(): void {
  if (document.getElementById(SPIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SPIN_STYLE_ID;
  style.textContent = `
    @keyframes cx-copy-spin {
      to { transform: rotate(360deg); }
    }
    .cx-copy-loading-icon path {
      animation: cx-copy-spin 1s linear infinite;
      transform-origin: center;
    }
  `;
  document.head.appendChild(style);
}

function copyIconSvg(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
}

function loadingIconSvg(): string {
  return `
    <svg class="cx-copy-loading-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 2a10 10 0 0 1 10 10"></path>
    </svg>
  `;
}

function j(...parts: string[]): string {
  return parts.join(';');
}

function mk(tag: string, attrs?: Record<string, string>): HTMLElement {
  const e = document.createElement(tag);
  if (!attrs) return e;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') e.style.cssText = v;
    else if (k === 'id') e.id = v;
    else if (k === 'className') e.className = v;
    else e.setAttribute(k, v);
  }
  return e;
}
