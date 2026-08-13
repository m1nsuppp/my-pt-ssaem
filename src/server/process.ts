/**
 * 서버 브레인 — 턴 코어를 세션 저장소·SSE 이벤트와 연결한다.
 *
 * 처리 흐름 자체는 `session/turn.ts`가 갖고 있고, 여기서는 세션을 찾아 코어에 넘기고
 * 결과를 이벤트로 흘리는 일만 한다.
 */

import type { Intent } from '../domain/intent.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { PolicyDecision } from '../llm/policy.ts';
import type { TurnDeps } from '../session/turn.ts';
import { processTurn } from '../session/turn.ts';
import type { SessionStore } from './session-store.ts';

export type ProcessDeps = TurnDeps;

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
  if (current !== '') {
    chunks.push(current);
  }

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
      const turn = await processTurn(
        { sessionId, state: record.state, context: record.context, text },
        deps,
      );
      const { intent, engineAction, decision, message, context } = turn;

      store.updateContext(sessionId, context);

      store.pushEvent(sessionId, { type: 'intent', intent });
      store.pushEvent(sessionId, {
        type: 'engine_action',
        action: engineAction,
      });
      store.pushEvent(sessionId, { type: 'decision', decision });
      store.pushEvent(sessionId, {
        type: 'state',
        state: context.currentState,
      });
      for (const delta of chunkMessage(message)) {
        store.pushEvent(sessionId, { type: 'message', delta });
      }
      store.pushEvent(sessionId, { type: 'done', message, sessionId });

      return { sessionId, intent, engineAction, decision, message };
    },
  };
}
