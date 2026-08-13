/**
 * decision-engine 스펙 — 규칙 체이닝(우선순위/단락)의 공개 인터페이스 검증.
 */
import { describe, expect, test } from 'bun:test';
import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';
import type { Rule } from './decision-engine.ts';
import { createDecisionEngine } from './decision-engine.ts';
import { decisionInput } from './test-input.ts';

function action(deltaKg: number): ProgressiveOverloadAction {
  return {
    scope: 'inSession',
    type: 'weightAdjustment',
    adjustment: {
      exerciseId: 'ex1',
      deltaKg,
      reason: 'test',
      confidence: 0.9,
    },
  };
}

/** 항상 같은 결과를 내는 규칙. 평가되었는지 여부를 기록한다. */
function fixedRule(
  name: string,
  result: ProgressiveOverloadAction | null,
  evaluated: string[],
): Rule {
  return {
    name,
    apply: () => {
      evaluated.push(name);
      return result;
    },
  };
}

describe('createDecisionEngine', () => {
  test('규칙이 매치하면 그 액션을 반환', () => {
    const engine = createDecisionEngine([fixedRule('only', action(-5), [])]);
    expect(engine.decide(decisionInput())).toEqual(action(-5));
  });

  test('어떤 규칙도 매치하지 않으면 null', () => {
    const engine = createDecisionEngine([
      fixedRule('a', null, []),
      fixedRule('b', null, []),
    ]);
    expect(engine.decide(decisionInput())).toBeNull();
  });

  test('규칙이 없으면 null', () => {
    expect(createDecisionEngine([]).decide(decisionInput())).toBeNull();
  });

  test('앞선 규칙이 매치하면 뒤 규칙은 평가하지 않음 (first-match)', () => {
    const evaluated: string[] = [];
    const engine = createDecisionEngine([
      fixedRule('deload', action(-5), evaluated),
      fixedRule('progression', action(2.5), evaluated),
    ]);

    expect(engine.decide(decisionInput())).toEqual(action(-5));
    expect(evaluated).toEqual(['deload']);
  });

  test('앞선 규칙이 통과하면 다음 규칙이 판정', () => {
    const evaluated: string[] = [];
    const engine = createDecisionEngine([
      fixedRule('deload', null, evaluated),
      fixedRule('progression', action(2.5), evaluated),
    ]);

    expect(engine.decide(decisionInput())).toEqual(action(2.5));
    expect(evaluated).toEqual(['deload', 'progression']);
  });
});
