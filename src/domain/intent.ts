/**
 * 의도 (Intent) — 정규화된 사용자 발화를 해석한 결과.
 *
 * CONTEXT "인터랙션 모델" 섹션에서 파생.
 * 채팅/음성/버튼 세 모드를 하나의 Intent로 통합하며,
 * 파라미터가 없는 variant는 빈 객체 리터럴로 둔다.
 */

export type Intent =
  | { kind: 'StartSession' }
  | { kind: 'EndSession' }
  | { kind: 'PauseSession' }
  | { kind: 'ResumeSession' }
  | { kind: 'CompleteSet' }
  | { kind: 'CompleteExercise' }
  | { kind: 'SkipSet' }
  | { kind: 'SwapExercise' }
  | { kind: 'IncreaseLoad' }
  | { kind: 'DecreaseLoad' }
  | { kind: 'SetLoadTo'; valueKg: number }
  | { kind: 'AddReps' }
  | { kind: 'RemoveReps' }
  | { kind: 'ReportRPE'; rpe: number }
  | { kind: 'ReportPain'; areas: string[]; level: number }
  | { kind: 'ReportEnergy'; level: number }
  | { kind: 'ReportSoreness'; areas: string[] }
  | { kind: 'AskQuestion'; text: string }
  | { kind: 'RequestFormCheck'; exerciseId?: string }
  | { kind: 'RequestDemo'; exerciseId?: string }
  | { kind: 'ChangeProgram' }
  | { kind: 'Reschedule' };

/** 정규화된 사용자 발화 */
export interface NormalizedUtterance {
  raw: string;
  /** 앞뒤 공백 제거 + 연속 공백을 1개로 축소 */
  text: string;
}

/** 발화를 정규화한다 — trim 후 연속 공백을 단일 공백으로 축소. */
export function normalizeUtterance(raw: string): NormalizedUtterance {
  const text = raw.trim().replace(/\s+/gv, ' ');

  return { raw, text };
}
