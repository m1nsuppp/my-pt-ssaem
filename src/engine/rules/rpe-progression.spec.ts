/**
 * rpe-progression 스펙 — RPE 증량 룰의 공개 인터페이스(입력 → 출력) 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { SetRecord } from '../../domain/set-record.ts';
import type { PlannedSet } from '../../domain/workout.ts';
import type { DecisionInput } from '../decision-engine.ts';
import { decisionInput } from '../test-input.ts';
import { createRpeProgressionRule } from './rpe-progression.ts';

function set(overrides: Partial<SetRecord> = {}): SetRecord {
  return {
    id: 's1',
    sessionId: 'ses',
    exerciseId: 'ex1',
    setNumber: 1,
    plannedReps: 5,
    actualReps: 5,
    rpe: 6,
    completed: true,
    performedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function inputWith(
  recentHistory: SetRecord[],
  currentSet?: PlannedSet,
): DecisionInput {
  return decisionInput({
    recentHistory,
    ...(currentSet === undefined ? {} : { currentSet }),
  });
}

describe('createRpeProgressionRule', () => {
  test('목표 반복 달성 + 낮은 RPE 3연속 → 증량 제안', () => {
    const rule = createRpeProgressionRule();
    const result = rule.apply(inputWith([set(), set(), set()]));

    if (result === null || !('adjustment' in result)) {
      throw new Error('expected a weight adjustment');
    }
    expect(result.adjustment.deltaKg).toBe(2.5);
    expect(result.adjustment.exerciseId).toBe('ex1');
    expect(result.adjustment.confidence).toBe(0.7);
  });

  test('RPE가 상한을 넘은 세트가 끼면 연속이 끊김', () => {
    const rule = createRpeProgressionRule();
    expect(rule.apply(inputWith([set(), set({ rpe: 9 }), set()]))).toBeNull();
  });

  test('목표 반복에 못 미친 세트가 있으면 증량하지 않음', () => {
    const rule = createRpeProgressionRule();
    expect(
      rule.apply(inputWith([set(), set(), set({ actualReps: 3 })])),
    ).toBeNull();
  });

  test('목표 반복이 올라가면 이전 수행은 미달로 판정됨', () => {
    const rule = createRpeProgressionRule();
    const history = [set(), set(), set()];

    expect(rule.apply(inputWith(history))).not.toBeNull();
    // 계획이 5회에서 8회로 바뀌면 5회 수행은 더 이상 목표 달성이 아니다
    expect(
      rule.apply(inputWith(history, { reps: 8, weightKg: 100 })),
    ).toBeNull();
  });

  test('맨몸 운동은 무게로 증량할 수 없어 판정하지 않음', () => {
    const rule = createRpeProgressionRule();
    expect(
      rule.apply(inputWith([set(), set(), set()], { reps: 5, weightKg: null })),
    ).toBeNull();
  });

  test('RPE 미보고 세트는 연속에 포함되지 않음', () => {
    const rule = createRpeProgressionRule();
    const noRpe: SetRecord = {
      id: 's9',
      sessionId: 'ses',
      exerciseId: 'ex1',
      setNumber: 3,
      plannedReps: 5,
      actualReps: 5,
      completed: true,
      performedAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(rule.apply(inputWith([set(), set(), noRpe]))).toBeNull();
  });

  test('빈 history → null', () => {
    expect(createRpeProgressionRule().apply(inputWith([]))).toBeNull();
  });

  test('config 오버라이드(ceiling 8, consecutive 2, delta 5) 적용', () => {
    const rule = createRpeProgressionRule({
      ceilingRpe: 8,
      consecutiveSets: 2,
      deltaKg: 5,
    });
    const result = rule.apply(inputWith([set({ rpe: 8 }), set({ rpe: 8 })]));

    if (result === null || !('adjustment' in result)) {
      throw new Error('expected a weight adjustment');
    }
    expect(result.adjustment.deltaKg).toBe(5);
    expect(result.adjustment.reason).toBe(
      'RPE <= 8 with target reps met for 2 consecutive sets',
    );
  });
});
