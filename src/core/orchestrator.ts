import type { AIProvider, Question, QuestionAnswer, ProviderResponse, FinalAnswer } from '../types';
import { getEnabledProviders, getProvidersByIds } from '../providers/registry';
import { aggregateAnswers } from './answer-aggregator';

export interface OrchestratorResult {
  responses: ProviderResponse[];
  finalAnswers: FinalAnswer[];
  durationMs: number;
}

export interface QueryOptions {
  providerIds?: string[];
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

async function queryProviderQuestions(
  provider: AIProvider,
  questions: Question[],
  signal: AbortSignal,
): Promise<ProviderResponse> {
  const allAnswers: QuestionAnswer[] = [];
  const rawTexts: string[] = [];

  for (const question of questions) {
    if (signal.aborted) {
      throw new DOMException('Query timed out', 'AbortError');
    }
    const response = await provider.query(question);
    allAnswers.push(...response.answers);
    rawTexts.push(response.rawText);
  }

  return {
    providerId: provider.config.id,
    answers: allAnswers,
    rawText: rawTexts.join('\n---\n'),
  };
}

export async function queryAllProviders(
  questions: Question[],
  options?: QueryOptions,
): Promise<OrchestratorResult> {
  const start = performance.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const providers = options?.providerIds?.length
    ? getProvidersByIds(options.providerIds)
    : getEnabledProviders();

  const settled = await Promise.allSettled(
    providers.map((provider) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const work = queryProviderQuestions(provider, questions, controller.signal);

      // Race against AbortController so in-flight requests are cut off at timeout
      const timeout = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('Query timed out', 'AbortError'));
        });
      });

      return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
    }),
  );

  const responses: ProviderResponse[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      responses.push(result.value);
    }
  }

  const finalAnswers = aggregateAnswers(responses);
  const durationMs = Math.round(performance.now() - start);

  return { responses, finalAnswers, durationMs };
}
