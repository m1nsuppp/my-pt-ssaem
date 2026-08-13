/**
 * 턴 처리 코어 — 발화 하나를 받아 세계 상태를 갱신하고 결과를 낸다.
 *
 * 저장소·전송 계층을 모르므로 어떤 엔트리(HTTP, CLI, 배치)에서든 같은 흐름을 쓴다.
 * 순서: 의도 분류 → 지각(의도 → 상태) → 판정 → 집행(결정 → 상태) → 표현.
 * 표현은 마지막이다 — 발화는 이미 집행된 행동의 렌더링이어야 한다.
 */

import type { Intent } from '../domain/intent.ts';
import { normalizeUtterance } from '../domain/intent.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { SessionStateContext } from '../domain/session-state.ts';
import { applyTransition, SessionState } from '../domain/session-state.ts';
import type { ExpressionLLM } from '../llm/expression.ts';
import type { IntentClassifier } from '../llm/intent.ts';
import type { PolicyDecision } from '../llm/policy.ts';
import { runDecisionPipeline, synthesizeDecision } from './pipeline.ts';
import type { ScenarioState } from './scenarios.ts';

/** 턴 처리에 필요한 LLM 계층 */
export interface TurnDeps {
  intent: IntentClassifier;
  expression: ExpressionLLM;
}

/** 턴 처리 입력 — 세션 하나의 현재 모습 */
export interface TurnInput {
  sessionId: string;
  /** 세계 상태 (세트 기록, 계획 무게, 컨디션). 이 함수가 직접 갱신한다. */
  state: ScenarioState;
  /** 세션 진행 컨텍스트. 갱신본은 결과로 돌려준다. */
  context: SessionStateContext;
  /** 회원의 원문 발화 */
  text: string;
}

/** 턴 처리 결과 — 세계 상태는 `state`에 반영되어 있고, 진행 상태는 `context`로 돌려준다. */
export interface TurnResult {
  intent: Intent;
  engineAction: ProgressiveOverloadAction | null;
  decision: PolicyDecision;
  message: string;
  context: SessionStateContext;
}

/** Array.at()으로 마지막 요소를 가리키는 인덱스 */
const LAST_INDEX = -1;

/** 조정 폭을 지정하지 않은 증감 요청에 적용할 기본 스텝(kg) */
const LOAD_STEP_KG = 5;

/**
 * 계획 세트의 무게를 바꾸고, 실제로 달라졌으면 최근 세트 윈도우를 리셋한다.
 *
 * 이전 무게에서 쌓인 RPE는 새 무게의 판정 근거가 될 수 없다. 리셋하지 않으면
 * 같은 이력이 매 턴 같은 조정을 다시 만들어낸다.
 */
function changeWeight(state: ScenarioState, nextWeightKg: number): void {
  const { currentSet, recentHistory } = state;
  if (currentSet.weightKg === nextWeightKg) {
    return;
  }

  currentSet.weightKg = nextWeightKg;
  recentHistory.length = 0;
}

/**
 * 무게 조정 의도를 계획 세트에 반영한다.
 *
 * 맨몸 운동(`weightKg === null`)은 조정 대상이 아니고, 음수 무게는 만들지 않는다.
 * `IncreaseLoad`/`DecreaseLoad`는 조정 폭이 없는 의도라 기본 스텝을 적용한다.
 */
function applyLoadIntent(state: ScenarioState, intent: Intent): void {
  const { currentSet } = state;

  if (intent.kind === 'SetLoadTo') {
    const { valueKg } = intent;
    if (valueKg < 0) {
      return;
    }
    changeWeight(state, valueKg);
    return;
  }

  if (intent.kind !== 'IncreaseLoad' && intent.kind !== 'DecreaseLoad') {
    return;
  }

  const { weightKg } = currentSet;
  if (weightKg === null) {
    return;
  }

  const delta = intent.kind === 'IncreaseLoad' ? LOAD_STEP_KG : -LOAD_STEP_KG;
  changeWeight(state, Math.max(0, weightKg + delta));
}

/**
 * 의도를 세계 상태에 반영한다 (지각).
 *
 * `CompleteSet`은 RPE를 모르는 채로 기록한다 — 회원이 보고하기 전까지 `undefined`.
 * `ReportRPE`는 직전 세트에 실제 값을 채운다. 채울 세트가 없으면(세트 완료 전 보고)
 * 기록할 곳이 없으므로 상태를 바꾸지 않는다.
 * `ReportPain`은 컨디션에 부위·강도를 남긴다 — 이후 정책 판단의 입력이 된다.
 */
