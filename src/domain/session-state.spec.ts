/**
 * 세션 상태 머신 스펙 — 전이 규칙의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { SessionStateContext } from './session-state.ts';
import {
  applyTransition,
  nextSessionState,
  SessionState,
} from './session-state.ts';

function contextAt(currentState: SessionState): SessionStateContext {
  return {
    currentState,
    elapsedSeconds: 0,
    completedSets: 0,
    totalSets: 3,
  };
}

describe('nextSessionState — 세션 진행', () => {
  test('컨디션 체크에서 세션을 시작하면 워밍업으로', () => {
    expect(nextSessionState(SessionState.PreCheckin, 'StartSession')).toBe(
      SessionState.Warmup,
    );
  });

  test('세트를 마치면 휴식으로, 휴식 타이머가 끝나면 다시 세트로', () => {
    expect(nextSessionState(SessionState.MainWorkout, 'CompleteSet')).toBe(
      SessionState.Rest,
    );
    expect(nextSessionState(SessionState.Rest, 'RestTimerExpired')).toBe(
      SessionState.MainWorkout,
    );
  });

  test('운동을 마치면 운동 간 전환으로', () => {
    expect(nextSessionState(SessionState.MainWorkout, 'CompleteExercise')).toBe(
      SessionState.BetweenExercise,
    );
  });

  test('세션 종료는 마무리를 거쳐 완료로', () => {
    expect(nextSessionState(SessionState.MainWorkout, 'EndSession')).toBe(
      SessionState.Cooldown,
    );
    expect(nextSessionState(SessionState.Cooldown, 'EndSession')).toBe(
      SessionState.Completed,
    );
  });
});

describe('nextSessionState — 허용되지 않는 전이', () => {
  test('세트 수행 중에는 세션을 다시 시작할 수 없음', () => {
    expect(
      nextSessionState(SessionState.MainWorkout, 'StartSession'),
    ).toBeNull();
  });

  test('컨디션 체크 중에는 세트를 완료할 수 없음', () => {
    expect(nextSessionState(SessionState.PreCheckin, 'CompleteSet')).toBeNull();
  });

  test('완료·중도포기 상태에서는 어떤 전이도 일어나지 않음', () => {
    expect(nextSessionState(SessionState.Completed, 'CompleteSet')).toBeNull();
    expect(nextSessionState(SessionState.Abandoned, 'StartSession')).toBeNull();
    expect(nextSessionState(SessionState.Completed, 'EndSession')).toBeNull();
  });

  test('컨디션 체크 중에는 일시 중지할 수 없음', () => {
    expect(
      nextSessionState(SessionState.PreCheckin, 'PauseSession'),
    ).toBeNull();
  });

  test('부하 조절 의도는 상태를 바꾸지 않음', () => {
    expect(
      nextSessionState(SessionState.MainWorkout, 'IncreaseLoad'),
    ).toBeNull();
    expect(nextSessionState(SessionState.MainWorkout, 'ReportRPE')).toBeNull();
  });
});

describe('applyTransition — 일시 중지와 재개', () => {
  test('휴식 중 일시 중지 후 재개하면 휴식으로 돌아옴', () => {
    const paused = applyTransition(
      contextAt(SessionState.Rest),
      'PauseSession',
    );
    expect(paused.currentState).toBe(SessionState.Paused);

    const resumed = applyTransition(paused, 'ResumeSession');
    expect(resumed.currentState).toBe(SessionState.Rest);
  });

  test('세트 수행 중 일시 중지 후 재개하면 세트 수행으로 돌아옴', () => {
    const paused = applyTransition(
      contextAt(SessionState.MainWorkout),
      'PauseSession',
    );
    const resumed = applyTransition(paused, 'ResumeSession');
    expect(resumed.currentState).toBe(SessionState.MainWorkout);
  });

  test('일시 중지 중에는 재개 외의 트리거가 상태를 바꾸지 못함', () => {
    const paused = applyTransition(
      contextAt(SessionState.MainWorkout),
      'PauseSession',
    );
    expect(applyTransition(paused, 'CompleteSet').currentState).toBe(
      SessionState.Paused,
    );
  });

  test('일시 중지가 아닌 상태에서의 재개는 무시됨', () => {
    const context = contextAt(SessionState.MainWorkout);
    expect(applyTransition(context, 'ResumeSession')).toEqual(context);
  });

  test('허용되지 않는 전이는 컨텍스트를 그대로 둠', () => {
    const context = contextAt(SessionState.PreCheckin);
    expect(applyTransition(context, 'CompleteSet')).toEqual(context);
  });

  test('원본 컨텍스트는 변경되지 않음', () => {
    const context = contextAt(SessionState.PreCheckin);
    applyTransition(context, 'StartSession');
    expect(context.currentState).toBe(SessionState.PreCheckin);
  });
});
