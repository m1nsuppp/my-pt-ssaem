/**
 * rpe-deload 스펙 — RPE 디로드 룰의 공개 인터페이스(입력 → 출력) 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { SetRecord } from '../../domain/set-record.ts';
import type { DecisionInput } from '../decision-engine.ts';
import { decisionInput } from '../test-input.ts';
import { createRpeDeloadRule } from './rpe-deload.ts';

function set(overrides: Partial<SetRecord>): SetRecord {
  return {
    id: 's1',
    sessionId: 'ses',
    exerciseId: 'ex1',
    setNumber: 1,
    plannedReps: 5,
    actualReps: 5,
    rpe: 9,
    completed: true,
    performedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function withHistory(recentHistory: SetRecord[]): DecisionInput {
  return decisionInput({ recentHistory });
}

describe('createRpeDeloadRule', () => {
  test('RPE 9 x 3 연속(happy) -> deltaKg -5, reason/confidence 채워짐', () => {
    const rule = createRpeDeloadRule();
    const result = rule.apply(withHistory([set({}), set({}), set({})]));
    if (result === null || !('adjustment' in result)) {
      throw new Error('expected a weight adjustment');
    }
    expect(result.adjustment.exerciseId).toBe('ex1');
    expect(result.adjustment.deltaKg).toBe(-5);
    expect(result.adjustment.confidence).toBe(0.9);
    expect(result.adjustment.reason).toBe('RPE >= 9 for 3 consecutive sets');
  });

  test('RPE 9 x 3에서 정확히 3개째까지 일치하면 매치', () => {
    const rule = createRpeDeloadRule();
    // 과거 세트 2개 + 최근 3개 = 총 5개, 최근 3개가 RPE 9
    const history = [set({ rpe: 7 }), set({}), set({}), set({}), set({})];
    expect(rule.apply(withHistory(history))).not.toBeNull();
  });

  test('RPE 9 x 3에서 2개째가 RPE 8이면 null', () => {
    const rule = createRpeDeloadRule();
    const history = [set({}), set({ rpe: 8 }), set({})];
    expect(rule.apply(withHistory(history))).toBeNull();
  });

  test('RPE 9 x 3에서 마지막 세트가 completed:false 또는 rpe 없으면 null', () => {
    const rule = createRpeDeloadRule();
    const incomplete = [set({}), set({}), set({ completed: false })];
    const noRpe: SetRecord[] = [
      set({}),
      set({}),
      {
        id: 's1',
        sessionId: 'ses',
        exerciseId: 'ex1',
        setNumber: 3,
        plannedReps: 5,
        actualReps: 5,
        completed: true,
        performedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ];
    expect(rule.apply(withHistory(incomplete))).toBeNull();
    expect(rule.apply(withHistory(noRpe))).toBeNull();
  });

  test('빈 history -> null', () => {
    const rule = createRpeDeloadRule();
    expect(rule.apply(withHistory([]))).toBeNull();
  });

  test('config 오버라이드(threshold 10, consecutive 2, delta -2.5) 적용', () => {
    const rule = createRpeDeloadRule({
      thresholdRpe: 10,
      consecutiveSets: 2,
      deltaKg: -2.5,
    });
    // RPE 9만 있으면 미달, RPE 10이 2개 연속이면 매치
    expect(
      rule.apply(withHistory([set({ rpe: 9 }), set({ rpe: 9 })])),
    ).toBeNull();

    const result = rule.apply(
      withHistory([set({ rpe: 10 }), set({ rpe: 10 })]),
    );
    if (result === null || !('adjustment' in result)) {
      throw new Error('expected a weight adjustment');
    }
    expect(result.adjustment.deltaKg).toBe(-2.5);
    expect(result.adjustment.reason).toBe('RPE >= 10 for 2 consecutive sets');
  });
});
