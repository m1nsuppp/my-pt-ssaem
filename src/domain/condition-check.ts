/**
 * 컨디션 체크 (Condition Check) — 세션 시작 전 회원의 현재 상태.
 *
 * CONTEXT "컨디션 체크" 섹션에서 파생.
 * 기존 src/llm/policy.ts의 ConditionCheck를 단일 진실 원천으로 옮긴 것.
 */
export type NutritionStatus = 'good' | 'fair' | 'poor';

export interface ConditionCheck {
  /** 수면 시간 (시간) */
  sleepHours: number;
  /** 주관적 피로도 (1~10, 10이 가장 피로) */
  fatigue: number;
  /** 보고된 통증 부위 */
  painAreas: string[];
  /** 통증 강도 (0~10, 0 = 통증 없음) */
  painLevel: number;
  /** 영양 상태 */
  nutrition: NutritionStatus;
  /** 자유 텍스트 메모 */
  notes?: string;
}
