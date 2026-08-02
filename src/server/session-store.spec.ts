/**
 * 세션 저장소 스펙 — get-or-create, 이벤트 버퍼/구독/재생/해제의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_CHAT_STATE } from '../cli/scenarios.ts';
import type { SessionEvent, SessionStore } from './session-store.ts';
import { createInMemorySessionStore } from './session-store.ts';

function makeStore(): SessionStore {
  return createInMemorySessionStore(DEFAULT_CHAT_STATE);
}

describe('createInMemorySessionStore', () => {
  test('미지의 id session() → 새 레코드 생성, 반복 호출 시 같은 인스턴스', () => {
    const store = makeStore();
    const first = store.session('nonexistent');
    const second = store.session('nonexistent');
    expect(second).toBe(first);
    expect(second.state.recentHistory).toHaveLength(0);
  });

  test('createSession() → 비어있지 않은 id, 같은 id 재호출 시 재사용', () => {
    const store = makeStore();
    const id = store.createSession();
    expect(id.length).toBeGreaterThan(0);
    expect(store.createSession(id)).toBe(id);
  });

  test('subscribe가 기존 버퍼를 먼저 재생', () => {
    const store = makeStore();
    const sessionId = store.createSession();
    const event: SessionEvent = {
      type: 'done',
      message: '안녕',
      sessionId,
    };
    store.pushEvent(sessionId, event);

    const received: SessionEvent[] = [];
    store.subscribe(sessionId, (e) => {
      received.push(e);
    });

    expect(received).toEqual([event]);
  });

  test('subscribe 후 pushEvent → 라이브 수신, unsub 후 → 수신 안 함', () => {
    const store = makeStore();
    const sessionId = store.createSession();
    const received: SessionEvent[] = [];
    const unsub = store.subscribe(sessionId, (e) => {
      received.push(e);
    });

    store.pushEvent(sessionId, { type: 'done', message: 'a', sessionId });
    unsub();
    store.pushEvent(sessionId, { type: 'done', message: 'b', sessionId });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ message: 'a' });
  });

  test('endSession 후 session(id) → 새 빈 레코드 (제거 확인)', () => {
    const store = makeStore();
    const sessionId = store.createSession();
    store.pushEvent(sessionId, { type: 'done', message: 'x', sessionId });
    store.endSession(sessionId);

    const recreated = store.session(sessionId);
    expect(recreated.events).toHaveLength(0);
    expect(recreated.state.recentHistory).toHaveLength(0);
  });
});
