import { buildPrompt as buildRichPrompt } from '../config/prompts';
import type {
  AIProvider,
  PromptMode,
  ProviderConfig,
  Question,
  ProviderResponse,
  SessionCleanupMode,
} from '../types';

/** Shared prompt building for every provider instance. */
export abstract class BaseProvider implements AIProvider {
  promptMode: PromptMode = 'standard';
  sessionCleanupMode: SessionCleanupMode = 'on_success';

  constructor(public readonly config: ProviderConfig) {}

  abstract query(questions: Question[]): Promise<ProviderResponse>;

  protected buildPrompt(questions: Question[]): string {
    return buildRichPrompt(questions, this.promptMode);
  }
}
