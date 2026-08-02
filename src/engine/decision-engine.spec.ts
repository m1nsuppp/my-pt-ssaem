/**
 * decision-engine 스펙 — 엔진 배선(규칙 결과 → 액션/Null)의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { Program } from '../domain/program.ts';
import type { WeightAdjustment } from '../domain/progressive-overload.ts';
import type { SetRecord } from '../domain/set-record.ts';
import type { PlannedSet } from '../domain/workout.ts';
import { createDecisionEngine } from './decision-engine.ts';
import type { RpeDeloadRule } from './rules/rpe-deload.ts';

function minimalProgram(): Program {
  return {
    id: 'p1',
    name: 'test program',
    goal: 'strength',
    experienceLevel: 'beginner',
    durationWeeks: null,
    workoutsPerWeek: 3,
    workouts: [],
    split: 'fullBody',
    periodization: 'linear',
    status: 'active',
    startedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function minimalCurrentSet(): PlannedSet {
  return { reps: 5, weightKg: 100 };
}

function decisionRule(adjustment: WeightAdjustment | null): RpeDeloadRule {
  return { apply: () => adjustment };
}

const adjustment: WeightAdjustment = {
  exerciseId: 'ex1',
  deltaKg: -5,
  reason: 'RPE >= 9 for 3 consecutive sets',
  confidence: 0.9,
};

describe('createDecisionEngine', () => {
  test('규칙이 매치하면 inSession weightAdjustment 액션 반환', () => {
    const engine = createDecisionEngine(decisionRule(adjustment));
    const result = engine.decide({
      program: minimalProgram(),
      exerciseId: 'ex1',
      recentHistory: [] as SetRecord[],
      currentSet: minimalCurrentSet(),
    });

    expect(result).toEqual({
      scope: 'inSession',
      type: 'weightAdjustment',
      adjustment,
    });
  });

  test('규칙이 null이면 엔진도 null 반환', () => {
    const engine = createDecisionEngine(decisionRule(null));
    const result = engine.decide({
      program: minimalProgram(),
      exerciseId: 'ex1',
      recentHistory: [] as SetRecord[],
      currentSet: minimalCurrentSet(),
    });
    expect(result).toBeNull();
  });
});
