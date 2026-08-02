/**
 * 세션 상태 머신 — 세션 진행 상태와 실행 컨텍스트.
 *
 * CONTEXT "세션 상태 머신" 섹션에서 파생.
 * 상태 전이 로직은 후속 이슈에서 구현하므로, 여기서는 상태 enum과 실행 컨텍스트만 정의한다.
 */

export enum SessionState {
  PreCheckin = 'preCheckin',
  Warmup = 'warmup',
  MainWorkout = 'mainWorkout',
  Rest = 'rest',
  BetweenExercise = 'betweenExercise',
  Cooldown = 'cooldown',
  Completed = 'completed',
  Paused = 'paused',
  Abandoned = 'abandoned',
}

/** 세션 실행 중 유지되는 컨텍스트 */
export interface SessionStateContext {
  currentState: SessionState;
  elapsedSeconds: number;
  currentExerciseId?: string;
  completedSets: number;
  totalSets: number;
}
