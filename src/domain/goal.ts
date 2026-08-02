/**
 * 목표 (Goal) — 회원이 설정한 성과 목표.
 *
 * CONTEXT "목표 설정" / "진행 추적" 섹션에서 파생.
 * Strength/Body Composition/Volume/Qualitative 4종을 합집합으로 표현한다.
 */
export type GoalStatus = 'active' | 'achieved' | 'abandoned' | 'onHold';
export type GoalPriority = 'primary' | 'secondary';

/** Strength 목표의 측정 방식 */
export type StrengthMetric =
  | { kind: 'e1RM' }
  | { kind: 'oneRM' }
  | { kind: 'nRM'; reps: number }
  | { kind: 'weightForReps'; weightKg: number; reps: number };

/** Body Composition 목표 — 사용자 수동 입력 필요 */
export type BodyCompositionMetric =
  | { kind: 'bodyWeight'; targetKg: number }
  | { kind: 'bodyFatPercent'; targetPercent: number }
  | { kind: 'circumference'; bodyPart: string; targetCm: number };

/** Volume 목표 */
export type VolumeMetric =
  | { kind: 'weeklyVolume'; targetVolume: number }
  | { kind: 'monthlyVolume'; targetVolume: number };

export type GoalMetric =
  | { kind: 'strength'; strength: StrengthMetric; exerciseId: string }
  | { kind: 'bodyComposition'; measure: BodyCompositionMetric }
  | { kind: 'volume'; measure: VolumeMetric }
  | { kind: 'qualitative'; description: string };

export interface Goal {
  id: string;
  metric: GoalMetric;
  priority: GoalPriority;
  status: GoalStatus;
  startedAt: Date;
  achievedAt?: Date;
  targetDate?: Date;
  note?: string;
}
