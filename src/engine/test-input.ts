/**
 * 엔진 스펙용 DecisionInput 생성기.
 *
 * 규칙 스펙은 대부분 세트 이력이나 계획 세트 하나만 관심사인데, DecisionInput은
 * 프로그램까지 요구한다. 각 스펙이 같은 더미를 반복 작성하지 않도록 여기에 모은다.
 */

import type { Program } from '../domain/program.ts';
import type { DecisionInput } from './decision-engine.ts';

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

/** 기본값 위에 관심 있는 필드만 덮어쓴다. */
export function decisionInput(
  overrides: Partial<DecisionInput> = {},
): DecisionInput {
  return {
    program: minimalProgram(),
    exerciseId: 'ex1',
    recentHistory: [],
    currentSet: { reps: 5, weightKg: 100 },
    ...overrides,
  };
}
