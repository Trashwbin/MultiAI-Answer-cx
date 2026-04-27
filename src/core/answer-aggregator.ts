import type { ProviderResponse, FinalAnswer } from '../types';
import { AI_PROVIDERS } from '../config/ai-config';
import { vote, type ProviderQuestionAnswer } from './voting';

export function aggregateAnswers(
  responses: ProviderResponse[],
  customWeights?: Map<string, number>,
): FinalAnswer[] {
  const providerWeights = new Map<string, number>();
  for (const config of AI_PROVIDERS) {
    providerWeights.set(config.id, config.weight);
  }
  if (customWeights) {
    for (const [id, weight] of customWeights) {
      providerWeights.set(id, weight);
    }
  }

  const grouped = new Map<string, ProviderQuestionAnswer[]>();

  for (const response of responses) {
    for (const qa of response.answers) {
      const entry: ProviderQuestionAnswer = { ...qa, providerId: response.providerId };
      const existing = grouped.get(qa.id);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(qa.id, [entry]);
      }
    }
  }

  const results: FinalAnswer[] = [];
  for (const [id, answers] of grouped) {
    results.push(vote(id, answers, providerWeights));
  }

  results.sort((a, b) => {
    const numA = parseInt(a.id, 10);
    const numB = parseInt(b.id, 10);
    if (isNaN(numA) || isNaN(numB)) {
      return a.id.localeCompare(b.id);
    }
    return numA - numB;
  });

  return results;
}
