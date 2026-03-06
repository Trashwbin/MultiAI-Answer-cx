import type { QuestionAnswer, ProviderResponse } from '../types';

interface RawAIAnswer {
  questionNumber?: unknown;
  id?: unknown;
  answer?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
  analysis?: unknown;
}

/**
 * Fault-tolerant parser for AI response text. Tries five strategies in order:
 * 1. Direct JSON.parse
 * 2. Code-block extraction (```json ... ```)
 * 3. Brace extraction (first `{` to last `}`)
 * 4. Fix common JSON errors then parse
 * 5. Regex fallback for completely unstructured text
 */
export function parseAIResponse(rawText: string, providerId: string): ProviderResponse {
  const trimmed = rawText.trim();

  const direct = tryParseJSON(trimmed);
  if (direct) {
    const answers = extractAnswers(direct);
    if (answers.length > 0) {
      return { providerId, answers, rawText };
    }
  }

  const codeBlockResult = tryCodeBlockExtraction(trimmed);
  if (codeBlockResult) {
    const answers = extractAnswers(codeBlockResult);
    if (answers.length > 0) {
      return { providerId, answers, rawText };
    }
  }

  const braceResult = tryBraceExtraction(trimmed);
  if (braceResult) {
    const answers = extractAnswers(braceResult);
    if (answers.length > 0) {
      return { providerId, answers, rawText };
    }
  }

  const fixedResult = tryFixAndParse(trimmed);
  if (fixedResult) {
    const answers = extractAnswers(fixedResult);
    if (answers.length > 0) {
      return { providerId, answers, rawText };
    }
  }

  const regexAnswers = regexFallback(trimmed);
  if (regexAnswers.length > 0) {
    return { providerId, answers: regexAnswers, rawText };
  }

  return {
    providerId,
    answers: [],
    rawText,
    error: 'Failed to parse response',
  };
}

/**
 * Normalize a raw answer value to canonical `string | string[]` form.
 * Handles null, undefined, numbers, booleans, arrays, and objects.
 */
export function normalizeAnswer(raw: unknown): string | string[] {
  if (raw === null || raw === undefined) {
    return '';
  }

  if (typeof raw === 'string') {
    return raw.trim();
  }

  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item === null || item === undefined) return '';
      return String(item);
    });
  }

  return String(raw);
}

function tryParseJSON(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function tryCodeBlockExtraction(text: string): unknown | null {
  // ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const match = codeBlockRegex.exec(text);
  if (!match?.[1]) return null;

  return tryParseJSON(match[1].trim());
}

function tryBraceExtraction(text: string): unknown | null {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;

  return tryParseJSON(text.slice(firstBrace, lastBrace + 1));
}

function tryFixAndParse(text: string): unknown | null {
  let jsonLike = text;
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonLike = text.slice(firstBrace, lastBrace + 1);
  }

  return tryParseJSON(fixCommonJsonErrors(jsonLike));
}

function regexFallback(text: string): QuestionAnswer[] {
  const answers: QuestionAnswer[] = [];

  const jsonPairAnswers = extractJsonPairAnswers(text);
  if (jsonPairAnswers.length > 0) return jsonPairAnswers;

  // 第N题答案是X / 问题N答案：X
  const chinesePattern = /(?:第|问题)\s*(\d+)\s*(?:题\s*)?(?:答案|的答案)\s*(?:是|为|：|:)\s*([^\n,，。]+)/g;
  let match: RegExpExecArray | null;
  while ((match = chinesePattern.exec(text)) !== null) {
    const questionNum = match[1];
    const rawAnswer = match[2]?.trim();
    if (questionNum && rawAnswer) {
      answers.push({
        questionNumber: questionNum,
        answer: normalizeExtractedAnswer(rawAnswer),
      });
    }
  }
  if (answers.length > 0) return answers;

  // v1 format: 问题N答案：xxx
  const v1Regex = /问题\s*(\d+)\s*答案\s*[:：]\s*([\s\S]*?)(?=问题\s*\d+\s*答案\s*[:：]|$)/g;
  while ((match = v1Regex.exec(text)) !== null) {
    const questionNum = match[1];
    const rawAnswer = match[2]?.trim();
    if (questionNum && rawAnswer) {
      answers.push({
        questionNumber: questionNum,
        answer: normalizeExtractedAnswer(rawAnswer),
      });
    }
  }
  if (answers.length > 0) return answers;

  // Numbered list: 1. A / 1) A / 1、A
  const numberedPattern = /(?:^|\n)\s*(\d+)\s*[.)、．]\s*([A-Z](?:\s*[,，、]\s*[A-Z])*|正确|错误|对|错|[\u4e00-\u9fff][\s\S]*?)(?=\n\s*\d+\s*[.)、．]|\n*$)/g;
  while ((match = numberedPattern.exec(text)) !== null) {
    const questionNum = match[1];
    const rawAnswer = match[2]?.trim();
    if (questionNum && rawAnswer) {
      answers.push({
        questionNumber: questionNum,
        answer: normalizeExtractedAnswer(rawAnswer),
      });
    }
  }

  return answers;
}

/**
 * Fixes: JS comments, single quotes → double quotes, trailing commas,
 * unquoted keys, literal newlines inside strings.
 */
