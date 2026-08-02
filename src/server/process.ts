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
import type { SessionStore } from './session-store.ts';

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

      if (intent.kind === 'CompleteSet') {
        record.state.recentHistory.push({
          id: crypto.randomUUID(),
          sessionId,
          exerciseId: record.state.exerciseId,
          setNumber: record.state.recentHistory.length + 1,
          plannedReps: record.state.currentSet.reps,
          actualReps: record.state.currentSet.reps,
          rpe: 8,
          completed: true,
          performedAt: new Date(),
        });
      }

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
