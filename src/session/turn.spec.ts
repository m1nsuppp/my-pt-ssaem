/**
 * 턴 코어 스펙 — 발화 → 세계 상태 갱신 + 세션 진행 상태 전이의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { SessionStateContext } from '../domain/session-state.ts';
import { SessionState } from '../domain/session-state.ts';
import {
  createFakeExpressionLLM,
  createFakeIntentClassifier,
} from '../llm/fake.ts';
import { DEFAULT_CHAT_STATE } from './scenarios.ts';
import type { TurnInput, TurnResult } from './turn.ts';
import { processTurn } from './turn.ts';

const deps = {
  intent: createFakeIntentClassifier(),
  expression: createFakeExpressionLLM(),
};

function contextAt(currentState: SessionState): SessionStateContext {
  return {
    currentState,
    elapsedSeconds: 0,
    completedSets: 0,
    totalSets: 0,
  };
}

/**
 * 세션 하나에 발화를 순서대로 흘려보내고 각 턴의 결과를 모은다.
 * 세션 진행 컨텍스트는 턴 사이에 이어진다.
 */
async function say(
  texts: string[],
  startAt = SessionState.MainWorkout,
): Promise<TurnResult[]> {
  const input: TurnInput = {
    sessionId: 'turn-spec',
    state: structuredClone(DEFAULT_CHAT_STATE),
    context: contextAt(startAt),
    text: '',
  };

  const results: TurnResult[] = [];
  for (const text of texts) {
    const result = await processTurn({ ...input, text }, deps);
    const { context } = result;
    input.context = context;
    results.push(result);
  }

  return results;
}

describe('processTurn — 세션 진행 상태', () => {
  test('세트를 마치면 휴식 상태로 넘어감', async () => {
    const [result] = await say(['1세트 끝났어']);
    expect(result?.context.currentState).toBe(SessionState.Rest);
  });

  test('일시 중지 후 재개하면 중지 직전 상태로 돌아옴', async () => {
    const [paused, resumed] = await say(['잠깐만', '재개할게']);

    expect(paused?.intent.kind).toBe('PauseSession');
    expect(paused?.decision.kind).toBe('pause');
    expect(paused?.context.currentState).toBe(SessionState.Paused);
    expect(resumed?.context.currentState).toBe(SessionState.MainWorkout);
  });

  test('세션 종료는 마무리를 거쳐 완료로', async () => {
    const [cooldown, completed] = await say(['오늘 운동 종료', '종료']);

    expect(cooldown?.decision.kind).toBe('sessionEnd');
    expect(cooldown?.context.currentState).toBe(SessionState.Cooldown);
    expect(completed?.context.currentState).toBe(SessionState.Completed);
  });

  test('이미 진행 중인 세션에서 다시 시작하면 상태가 그대로', async () => {
    const [result] = await say(['시작하자']);

    expect(result?.context.currentState).toBe(SessionState.MainWorkout);
    expect(result?.decision.reasoning).toContain('이미 진행 중');
  });

  test('일시 중지가 아닌데 재개하면 안내만 하고 상태는 그대로', async () => {
    const [result] = await say(['재개할게']);

    expect(result?.context.currentState).toBe(SessionState.MainWorkout);
    expect(result?.decision.reasoning).toContain('재개할 것이 없다');
  });

  test('컨디션 체크 중에는 일시 중지 요청이 거절됨', async () => {
    const [result] = await say(['잠깐만'], SessionState.PreCheckin);

    expect(result?.context.currentState).toBe(SessionState.PreCheckin);
    expect(result?.decision.kind).toBe('continue');
  });
});

describe('processTurn — 통증으로 인한 세션 종료 집행', () => {
  test('강한 통증은 종료 결정과 함께 세션 상태까지 바꿈', async () => {
    const [result] = await say(['무릎이 8 정도로 아파']);

    expect(result?.decision.kind).toBe('sessionEnd');
    expect(result?.context.currentState).toBe(SessionState.Cooldown);
  });

  test('약한 통증은 경고만 하고 세션을 계속 진행함', async () => {
    const [result] = await say(['무릎이 2 정도로 아파']);

    expect(result?.decision.kind).toBe('continue');
    expect(result?.context.currentState).toBe(SessionState.MainWorkout);
  });
});
