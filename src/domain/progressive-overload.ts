/**
 * 점진적 과부하 (Progressive Overload) — 자동조절의 3개 스코프.
 *
 * CONTEXT "과부하 모델" 섹션에서 파생.
 * 엔진 규칙 로직은 후속 이슈에서 구현하므로, 여기서는 데이터 모델만 정의한다.
 */

/** 자동조절의 시간 범위 (3개 스코프) */
export type OverloadScope = 'inSession' | 'betweenSessions' | 'program';

export interface WeightAdjustment {
  exerciseId: string;
  /** 양수 = 증가, 음수 = 감소 */
  deltaKg: number;
  reason: string;
  /** 확신도 (0.0 ~ 1.0) */
  confidence: number;
}

export type ProgressiveOverloadAction =
  | { scope: 'inSession'; type: 'weightAdjustment'; adjustment: WeightAdjustment }
  | {
      scope: 'betweenSessions';
      type: 'weightStartSuggestion';
      adjustment: WeightAdjustment;
    }
  | {
      scope: 'program';
      type: 'exerciseSwap';
      fromExerciseId: string;
      toExerciseId: string;
      reason: string;
    };
