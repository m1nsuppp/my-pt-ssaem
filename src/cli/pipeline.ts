/**
 * 결정 파이프라인 — 엔진 + 정책 + 표현을 조립하고 NDJSON 이벤트를 방출한다.
 *
 * 순수 함수(단위 테스트 가능)로, DOM/I/O 없이 입력 상태를 소비해
 * 시나리오 → 엔진 액션 → (선택) 정책 결정 → 메시지 → 결과 이벤트를 발생시킨다.
 */

import type { Intent } from '../domain/intent.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { DecisionEngine } from '../engine/decision-engine.ts';
import { createDecisionEngine } from '../engine/decision-engine.ts';
import { createRpeDeloadRule } from '../engine/rules/rpe-deload.ts';
import type { ExpressionLLM } from '../llm/expression.ts';
import type { PolicyDecision, PolicyLLM } from '../llm/policy.ts';
import { formatEngineAction } from './format.ts';
import type { ScenarioState } from './scenarios.ts';

/** 파이프라인이 방출하는 이벤트 */
export type PipelineEvent =
  | { type: 'scenario'; name: string }
  | { type: 'engine_action'; action: ProgressiveOverloadAction | null }
  | { type: 'policy_decision'; decision: PolicyDecision }
  | { type: 'message'; text: string }
  | {
      type: 'result';
      scenarioName: string;
      engineAction: ProgressiveOverloadAction | null;
      policyDecision: PolicyDecision | undefined;
      message: string;
    };

/** 파이프라인 최종 결과 */
export interface PipelineResult {
  scenarioName: string;
  engineAction: ProgressiveOverloadAction | null;
  policyDecision?: PolicyDecision;
  message: string;
}

/** 실행 옵션 — 정책/표현 LLM을 주입한다. */
export interface RunOptions {
  policy?: PolicyLLM;
  expression?: ExpressionLLM;
}

/**
 * 결정 파이프라인을 실행한다.
 *
 * 1. RPE 디로드 규칙 + 결정 엔진 구성
 * 2. 엔진이 최근 세트 이력을 보고 액션 판정
 * 3. 정책 LLM이 주입되면 세션 방향 결정
 * 4. 표현 LLM + 정책 결정이 있으면 페르소나 발화, 아니면 결정적 포매터 사용
 */
function buildEngine(state: ScenarioState): DecisionEngine {
  const rule = createRpeDeloadRule({
    exerciseId: state.exerciseId,
    thresholdRpe: state.rule.thresholdRpe,
    consecutiveSets: state.rule.consecutiveSets,
    deltaKg: state.rule.deltaKg,
    confidence: state.rule.confidence,
  });
  return createDecisionEngine(rule);
}

async function buildMessage(
  opts: RunOptions,
  state: ScenarioState,
  policyDecision: PolicyDecision | undefined,
  engineAction: ProgressiveOverloadAction | null,
): Promise<string> {
  if (opts.expression !== undefined && policyDecision !== undefined) {
    return await opts.expression.express({
      decision: policyDecision,
      persona: state.persona,
    });
  }
  return formatEngineAction(engineAction);
}

function decideAction(state: ScenarioState): ProgressiveOverloadAction | null {
  return buildEngine(state).decide({
    program: state.program,
    exerciseId: state.exerciseId,
    recentHistory: state.recentHistory,
    currentSet: state.currentSet,
  });
}

export async function runDecisionPipeline(
  state: ScenarioState,
  opts: RunOptions,
  onEvent?: (event: PipelineEvent) => void,
): Promise<PipelineResult> {
  const engineAction = decideAction(state);
  const policyDecision =
    opts.policy === undefined
      ? undefined
      : await opts.policy.decide(state.policy);

  onEvent?.({ type: 'scenario', name: state.name });
  onEvent?.({ type: 'engine_action', action: engineAction });
  if (policyDecision !== undefined) {
    onEvent?.({ type: 'policy_decision', decision: policyDecision });
  }

  const message = await buildMessage(opts, state, policyDecision, engineAction);

  onEvent?.({ type: 'message', text: message });
  onEvent?.({
    type: 'result',
    scenarioName: state.name,
    engineAction,
    policyDecision,
    message,
  });

  return {
    scenarioName: state.name,
    engineAction,
    ...(policyDecision === undefined ? {} : { policyDecision }),
    message,
  };
}

/**
 * 사용자 의도 + 엔진 액션으로 결정적 PolicyDecision을 합성한다.
 *
 * chat용 — 의도 분류 결과를 정책 LLM 없이 결정으로 변환한다.
 * CompleteSet + 조정 없음 → continue, 엔진 액션이 있으면 weightAdjustment.
 */
export function synthesizeDecision(
  intent: Intent,
  engineAction: ProgressiveOverloadAction | null,
): PolicyDecision {
  if (engineAction !== null && 'adjustment' in engineAction) {
    return {
      kind: 'weightAdjustment',
      reasoning: engineAction.adjustment.reason,
      confidence: engineAction.adjustment.confidence,
      details: { weightDelta: engineAction.adjustment.deltaKg },
    };
  }

  if (intent.kind === 'CompleteSet') {
    return {
      kind: 'continue',
      reasoning: '세트 완료 인지, 부하 조정은 없음',
      confidence: 0.9,
    };
  }

  return {
    kind: 'continue',
    reasoning: '부하 조정 없음',
    confidence: 0.9,
  };
}
