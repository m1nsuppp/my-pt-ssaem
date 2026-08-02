/**
 * 결정 파이프라인 스펙 — 입력 상태 → 엔진 액션/결과의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { Program } from '../domain/program.ts';
import type { SetRecord } from '../domain/set-record.ts';
import { runDecisionPipeline, synthesizeDecision } from './pipeline.ts';
import type { ScenarioState } from './scenarios.ts';

function minimalProgram(): Program {
  return {
    id: 'p1',
    name: 'demo strength',
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

function highRpeSet(overrides: Partial<SetRecord> = {}): SetRecord {
  return {
    id: 's1',
    sessionId: 'ses1',
    exerciseId: 'squat',
    setNumber: 1,
    plannedReps: 5,
    actualReps: 5,
    rpe: 9,
    completed: true,
    performedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function stateWithHistory(recentHistory: SetRecord[]): ScenarioState {
  return {
    name: 'high-rpe-deload',
    program: minimalProgram(),
    exerciseId: 'squat',
    rule: { thresholdRpe: 9, consecutiveSets: 3, deltaKg: -5, confidence: 0.9 },
    recentHistory,
    currentSet: { reps: 5, weightKg: 100 },
    persona: {
      id: 'careful-coach',
      name: '케어형 코치',
      tone: 'caring',
      description: '부드럽고 배려하는 코치',
      styleGuide: '부드럽고 배려하는 말투로 조언한다.',
    },
    policy: {
      condition: {
        sleepHours: 6,
        fatigue: 8,
        painAreas: [],
        painLevel: 0,
        nutrition: 'fair',
      },
      recentHistory: [],
      trends: {
        volumeTrend: 'stable',
        rpeTrend: 'increasing',
        stagnationCount: 2,
        accumulatedFatigue: 0.7,
        daysSinceLastRest: 6,
      },
    },
  };
}

describe('runDecisionPipeline', () => {
  test('RPE 9 x 3연속 history → inSession weightAdjustment (deltaKg -5)', async () => {
    const state = stateWithHistory([highRpeSet(), highRpeSet(), highRpeSet()]);
    const result = await runDecisionPipeline(state, {});

    expect(result.engineAction).toEqual({
      scope: 'inSession',
      type: 'weightAdjustment',
      adjustment: {
        exerciseId: 'squat',
        deltaKg: -5,
        reason: 'RPE >= 9 for 3 consecutive sets',
        confidence: 0.9,
      },
    });
    expect(result.message).toBe(
      'squat 무게 -5kg 조정 제안: RPE >= 9 for 3 consecutive sets (확신도 0.9)',
    );
  });

  test('빈 history → engineAction null', async () => {
    const state = stateWithHistory([]);
    const result = await runDecisionPipeline(state, {});
    expect(result.engineAction).toBeNull();
  });

  test('policy 없으면 policy_decision 이벤트 방출 안 함', async () => {
    const events: string[] = [];
    await runDecisionPipeline(stateWithHistory([]), {}, (event) => {
      events.push(event.type);
    });
    expect(events).toEqual(['scenario', 'engine_action', 'message', 'result']);
  });
});

describe('synthesizeDecision', () => {
  test('CompleteSet + engineAction null → continue', () => {
    const decision = synthesizeDecision({ kind: 'CompleteSet' }, null);
    expect(decision.kind).toBe('continue');
    expect(decision.confidence).toBe(0.9);
  });

  test('engineAction 있으면 weightAdjustment + weightDelta', () => {
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
    const decision = synthesizeDecision(
      { kind: 'AskQuestion', text: '?' },
      action,
    );
    expect(decision.kind).toBe('weightAdjustment');
    expect(decision.details?.weightDelta).toBe(-5);
  });
});
