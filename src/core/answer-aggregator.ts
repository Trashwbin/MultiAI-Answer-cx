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
      const existing = grouped.get(qa.questionNumber);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(qa.questionNumber, [entry]);
      }
    }
  }

  const results: FinalAnswer[] = [];
  for (const [questionNumber, answers] of grouped) {
    results.push(vote(questionNumber, answers, providerWeights));
  }

  results.sort((a, b) => {
    const numA = parseInt(a.questionNumber, 10);
    const numB = parseInt(b.questionNumber, 10);
    if (isNaN(numA) || isNaN(numB)) {
      return a.questionNumber.localeCompare(b.questionNumber);
    }
    return numA - numB;
  });

  return results;
}
