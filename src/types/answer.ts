export interface QuestionAnswer {
  questionNumber: string;
  answer: string | string[];
  confidence?: number;
}

export interface ProviderResponse {
  providerId: string;
  answers: QuestionAnswer[];
  rawText: string;
  error?: string;
}

export interface FinalAnswer {
  questionNumber: string;
  answer: string | string[];
  votes: number;
  totalProviders: number;
}
