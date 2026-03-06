import type { ProviderResponse, Question } from '../types';
import { BaseProvider } from './base-provider';

export class GeminiProvider extends BaseProvider {
  async query(_question: Question): Promise<ProviderResponse> {
    return {
      providerId: this.config.id,
      answers: [],
      rawText: '',
      error: 'Gemini requires DOM access — not supported in v2. Will be added in v3.',
    };
  }
}
