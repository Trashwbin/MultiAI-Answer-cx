import md5 from 'md5';
import Typr from 'typr.js';
import fontTable from './font-table.json';

type FontTable = Record<string, number>;

const SECRET_FONT_CLASS = 'font-cxsecret';
const replacementCache = new Map<string, Map<string, string>>();

interface DecodeTarget {
  source: HTMLElement;
  target: HTMLElement;
}

function extractSecretFontBase64(doc: Document): string | null {
  for (const style of Array.from(doc.head.querySelectorAll('style'))) {
    const cssText = style.textContent ?? '';
    if (!cssText.includes(SECRET_FONT_CLASS)) continue;

    const match = cssText.match(/base64,([^'")]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const buffer = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }

  return buffer;
}

function buildReplacementMap(fontBase64: string): Map<string, string> {
  const cached = replacementCache.get(fontBase64);
  if (cached) return cached;

  const parsedFont = Typr.parse(base64ToUint8Array(fontBase64));
  const table = fontTable as unknown as FontTable;
  const replacements = new Map<string, string>();

  for (let code = 19968; code < 40870; code += 1) {
    const glyph = Typr.U.codeToGlyph(parsedFont, code);
    if (!glyph) continue;

    const pathHash = md5(JSON.stringify(Typr.U.glyphToPath(parsedFont, glyph))).slice(24);
    const decodedCode = table[pathHash];
    if (!decodedCode || decodedCode === code) continue;

    replacements.set(String.fromCharCode(code), String.fromCharCode(decodedCode));
  }

  replacementCache.set(fontBase64, replacements);
  return replacements;
}

function getDecodeTargets(doc: Document): DecodeTarget[] {
  return Array.from(doc.querySelectorAll<HTMLElement>(`.${SECRET_FONT_CLASS}`)).map((element) => {
    return {
      source: element,
      target: element.querySelector<HTMLElement>('.after') ?? element,
    };
  });
}

function replaceSecretText(html: string, replacements: Map<string, string>): string {
  let decoded = html;

  for (const [encodedChar, decodedChar] of replacements) {
    if (decoded.includes(encodedChar)) {
      decoded = decoded.split(encodedChar).join(decodedChar);
    }
  }

  return decoded;
}

export function decodeSecretFontInDocument(doc: Document): boolean {
  const fontBase64 = extractSecretFontBase64(doc);
  if (!fontBase64) return false;

  const targets = getDecodeTargets(doc);
  if (targets.length === 0) return false;

  try {
    const replacements = buildReplacementMap(fontBase64);
    if (replacements.size === 0) return false;

    for (const { source, target } of targets) {
      const decodedHtml = replaceSecretText(target.innerHTML, replacements);
      if (decodedHtml !== target.innerHTML) {
        target.innerHTML = decodedHtml;
      }
      source.classList.remove(SECRET_FONT_CLASS);
      target.classList.remove(SECRET_FONT_CLASS);
    }

    console.log(`[CX] Decoded ${targets.length} secret-font nodes`);
    return true;
  } catch (error) {
    console.warn('[CX] Failed to decode secret font', error);
    return false;
  }
}
