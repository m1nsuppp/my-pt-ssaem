/**
 * 세션 상태 머신 — 세션 진행 상태와 실행 컨텍스트, 상태 전이 규칙.
 *
 * CONTEXT "세션 상태 머신" 섹션에서 파생.
 * 전이는 명시적 의도(Intent)와 자동 트리거(휴식 타이머 만료)로 발생한다.
 */

import type { Intent } from './intent.ts';

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
  /** 일시 중지 직전 상태 — ResumeSession으로 되돌아갈 지점 */
  pausedFrom?: SessionState;
}

/**
 * 전이 트리거 — 사용자 의도 또는 시스템 이벤트.
 *
 * 의도 종류는 도메인 `Intent`에서 파생해 정의가 갈라지지 않게 한다.
 */
export type TransitionTrigger = Intent['kind'] | 'RestTimerExpired';

/** 세션이 더 이상 진행되지 않는 종착 상태 */
const TERMINAL_STATES: readonly SessionState[] = [
  SessionState.Completed,
  SessionState.Abandoned,
];

/** 일시 중지할 수 있는 상태 — 진행 중인 상태만 해당 */
const PAUSABLE_STATES: readonly SessionState[] = [
  SessionState.Warmup,
  SessionState.MainWorkout,
  SessionState.Rest,
  SessionState.BetweenExercise,
  SessionState.Cooldown,
];

/**
 * 상태별 전이 표 — `[상태][트리거] → 다음 상태`.
 *
 * 표에 없는 조합은 그 상태에서 허용되지 않는 트리거를 뜻한다.
 * PauseSession/ResumeSession/EndSession은 여러 상태에 공통이라 표 밖에서 처리한다.
 */
const TRANSITIONS: Partial<
  Record<SessionState, Partial<Record<TransitionTrigger, SessionState>>>
> = {
  [SessionState.PreCheckin]: {
    StartSession: SessionState.Warmup,
  },
  [SessionState.Warmup]: {
    CompleteExercise: SessionState.MainWorkout,
    CompleteSet: SessionState.MainWorkout,
  },
  [SessionState.MainWorkout]: {
    CompleteSet: SessionState.Rest,
    SkipSet: SessionState.Rest,
    CompleteExercise: SessionState.BetweenExercise,
  },
  [SessionState.Rest]: {
    RestTimerExpired: SessionState.MainWorkout,
    CompleteExercise: SessionState.BetweenExercise,
  },
  [SessionState.BetweenExercise]: {
    StartSession: SessionState.MainWorkout,
    CompleteSet: SessionState.Rest,
    SwapExercise: SessionState.MainWorkout,
  },
  [SessionState.Cooldown]: {},
};

/**
 * 주어진 상태에서 트리거가 만드는 다음 상태를 반환한다.
 *
 * 허용되지 않는 트리거면 `null` — 호출 측이 상태를 유지하고 회원에게 안내한다.
 * 잘못된 시점의 발화는 프로그램 오류가 아니라 정상적인 대화 상황이다.
 *
 * @param current - 현재 세션 상태
 * @param trigger - 사용자 의도 또는 시스템 이벤트
 * @returns 다음 상태, 허용되지 않으면 `null`
 */
export function nextSessionState(
  current: SessionState,
  trigger: TransitionTrigger,
): SessionState | null {
  if (TERMINAL_STATES.includes(current)) {
    return null;
  }

  if (trigger === 'EndSession') {
    return current === SessionState.Cooldown
      ? SessionState.Completed
      : SessionState.Cooldown;
  }

  if (trigger === 'PauseSession') {
    return PAUSABLE_STATES.includes(current) ? SessionState.Paused : null;
  }

  if (current === SessionState.Paused) {
    // 일시 중지 중에는 재개만 받는다. 복귀 지점은 컨텍스트가 기억한다.
    return null;
  }

  return TRANSITIONS[current]?.[trigger] ?? null;
}

/**
 * 트리거를 세션 컨텍스트에 적용한다.
 *
 * 전이가 허용되지 않으면 컨텍스트를 그대로 반환한다 — 상태는 변하지 않는다.
 * `PauseSession`은 복귀 지점을 기록하고, `ResumeSession`은 그 지점으로 되돌린다.
 *
 * @param context - 현재 세션 컨텍스트
 * @param trigger - 사용자 의도 또는 시스템 이벤트
 * @returns 전이 결과 컨텍스트 (원본은 변경하지 않음)
 */
export function applyTransition(
  context: SessionStateContext,
  trigger: TransitionTrigger,
): SessionStateContext {
  if (trigger === 'ResumeSession') {
    if (context.currentState !== SessionState.Paused) {
      return context;
    }
    const { pausedFrom, ...rest } = context;

    return { ...rest, currentState: pausedFrom ?? SessionState.MainWorkout };
  }

  const next = nextSessionState(context.currentState, trigger);
  if (next === null) {
    return context;
  }

  if (next === SessionState.Paused) {
    return { ...context, currentState: next, pausedFrom: context.currentState };
  }

  return { ...context, currentState: next };
}
