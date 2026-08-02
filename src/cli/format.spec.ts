/**
 * format 스펙 — 결정적 포매터의 정확한 문자열 검증.
 */
import { describe, expect, test } from 'bun:test';
import { formatEngineAction } from './format.ts';

describe('formatEngineAction', () => {
  test('null → 디로드 미충족 문구', () => {
    expect(formatEngineAction(null)).toBe(
      '조정 없음 — RPE 디로드 조건(RPE >= 9 x 3세트 연속) 미충족',
    );
  });

  test('-5 액션 → 정확한 조정 제안 문자열', () => {
    const action = {
      scope: 'inSession' as const,
      type: 'weightAdjustment' as const,
      adjustment: {
        exerciseId: 'squat',
        deltaKg: -5,
        reason: 'RPE >= 9 for 3 consecutive sets',
        confidence: 0.9,
      },
    };
    expect(formatEngineAction(action)).toBe(
      'squat 무게 -5kg 조정 제안: RPE >= 9 for 3 consecutive sets (확신도 0.9)',
    );
  });

  test('양수 증가 액션 → + 부호', () => {
    const action = {
      scope: 'inSession' as const,
      type: 'weightAdjustment' as const,
      adjustment: {
        exerciseId: 'bench',
        deltaKg: 2.5,
        reason: 'progression',
        confidence: 0.8,
      },
    };
    expect(formatEngineAction(action)).toBe(
      'bench 무게 +2.5kg 조정 제안: progression (확신도 0.8)',
    );
  });
});
