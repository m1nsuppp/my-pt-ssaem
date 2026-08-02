/**
 * fake intent classifier 스펙 — 키워드 → Intent 매핑 검증.
 */
import { describe, expect, test } from 'bun:test';
import { normalizeUtterance } from '../domain/intent.ts';
import { createFakeIntentClassifier } from './fake.ts';

const classifier = createFakeIntentClassifier();

describe('createFakeIntentClassifier', () => {
  test("'1세트 끝났어' → CompleteSet", async () => {
    const intent = await classifier.classify(
      normalizeUtterance('1세트 끝났어'),
    );
    expect(intent).toEqual({ kind: 'CompleteSet' });
  });

  test("'무게 10kg로 올려줘' → IncreaseLoad", async () => {
    const intent = await classifier.classify(
      normalizeUtterance('무게 10kg로 올려줘'),
    );
    expect(intent).toEqual({ kind: 'IncreaseLoad' });
  });

  test("'시작' → StartSession", async () => {
    const intent = await classifier.classify(normalizeUtterance('시작'));
    expect(intent).toEqual({ kind: 'StartSession' });
  });

  test('분류 불가 발화 → AskQuestion', async () => {
    const intent = await classifier.classify(
      normalizeUtterance('오늘 날씨 좋네'),
    );
    expect(intent).toEqual({ kind: 'AskQuestion', text: '오늘 날씨 좋네' });
  });
});
