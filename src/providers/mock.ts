import type { ProviderResponse, Question, QuestionAnswer } from '../types';
import { BaseProvider } from './base-provider';

const MOCK_ANSWERS: Record<string, Record<string, string | string[]>> = {
  'mock-fast': {
    '1': 'A',
    '2': ['A', 'B', 'D'],
    '3': '正确',
    '4': 'B',
    '5': '错误',
    '6': ['A', 'B', 'C'],
  },
  'mock-slow': {
    '1': 'A',
    '2': ['A', 'B'],
    '3': '正确',
    '4': 'B',
    '5': '错误',
    '6': ['A', 'B'],
  },
};

const MOCK_DELAYS: Record<string, number> = {
  'mock-fast': 800,
  'mock-slow': 3000,
  'mock-fail': 1500,
};

export class MockProvider extends BaseProvider {
  async query(question: Question): Promise<ProviderResponse> {
    const delayMs = MOCK_DELAYS[this.config.id] ?? 1000;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));

    if (this.config.id === 'mock-fail') {
      return {
        providerId: this.config.id,
        answers: [],
        rawText: '',
        error: `Mock provider 模拟错误: 认证失败 (401)`,
      };
    }

    const answerMap = MOCK_ANSWERS[this.config.id] ?? MOCK_ANSWERS['mock-fast']!;
    const mockAnswer = answerMap[question.number];

    const answers: QuestionAnswer[] = [];
    if (mockAnswer !== undefined) {
      answers.push({
        questionNumber: question.number,
        answer: mockAnswer,
        confidence: this.config.id === 'mock-fast' ? 95 : 70,
      });
    }

    const rawText = JSON.stringify({ answers }, null, 2);

    return {
      providerId: this.config.id,
      answers,
      rawText,
    };
  }

  async checkAuth(): Promise<'authenticated'> {
    return 'authenticated';
  }
}
