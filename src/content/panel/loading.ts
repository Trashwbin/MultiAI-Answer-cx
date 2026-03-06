const LOADING_ID = 'ai-answers-loading';
const DEFAULT_MESSAGE = '正在查询 AI...';

export function showLoading(message?: string): void {
  hideLoading();

  const panel = document.getElementById('ai-answers-panel');
  if (!panel) return;

  const overlay = document.createElement('div');
  overlay.id = LOADING_ID;
  overlay.style.cssText = [
    'position: absolute',
    'inset: 0',
    'background: rgba(255, 255, 255, 0.85)',
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'z-index: 10',
    'border-radius: 8px',
    'backdrop-filter: blur(2px)',
  ].join(';');

  const spinner = document.createElement('div');
  spinner.style.cssText = [
    'width: 32px',
    'height: 32px',
    'border: 3px solid #e2e8f0',
    'border-top-color: #4caf50',
    'border-radius: 50%',
    'animation: ai-panel-spin 0.8s linear infinite',
  ].join(';');

  const text = document.createElement('div');
  text.style.cssText = [
    'margin-top: 12px',
    'font-size: 14px',
    'color: #4a5568',
  ].join(';');
  text.textContent = message ?? DEFAULT_MESSAGE;

  injectSpinKeyframes();
  overlay.appendChild(spinner);
  overlay.appendChild(text);
  panel.appendChild(overlay);
}

export function hideLoading(): void {
  document.getElementById(LOADING_ID)?.remove();
}

let keyframesInjected = false;

function injectSpinKeyframes(): void {
  if (keyframesInjected) return;
  keyframesInjected = true;

  const style = document.createElement('style');
  style.textContent = `@keyframes ai-panel-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
