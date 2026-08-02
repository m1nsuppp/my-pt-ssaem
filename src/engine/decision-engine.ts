/**
 * 결정 엔진 (Decision Engine) — 세션 중 자동조절 판정 진입점.
 *
 * 주입된 규칙 단일 개를 최근 세트 이력에 적용해,
 * 점진적 과부하 액션을 결정한다. 규칙 체이닝/우선순위는 후속 이슈로 미룬다.
 */

import type { Program } from '../domain/program.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { SetRecord } from '../domain/set-record.ts';
import type { PlannedSet } from '../domain/workout.ts';
import type { RpeDeloadRule } from './rules/rpe-deload.ts';

export interface DecisionInput {
  /** 프로그램 — 이번 규칙에서는 미사용, 후속 규칙용 */
  program: Program;
  /** 현재 운동 식별자 */
  exerciseId: string;
  /** 해당 운동 최근 세트, 최신이 마지막 */
  recentHistory: SetRecord[];
  /** 현재(다음) 계획 세트 — 이번 규칙에서는 미사용, 후속 규칙용 */
  currentSet: PlannedSet;
}

export interface DecisionEngine {
  decide: (input: DecisionInput) => ProgressiveOverloadAction | null;
}

export function createDecisionEngine(rule: RpeDeloadRule): DecisionEngine {
  return {
    decide(input: DecisionInput): ProgressiveOverloadAction | null {
      const adjustment = rule.apply(input.recentHistory);
      if (adjustment === null) {
        return null;
      }
      return {
        scope: 'inSession',
        type: 'weightAdjustment',
        adjustment,
      };
    },
  };
}
