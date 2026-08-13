/**
 * 발화 처리 브레인 — 세션 단위로 의도 분류 → 결정 → 표현 흐름을 재현한다.
 *
 * CLI `runChat`의 순서(classify → runDecisionPipeline → synthesizeDecision → express)를
 * 세션 상태 저장소와 결합해 HTTP 요청마다 재실행한다.
 */

import { runDecisionPipeline, synthesizeDecision } from '../cli/pipeline.ts';
import type { Intent } from '../domain/intent.ts';
import { normalizeUtterance } from '../domain/intent.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { ExpressionLLM } from '../llm/expression.ts';
import type { IntentClassifier } from '../llm/intent.ts';
import type { PolicyDecision } from '../llm/policy.ts';
import type { SessionRecord, SessionStore } from './session-store.ts';

export interface ProcessDeps {
  intent: IntentClassifier;
  expression: ExpressionLLM;
}

export interface ProcessedResult {
  sessionId: string;
  intent: Intent;
  engineAction: ProgressiveOverloadAction | null;
  decision: PolicyDecision;
  message: string;
}

export interface ServerBrain {
  processUtterance: (
    sessionId: string,
    text: string,
  ) => Promise<ProcessedResult>;
}

/** 청크당 최대 글자 수 */
const MAX_CHUNK_LENGTH = 30;

/** Array.at()으로 마지막 요소를 가리키는 인덱스 */
const LAST_INDEX = -1;

/**
 * 표현 결과를 단어 기준 최대 30자씩 끊어 청크 배열로 반환한다.
 * 공백은 유지하고 빈 청크는 제외한다. 결정적이며 여러 단어면 2개 이상 청크를 보장한다.
 * 청크 경계의 공백은 이전 청크에 남겨 `join('')`으로 원문을 재구성한다.
 */
export function chunkMessage(message: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of message.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length > MAX_CHUNK_LENGTH && current !== '') {
      chunks.push(`${current} `);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== '') chunks.push(current);
  return chunks;
}

/**
 * 의도를 세션의 세계 상태에 반영한다.
 *
 * `CompleteSet`은 RPE를 모르는 채로 기록한다 — 회원이 보고하기 전까지 `undefined`.
 * `ReportRPE`는 직전 세트에 실제 값을 채운다. 채울 세트가 없으면(세트 완료 전 보고)
 * 기록할 곳이 없으므로 상태를 바꾸지 않는다.
 */
function applyIntent(record: SessionRecord, intent: Intent): void {
  const { state } = record;

  if (intent.kind === 'CompleteSet') {
    state.recentHistory.push({
      id: crypto.randomUUID(),
      sessionId: record.id,
      exerciseId: state.exerciseId,
      setNumber: state.recentHistory.length + 1,
      plannedReps: state.currentSet.reps,
      // 실제 수행 반복은 CompleteSet에 파라미터가 없어 계획치로 둔다.
      actualReps: state.currentSet.reps,
      completed: true,
      performedAt: new Date(),
    });
    return;
  }

  if (intent.kind === 'ReportRPE') {
    const lastSet = state.recentHistory.at(LAST_INDEX);
    if (lastSet === undefined) return;
    const { rpe } = intent;
    lastSet.rpe = rpe;
  }
}

export function createServerBrain(
  deps: ProcessDeps,
  store: SessionStore,
): ServerBrain {
  return {
    async processUtterance(
      sessionId: string,
      text: string,
    ): Promise<ProcessedResult> {
      const record = store.session(sessionId);
      const intent = await deps.intent.classify(normalizeUtterance(text));

      applyIntent(record, intent);

      const result = await runDecisionPipeline(record.state, {});
      const decision = synthesizeDecision(intent, result.engineAction);
      const message = await deps.expression.express({
        decision,
        persona: record.state.persona,
      });

      store.pushEvent(sessionId, { type: 'intent', intent });
      store.pushEvent(sessionId, {
        type: 'engine_action',
        action: result.engineAction,
      });
      store.pushEvent(sessionId, { type: 'decision', decision });
      for (const delta of chunkMessage(message)) {
        store.pushEvent(sessionId, { type: 'message', delta });
      }
      store.pushEvent(sessionId, { type: 'done', message, sessionId });

      return {
        sessionId,
        intent,
        engineAction: result.engineAction,
        decision,
        message,
      };
    },
  };
}
