/**
 * scenarios 스펙 — JSON 로딩/날짜 변환의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import { loadScenario } from './scenarios.ts';

describe('loadScenario', () => {
  test('high-rpe-deload 로드 → 이력/날짜 변환', async () => {
    const state = await loadScenario('high-rpe-deload');
    expect(state.recentHistory.length).toBe(3);
    expect(state.recentHistory[0]?.performedAt).toBeInstanceOf(Date);
    expect(state.program.startedAt).toBeInstanceOf(Date);
    expect(state.policy.recentHistory[0]?.date).toBeInstanceOf(Date);
  });

  test('없는 시나리오 → throw', async () => {
    let error: unknown = null;
    try {
      await loadScenario('does-not-exist');
    } catch (err) {
      error = err;
    }
    expect(String(error)).toContain('시나리오를 찾을 수 없습니다');
  });
});
