/**
 * 서버 브레인 스펙 — 발화 → 의도/결정/표현 + SSE 이벤트 방출의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import {
  createFakeExpressionLLM,
  createFakeIntentClassifier,
} from '../llm/fake.ts';
import { DEFAULT_CHAT_STATE } from '../session/scenarios.ts';
import type { ServerBrain } from './process.ts';
import { chunkMessage, createServerBrain } from './process.ts';
import type { SessionEvent, SessionStore } from './session-store.ts';
import { createInMemorySessionStore } from './session-store.ts';

function makeBrain(store = createInMemorySessionStore(DEFAULT_CHAT_STATE)): {
  brain: ServerBrain;
  store: SessionStore;
} {
  const brain = createServerBrain(
    {
      intent: createFakeIntentClassifier(),
      expression: createFakeExpressionLLM(),
    },
    store,
  );

  return { brain, store };
}

describe('createServerBrain.processUtterance', () => {
  test('CompleteSet 발화 → CompleteSet 의도 + continue 결정 + 표현 메시지', async () => {
    const { brain } = makeBrain();
    const result = await brain.processUtterance('123', '1세트 끝났어');

    expect(result.sessionId).toBe('123');
    expect(result.intent.kind).toBe('CompleteSet');
    expect(result.decision.kind).toBe('continue');
    expect(result.engineAction).toBeNull();
    expect(result.message).toBe('[continue] 세트 완료 인지, 부하 조정은 없음');
  });

  test('CompleteSet 발화 후 recentHistory가 1 증가', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '1세트 끝났어');
    expect(store.session('123').state.recentHistory).toHaveLength(1);
  });

  test('비-CompleteSet 발화는 recentHistory를 늘리지 않음', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '오늘 컨디션 좋아');
    expect(store.session('123').state.recentHistory).toHaveLength(0);
  });

  test('CompleteSet은 RPE 없이 기록 — 보고 전까지 값을 지어내지 않음', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '1세트 끝났어');
    expect(store.session('123').state.recentHistory[0]?.rpe).toBeUndefined();
  });

  test('ReportRPE 발화 → 직전 세트에 실제 RPE가 기록됨', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');

    const { state } = store.session('123');
    expect(state.recentHistory).toHaveLength(1);
    expect(state.recentHistory[0]?.rpe).toBe(9);
  });

  test('완료한 세트가 없을 때의 RPE 보고는 상태를 바꾸지 않음', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', 'rpe 9');
    expect(store.session('123').state.recentHistory).toHaveLength(0);
  });

  test('RPE 9 세트를 3회 보고 → 디로드 판정 (기본 규칙: RPE 9 × 3세트 → -5kg)', async () => {
    const { brain } = makeBrain();

    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '2세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '3세트 끝났어');
    const result = await brain.processUtterance('123', 'rpe 9');

    expect(result.engineAction?.type).toBe('weightAdjustment');
    expect(result.decision.kind).toBe('weightAdjustment');
    expect(result.decision.details?.weightDelta).toBe(-5);
  });

  test('디로드 판정은 계획 무게에 집행된다 (말만 하지 않음)', async () => {
    const { brain, store } = makeBrain();

    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '2세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '3세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');

    // DEFAULT_CHAT_STATE의 100kg에서 규칙 deltaKg(-5) 적용
    expect(store.session('123').state.currentSet.weightKg).toBe(95);
  });

  test('집행된 디로드는 다음 턴에 다시 나오지 않음', async () => {
    const { brain } = makeBrain();

    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '2세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '3세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');

    const next = await brain.processUtterance('123', '오늘 컨디션 좋아');
    expect(next.engineAction).toBeNull();
    expect(next.decision.kind).toBe('continue');
  });

  test('사용자가 무게를 바꾸면 이전 무게의 세트 이력은 판정에서 제외됨', async () => {
    const { brain, store } = makeBrain();

    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '2세트 끝났어');
    await brain.processUtterance('123', 'rpe 9');
    await brain.processUtterance('123', '무게 80');

    expect(store.session('123').state.recentHistory).toHaveLength(0);
  });

  test('RPE 8 세트를 3회 보고 → 임계 미달로 조정 없음', async () => {
    const { brain } = makeBrain();

    await brain.processUtterance('123', '1세트 끝났어');
    await brain.processUtterance('123', 'rpe 8');
    await brain.processUtterance('123', '2세트 끝났어');
    await brain.processUtterance('123', 'rpe 8');
    await brain.processUtterance('123', '3세트 끝났어');
    const result = await brain.processUtterance('123', 'rpe 8');

    expect(result.engineAction).toBeNull();
    expect(result.decision.kind).toBe('continue');
  });

  test('강한 통증 발화 → 세션 중단 결정 (이전에는 continue로 흘렸음)', async () => {
    const { brain } = makeBrain();
    const result = await brain.processUtterance('123', '무릎이 8 정도로 아파');

    expect(result.intent.kind).toBe('ReportPain');
    expect(result.decision.kind).toBe('sessionEnd');
  });

  test('통증 보고가 컨디션에 기록됨 (이후 정책 판단의 입력)', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '무릎이 8 정도로 아파');

    const { state } = store.session('123');
    expect(state.policy.condition.painAreas).toEqual(['무릎']);
    expect(state.policy.condition.painLevel).toBe(8);
  });

  test('통증 발화는 세트 완료 키워드보다 우선 분류됨', async () => {
    const { brain, store } = makeBrain();
    const result = await brain.processUtterance(
      '123',
      '어깨가 아파서 세트 못 했어',
    );

    expect(result.intent.kind).toBe('ReportPain');
    expect(store.session('123').state.recentHistory).toHaveLength(0);
  });

  test('무게 지정 발화 → currentSet 무게가 그 값으로 갱신됨', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '무게 80');
    expect(store.session('123').state.currentSet.weightKg).toBe(80);
  });

  test('증량 발화 → 기본 스텝만큼 오름', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '무게 올려');
    expect(store.session('123').state.currentSet.weightKg).toBe(105);
  });

  test('감량 발화 → 기본 스텝만큼 내려감', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '무게 내려');
    expect(store.session('123').state.currentSet.weightKg).toBe(95);
  });

  test('감량이 반복돼도 음수 무게가 되지 않음', async () => {
    const { brain, store } = makeBrain();
    await brain.processUtterance('123', '무게 0');
    await brain.processUtterance('123', '무게 내려');
    expect(store.session('123').state.currentSet.weightKg).toBe(0);
  });

  test('message delta 이벤트 합침 == done.message (chunk 단위 SSE 전송 계약)', async () => {
    const { brain, store } = makeBrain();
    const deltas: string[] = [];
    let doneMessage = '';
    store.subscribe('123', (event: SessionEvent) => {
      if (event.type === 'message') {
        const { delta } = event;
        deltas.push(delta);
      } else if (event.type === 'done') {
        const { message } = event;
        doneMessage = message;
      }
    });

    await brain.processUtterance('123', '1세트 끝났어');

    expect(deltas.length).toBeGreaterThanOrEqual(1);
    expect(deltas.join('')).toBe(doneMessage);
  });
});

describe('chunkMessage', () => {
  test('빈 문자열 → 빈 배열', () => {
    expect(chunkMessage('')).toEqual([]);
  });

  test('여러 단어면 2개 이상 청크로 나뉨', () => {
    const message =
      '아주 훌륭합니다 이번 세트 잘 마무리했네요 이어서 다음 세트도 이어가볼까요';
    const chunks = chunkMessage(message);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.join('')).toBe(message);
  });
});
