/**
 * 결정 엔진 (Decision Engine) — 세션 중 자동조절 판정 진입점.
 *
 * 등록된 규칙을 순서대로 적용해 첫 번째로 판정을 내는 규칙에서 멈춘다(first-match).
 * 규칙 순서가 곧 우선순위이며, 안전에 가까운 규칙일수록 앞에 둔다 —
 * 부하를 줄이는 판정이 늘리는 판정보다 먼저 검토되어야 한다.
 */

import type { Program } from '../domain/program.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { SetRecord } from '../domain/set-record.ts';
import type { PlannedSet } from '../domain/workout.ts';

export interface DecisionInput {
  /** 프로그램 */
  program: Program;
  /** 현재 운동 식별자 */
  exerciseId: string;
  /** 해당 운동 최근 세트, 최신이 마지막 */
  recentHistory: SetRecord[];
  /** 현재(다음) 계획 세트 */
  currentSet: PlannedSet;
}

/**
 * 자동조절 규칙.
 *
 * 판정할 것이 없으면 `null`을 반환해 다음 규칙에 차례를 넘긴다.
 */
export interface Rule {
  /** 규칙 식별자 — 판정 근거를 로그·디버깅에서 추적하기 위한 이름 */
  name: string;
  apply: (input: DecisionInput) => ProgressiveOverloadAction | null;
}

export interface DecisionEngine {
  decide: (input: DecisionInput) => ProgressiveOverloadAction | null;
}

/**
 * 규칙 목록으로 결정 엔진을 만든다.
 *
 * @param rules - 우선순위 순서. 앞선 규칙이 판정하면 뒤 규칙은 평가하지 않는다.
 */
export function createDecisionEngine(rules: Rule[]): DecisionEngine {
  return {
    decide(input: DecisionInput): ProgressiveOverloadAction | null {
      for (const rule of rules) {
        const action = rule.apply(input);
        if (action !== null) return action;
      }
      return null;
    },
  };
}