function fixCommonJsonErrors(text: string): string {
  let fixed = text;

  fixed = fixed.replace(/\/\/[^\n]*/g, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');
  fixed = replaceSingleQuotes(fixed);
  // ,] → ] and ,} → }
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  // { key: "value" } → { "key": "value" }
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');
  // Literal newlines inside strings → \\n
  fixed = fixed.replace(/("(?:[^"\\]|\\.)*)\n((?:[^"\\]|\\.)*")/g, '$1\\n$2');

  return fixed;
}

/**
 * Stateful single-quote to double-quote converter.
 * Only activates when single quotes dominate (likely JSON delimiters, not apostrophes).
 */
function replaceSingleQuotes(text: string): string {
  const doubleCount = (text.match(/"/g) ?? []).length;
  const singleCount = (text.match(/'/g) ?? []).length;

  if (singleCount <= doubleCount) return text;

  let result = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const prevChar = i > 0 ? text[i - 1] : '';

    if (!inString) {
      if (char === "'") {
        result += '"';
        inString = true;
        stringChar = "'";
      } else if (char === '"') {
        result += char;
        inString = true;
        stringChar = '"';
      } else {
        result += char;
      }
    } else {
      if (char === stringChar && prevChar !== '\\') {
        result += stringChar === "'" ? '"' : char;
        inString = false;
      } else if (char === '"' && stringChar === "'") {
        result += '\\"';
      } else {
        result += char;
      }
    }
  }

  return result;
}

function extractAnswers(parsed: unknown): QuestionAnswer[] {
  if (!isRecord(parsed)) return [];

  const answersRaw = (parsed as Record<string, unknown>)['answers'];
  if (!Array.isArray(answersRaw)) return [];

  const results: QuestionAnswer[] = [];

  for (const item of answersRaw) {
    if (!isRecord(item)) continue;
    const rawItem = item as RawAIAnswer;

    const qNum = extractQuestionNumber(rawItem);
    if (!qNum) continue;

    const answer = normalizeAnswer(rawItem.answer);
    const confidence = extractConfidence(rawItem.confidence);

    const qa: QuestionAnswer = {
      questionNumber: qNum,
      answer,
    };

    if (confidence !== undefined) {
      qa.confidence = confidence;
    }

    results.push(qa);
  }

  return results;
}

function extractQuestionNumber(item: RawAIAnswer): string | null {
  if (item.questionNumber !== null && item.questionNumber !== undefined) {
    return String(item.questionNumber);
  }

  if (item.id !== null && item.id !== undefined) {
    return String(item.id);
  }

  return null;
}

function extractConfidence(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;

  const num = typeof raw === 'number' ? raw : Number(raw);
  if (isNaN(num)) return undefined;

  // 0-1 scale → 0-100
  if (num > 0 && num <= 1) return Math.round(num * 100);

  return Math.max(0, Math.min(100, Math.round(num)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Extracts "questionNumber": "1" ... "answer": "A" pairs from semi-structured text
 * where JSON parsing failed but key-value patterns are still recognizable.
 */
function extractJsonPairAnswers(text: string): QuestionAnswer[] {
  const answers: QuestionAnswer[] = [];

  // Matches: "questionNumber"|"id": "N" ... "answer": "X" or ["X","Y"]
  const pairRegex = /["'](?:questionNumber|id)["']\s*:\s*["']?(\d+)["']?\s*[,\s]*["']answer["']\s*:\s*(\[[\s\S]*?\]|"[^"]*"|'[^']*')/g;
  let match: RegExpExecArray | null;

  while ((match = pairRegex.exec(text)) !== null) {
    const questionNum = match[1];
    const rawAnswer = match[2];
    if (!questionNum || !rawAnswer) continue;

    let answer: string | string[];

    const trimmedAnswer = rawAnswer.trim();
    if (trimmedAnswer.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmedAnswer) as unknown;
        answer = normalizeAnswer(parsed);
      } catch {
        const fixed = trimmedAnswer.replace(/'/g, '"');
        try {
          const parsed = JSON.parse(fixed) as unknown;
          answer = normalizeAnswer(parsed);
        } catch {
          continue;
        }
      }
    } else {
      answer = trimmedAnswer.replace(/^["']|["']$/g, '').trim();
    }

    answers.push({ questionNumber: questionNum, answer });
  }

  return answers;
}

/**
 * Normalizes raw regex-extracted answer text into typed form.
 * Maps: 对/正确/√/T → "正确", 错/错误/×/F → "错误",
 * "A,B,C" → ["A","B","C"], "ABC" → ["A","B","C"], 第N空 → string[].
 */
function normalizeExtractedAnswer(raw: string): string | string[] {
  const trimmed = raw.trim();

  if (/^(正确|对|√|T|true)$/i.test(trimmed)) return '正确';
  if (/^(错误|错|×|F|false)$/i.test(trimmed)) return '错误';

  // "A, B, C" or "A、B、C"
  const multiChoiceComma = trimmed.match(/^([A-Z])\s*[,，、]\s*([A-Z])(?:\s*[,，、]\s*([A-Z]))*$/);
  if (multiChoiceComma) {
    return trimmed.split(/\s*[,，、]\s*/).filter((s) => /^[A-Z]$/.test(s));
  }

  // "ABC" → ["A", "B", "C"]
  if (/^[A-Z]{2,}$/.test(trimmed)) {
    return trimmed.split('');
  }

  if (/^[A-Z]$/.test(trimmed)) return trimmed;

  // 第1空：xxx 第2空：yyy → ["xxx", "yyy"]
  const blankPattern = /第\s*\d+\s*空\s*[:：]\s*([^\n第]+)/g;
  const blanks: string[] = [];
  let blankMatch: RegExpExecArray | null;
  while ((blankMatch = blankPattern.exec(trimmed)) !== null) {
    const val = blankMatch[1]?.trim();
    if (val) blanks.push(val);
  }
  if (blanks.length > 0) return blanks;

  return trimmed;
}
