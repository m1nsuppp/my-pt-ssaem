/**
 * 세트 기록 (Set Record) — 회원이 실제로 수행한 세트별 결과.
 *
 * CONTEXT "세트 기록" 섹션에서 파생. 목표치 대비 실제 수행량을 기록한다.
 */
export interface SetRecord {
  id: string;
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  plannedReps: number;
  plannedWeightKg?: number;
  actualReps: number;
  actualWeightKg?: number;
  /** 실제 RPE (1~10) */
  rpe?: number;
  completed: boolean;
  performedAt: Date;
}
