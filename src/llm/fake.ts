/**
 * LLM 계층의 Fake 구현체.
 *
 * AGENTS.md 원칙: mock/stub 대신 fake 구현을 선호한다.
 * - 결정적(deterministic) 응답 반환
 * - 테스트에서 설정 가능한 규칙 기반 로직
 * - 실제 LLM 호출 없이 PolicyLLM / ExpressionLLM 의존 코드 검증 가능
 */

import type { PolicyLLM, PolicyContext, PolicyDecision } from './policy.ts';
import type { ExpressionLLM, ExpressionInput } from './expression.ts';

// ---------------------------------------------------------------------------
// createFakePolicyLLM
// ---------------------------------------------------------------------------

/** Fake PolicyLLM의 결정 규칙 — 입력 조건과 매칭되어 결정을 반환 */
export interface FakePolicyRule {
  /** 이 규칙이 적용될 조건 (모든 조건이 truthy면 매칭) */
  when: {
    maxFatigue?: number;
    minFatigue?: number;
    maxPainLevel?: number;
    minPainLevel?: number;
    minStagnationCount?: number;
    maxStagnationCount?: number;
    minDaysSinceLastRest?: number;
    maxDaysSinceLastRest?: number;
  };
  /** 매칭 시 반환할 결정 */
  then: PolicyDecision;
}

/** createFakePolicyLLM 생성 옵션 */
export interface FakePolicyLLMOptions {
  rules?: FakePolicyRule[];
  defaultDecision?: PolicyDecision;
}

function matches(context: PolicyContext, when: FakePolicyRule['when']): boolean {
  const c = context.condition;
  const t = context.trends;

  if (when.maxFatigue !== undefined && c.fatigue > when.maxFatigue) return false;
  if (when.minFatigue !== undefined && c.fatigue < when.minFatigue) return false;
  if (when.maxPainLevel !== undefined && c.painLevel > when.maxPainLevel) return false;
  if (when.minPainLevel !== undefined && c.painLevel < when.minPainLevel) return false;
  if (when.minStagnationCount !== undefined && t.stagnationCount < when.minStagnationCount) return false;
  if (when.maxStagnationCount !== undefined && t.stagnationCount > when.maxStagnationCount) return false;
  if (when.minDaysSinceLastRest !== undefined && t.daysSinceLastRest < when.minDaysSinceLastRest) return false;
  if (when.maxDaysSinceLastRest !== undefined && t.daysSinceLastRest > when.maxDaysSinceLastRest) return false;

  return true;
}

/**
 * Fake PolicyLLM을 생성한다.
 *
 * 규칙 기반으로 결정을 반환하며, 실제 LLM 호출 없이 테스트 가능.
 * 사용 예:
 * ```
 * const llm = createFakePolicyLLM();
 * const decision = await llm.decide(context);
 * expect(decision.kind).toBe('continue');
 * ```
 */
export function createFakePolicyLLM(options?: FakePolicyLLMOptions): PolicyLLM {
  const rules = options?.rules ?? [];
  const defaultDecision = options?.defaultDecision ?? {
    kind: 'continue' as const,
    reasoning: 'Fake: 모든 조건이 정상 범위입니다.',
    confidence: 0.9,
  };

  return {
    async decide(context: PolicyContext): Promise<PolicyDecision> {
      for (const rule of rules) {
        if (matches(context, rule.when)) {
          const { details, ...rest } = rule.then;
          return {
            ...rest,
            ...(details !== undefined ? { details } : {}),
          };
        }
      }

      return defaultDecision;
    },
  };
}

// ---------------------------------------------------------------------------
// createFakeExpressionLLM
// ---------------------------------------------------------------------------

/** createFakeExpressionLLM 생성 옵션 */
export interface FakeExpressionLLMOptions {
  /** 고정 응답 템플릿 ({{kind}} 같은 플레이스홀더 지원) */
  template?: string;
  /** 항상 이 응답을 반환 (template보다 우선) */
  fixedResponse?: string | undefined;
}

/**
 * Fake ExpressionLLM을 생성한다.
 *
 * 결정 정보를 템플릿에 채워 반환하거나, 고정 응답을 반환.
 * 실제 LLM 호출 없이 ExpressionLLM 의존 코드 검증 가능.
 */
export function createFakeExpressionLLM(options?: FakeExpressionLLMOptions): ExpressionLLM {
  const template = options?.template ?? '[{{kind}}] {{reasoning}}';
  const fixedResponse = options?.fixedResponse;

  return {
    async express(input: ExpressionInput): Promise<string> {
      if (fixedResponse !== undefined) {
        return fixedResponse;
      }

      const d = input.decision;
      const replacements: Record<string, string> = {
        kind: d.kind,
        reasoning: d.reasoning,
        confidence: String(d.confidence),
        weightDelta: String(d.details?.weightDelta ?? ''),
        suggestedExercise: d.details?.suggestedExercise ?? '',
        personaName: input.persona.name,
        personaTone: input.persona.tone,
      };

      let result = template;
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replaceAll(`{{${key}}}`, value);
      }

      return result;
    },
  };
}