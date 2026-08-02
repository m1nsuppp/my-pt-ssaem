/**
 * 세션 저장소 — 인메모리 세션 레코드 + SSE 이벤트 버퍼/구독.
 *
 * 세션은 프로세스 수명 동안 유지된다. 클라이언트가 임의 id로 lazy 생성할 수 있고,
 * 발화 처리 중 발생한 이벤트를 버퍼에 쌓고 활성 구독자에게 즉시 전달한다.
 */
import type { ScenarioState } from '../cli/scenarios.ts';
import type { Intent } from '../domain/intent.ts';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { PolicyDecision } from '../llm/policy.ts';

/** SSE 스트림의 페이로드이자 저장소 버퍼의 항목. */
export type SessionEvent =
  | { type: 'session_started'; sessionId: string }
  | { type: 'intent'; intent: Intent }
  | { type: 'engine_action'; action: ProgressiveOverloadAction | null }
  | { type: 'decision'; decision: PolicyDecision }
  | { type: 'message'; delta: string }
  | { type: 'done'; message: string; sessionId: string }
  | { type: 'session_end'; sessionId: string };

export interface SessionRecord {
  id: string;
  state: ScenarioState;
  events: SessionEvent[];
}

export interface SessionStore {
  /** 없으면 생성, 있으면 존재하는 id 반환. id 미지정 시 crypto.randomUUID() 생성. */
  createSession: (id?: string) => string;
  /** get-or-create — 미지의 id라도 상태를 기본값으로 새로 만들어 반환. */
  session: (id: string) => SessionRecord;
  /** 버퍼에 추가 후 활성 구독자에게 즉시 전달. */
  pushEvent: (id: string, event: SessionEvent) => void;
  /** 버퍼 전체를 먼저 재생한 뒤 새 이벤트를 실시간 전달. 해제 함수 반환. */
  subscribe: (id: string, onEvent: (event: SessionEvent) => void) => () => void;
  /** session_end 이벤트 방출 후 세션 제거. */
  endSession: (id: string) => void;
}

export function createInMemorySessionStore(
  initialState: ScenarioState,
): SessionStore {
  const records = new Map<string, SessionRecord>();
  const subscribers = new Map<string, Set<(e: SessionEvent) => void>>();

  function ensure(id: string): SessionRecord {
    let record = records.get(id);
    if (record === undefined) {
      record = { id, state: structuredClone(initialState), events: [] };
      records.set(id, record);
    }
    return record;
  }

  return {
    createSession(id?: string): string {
      const sessionId = id ?? crypto.randomUUID();
      ensure(sessionId);
      return sessionId;
    },
    session(id: string): SessionRecord {
      return ensure(id);
    },
    pushEvent(id: string, event: SessionEvent): void {
      const record = records.get(id);
      if (record === undefined) return;
      record.events.push(event);

      const set = subscribers.get(id);
      if (set === undefined) return;
      for (const onEvent of set) {
        try {
          onEvent(event);
        } catch {
          // 닫힌 스트림에서 던져도 프로세스를 죽이지 않는다.
        }
      }
    },
    subscribe(id: string, onEvent: (event: SessionEvent) => void): () => void {
      const record = records.get(id);
      if (record !== undefined) {
        for (const event of record.events) onEvent(event);
      }

      let set = subscribers.get(id);
      if (set === undefined) {
        set = new Set();
        subscribers.set(id, set);
      }
      set.add(onEvent);
      return () => {
        subscribers.get(id)?.delete(onEvent);
      };
    },
    endSession(id: string): void {
      this.pushEvent(id, { type: 'session_end', sessionId: id });
      records.delete(id);
      subscribers.delete(id);
    },
  };
}
