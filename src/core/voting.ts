import type { QuestionAnswer, FinalAnswer } from '../types';

export interface ProviderQuestionAnswer extends QuestionAnswer {
  providerId: string;
}

interface VoteBucket {
  answer: string | string[];
  count: number;
  totalWeight: number;
}

/**
 * Normalize an answer to a comparable string key.
 * For string[]: join with null separator to avoid collisions.
 * Order is preserved — 选词填空 answers are position-dependent (["A","C"] ≠ ["C","A"]).
 * Multi-choice answers are already instructed to be in alphabetical order by the prompt.
 */
function answerKey(answer: string | string[]): string {
  if (Array.isArray(answer)) {
    return answer.join('\0');
  }
  return answer;
}

/**
 * Determine the winning answer for a single question via weighted majority vote.
 *
 * Algorithm:
 * - Each provider casts one vote for its answer.
 * - Votes are grouped by normalized answer key.
 * - Winner = group with highest vote count.
 * - Tie-break: highest sum of (providerWeight × confidence/100).
 */
export function vote(
  id: string,
  answers: ProviderQuestionAnswer[],
  providerWeights: Map<string, number>,
): FinalAnswer {
  if (answers.length === 0) {
    return { id, answer: '', votes: 0, totalProviders: 0 };
  }

  const buckets = new Map<string, VoteBucket>();

  for (const qa of answers) {
    const key = answerKey(qa.answer);
    const baseWeight = providerWeights.get(qa.providerId) ?? 1.0;
    const confidence = qa.confidence ?? 100;
    const effectiveWeight = baseWeight * (confidence / 100);

    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.totalWeight += effectiveWeight;
    } else {
      buckets.set(key, {
        answer: qa.answer,
        count: 1,
        totalWeight: effectiveWeight,
      });
    }
  }

  let winner: VoteBucket | undefined;
  for (const bucket of buckets.values()) {
    if (
      !winner ||
      bucket.count > winner.count ||
      (bucket.count === winner.count && bucket.totalWeight > winner.totalWeight)
    ) {
      winner = bucket;
    }
  }

  return {
    id,
    answer: winner?.answer ?? '',
    votes: winner?.count ?? 0,
    totalProviders: answers.length,
  };
}
