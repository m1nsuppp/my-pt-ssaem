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
import { createRpeProgressionRule } from '../engine/rules/rpe-progression.ts';
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
  const { rule } = state;

  // 순서가 곧 우선순위 — 부하를 줄이는 판정을 먼저 검토한다.
  return createDecisionEngine([
    createRpeDeloadRule({
      thresholdRpe: rule.thresholdRpe,
      consecutiveSets: rule.consecutiveSets,
      deltaKg: rule.deltaKg,
      confidence: rule.confidence,
    }),
    createRpeProgressionRule({
      ...(rule.progressionCeilingRpe === undefined
        ? {}
        : { ceilingRpe: rule.progressionCeilingRpe }),
      ...(rule.progressionConsecutiveSets === undefined
        ? {}
        : { consecutiveSets: rule.progressionConsecutiveSets }),
      ...(rule.progressionDeltaKg === undefined
        ? {}
        : { deltaKg: rule.progressionDeltaKg }),
      ...(rule.progressionConfidence === undefined
        ? {}
        : { confidence: rule.progressionConfidence }),
    }),
  ]);
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

/** 통증 강도 미보고 — 분류기가 강도를 확인하지 못한 경우. */
const PAIN_LEVEL_UNREPORTED = 0;
/** 통증 강도 구간 — 이 값 이상이면 세션 중단을 권고한다. */
const PAIN_LEVEL_STOP = 7;
/** 통증 강도 구간 — 이 값 이상이면 운동 교체를 제안한다. */
const PAIN_LEVEL_SWAP = 4;

/**
 * 통증 보고에 대한 3단계 대응을 결정한다.
 *
 * 강도 7~10 → 세션 중단 권고, 4~6 → 운동 교체 제안, 1~3 → 경고 후 진행.
 * 강도를 모르면 되묻는다 — 값을 지어내 대응 수준을 정하지 않는다.
 * 신체 부하를 지시하는 결정이므로 LLM 추론이 아니라 고정 규칙으로 산출한다.
 */
function decidePainResponse(areas: string[], level: number): PolicyDecision {
  const where = areas.length === 0 ? '통증' : `${areas.join(', ')} 통증`;

  if (level <= PAIN_LEVEL_UNREPORTED) {
    return {
      kind: 'continue',
      reasoning: `${where} 보고, 강도 미확인 — 강도를 되물어 대응 수준을 정한다`,
      confidence: 1,
    };
  }

  if (level >= PAIN_LEVEL_STOP) {
    return {
      kind: 'sessionEnd',
      reasoning: `${where} 강도 ${level} — 부상 위험이 높아 세션을 중단한다`,
      confidence: 1,
    };
  }

  if (level >= PAIN_LEVEL_SWAP) {
    return {
      kind: 'exerciseSwap',
      reasoning: `${where} 강도 ${level} — 해당 부위를 피하는 운동으로 교체를 제안한다`,
      confidence: 1,
    };
  }

  return {
    kind: 'continue',
    reasoning: `${where} 강도 ${level} — 경고 후 진행하되 악화 시 즉시 보고하도록 안내한다`,
    confidence: 1,
  };
}

/**
 * 사용자 의도 + 엔진 액션으로 결정적 PolicyDecision을 합성한다.
 *
 * chat용 — 의도 분류 결과를 정책 LLM 없이 결정으로 변환한다.
 * 통증 보고가 최우선, 그다음 엔진 액션, 나머지는 continue.
 */
export function synthesizeDecision(
  intent: Intent,
  engineAction: ProgressiveOverloadAction | null,
): PolicyDecision {
  if (intent.kind === 'ReportPain') {
    return decidePainResponse(intent.areas, intent.level);
  }

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