export function applyIntent(
  state: ScenarioState,
  sessionId: string,
  intent: Intent,
): void {
  const { recentHistory, currentSet, policy } = state;

  if (intent.kind === 'CompleteSet') {
    recentHistory.push({
      id: crypto.randomUUID(),
      sessionId,
      exerciseId: state.exerciseId,
      setNumber: recentHistory.length + 1,
      plannedReps: currentSet.reps,
      // 실제 수행 반복은 CompleteSet에 파라미터가 없어 계획치로 둔다.
      actualReps: currentSet.reps,
      completed: true,
      performedAt: new Date(),
    });

    return;
  }

  if (intent.kind === 'ReportRPE') {
    const lastSet = recentHistory.at(LAST_INDEX);
    if (lastSet === undefined) {
      return;
    }
    const { rpe } = intent;
    lastSet.rpe = rpe;
    return;
  }

  if (intent.kind === 'ReportPain') {
    const { areas, level } = intent;
    policy.condition.painAreas = areas;
    policy.condition.painLevel = level;
    return;
  }

  applyLoadIntent(state, intent);
}

/**
 * 결정을 세계 상태에 집행한다 — 발화보다 먼저 세계가 바뀐다.
 *
 * `weightAdjustment`만 집행 대상이다. `sessionEnd`/`exerciseSwap`은 세션 상태 머신과
 * 운동 DB가 전제라 아직 집행하지 못하고 발화로만 전달된다.
 */
export function applyDecision(
  state: ScenarioState,
  decision: PolicyDecision,
): void {
  if (decision.kind !== 'weightAdjustment') {
    return;
  }

  const delta = decision.details?.weightDelta;
  if (delta === undefined) {
    return;
  }

  const { currentSet } = state;
  const { weightKg } = currentSet;
  if (weightKg === null) {
    return;
  }

  changeWeight(state, Math.max(0, weightKg + delta));
}

/**
 * 세션 생명주기 의도에 대한 결정을 만든다.
 *
 * 전이가 일어나지 않았다면 지금 상태에서 받을 수 없는 요청이므로, 결정을 내리는 대신
 * 그 사실을 회원에게 알린다 — 잘못된 시점의 발화는 오류가 아니라 대화 상황이다.
 *
 * @returns 생명주기 의도가 아니면 `null`
 */
function decideLifecycle(
  intent: Intent,
  before: SessionState,
  after: SessionState,
): PolicyDecision | null {
  const rejected = before === after;

  if (intent.kind === 'EndSession') {
    if (rejected) {
      return {
        kind: 'continue',
        reasoning: '지금은 세션을 종료할 수 없는 상태다',
        confidence: 1,
      };
    }

    return {
      kind: 'sessionEnd',
      reasoning:
        after === SessionState.Completed
          ? '세션을 완료한다'
          : '마무리 단계로 넘어간다',
      confidence: 1,
    };
  }

  if (intent.kind === 'PauseSession') {
    return rejected
      ? {
          kind: 'continue',
          reasoning: '지금은 일시 중지할 수 없는 상태다',
          confidence: 1,
        }
      : { kind: 'pause', reasoning: '세션을 일시 중지한다', confidence: 1 };
  }

  if (intent.kind === 'ResumeSession') {
    return {
      kind: 'continue',
      reasoning: rejected
        ? '일시 중지 상태가 아니라 재개할 것이 없다'
        : `${after}에서 세션을 재개한다`,
      confidence: 1,
    };
  }

  if (intent.kind === 'StartSession') {
    return {
      kind: 'continue',
      reasoning: rejected
        ? '이미 진행 중인 세션이다'
        : '세션을 시작하고 워밍업으로 넘어간다',
      confidence: 1,
    };
  }

  return null;
}

/**
 * 발화 한 건을 처리해 세계 상태와 세션 진행 상태를 갱신하고 결과를 반환한다.
 *
 * 세션 상태 전이는 의도로 한 번, 결정이 세션 종료면 한 번 더 적용된다 —
 * 통증 같은 비-생명주기 의도에서 나온 종료 결정도 실제로 집행되어야 한다.
 */
export async function processTurn(
  input: TurnInput,
  deps: TurnDeps,
): Promise<TurnResult> {
  const { sessionId, state, context, text } = input;
  const intent = await deps.intent.classify(normalizeUtterance(text));

  applyIntent(state, sessionId, intent);

  const afterIntent = applyTransition(context, intent.kind);
  const result = await runDecisionPipeline(state, {});
  const decision =
    decideLifecycle(intent, context.currentState, afterIntent.currentState) ??
    synthesizeDecision(intent, result.engineAction);

  applyDecision(state, decision);

  const nextContext =
    decision.kind === 'sessionEnd' && intent.kind !== 'EndSession'
      ? applyTransition(afterIntent, 'EndSession')
      : afterIntent;

  const message = await deps.expression.express({
    decision,
    persona: state.persona,
  });

  return {
    intent,
    engineAction: result.engineAction,
    decision,
    message,
    context: nextContext,
  };
}
