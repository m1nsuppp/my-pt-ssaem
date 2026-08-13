/**
 * LLM 계층의 Fake 구현체.
 *
 * AGENTS.md 원칙: mock/stub 대신 fake 구현을 선호한다.
 * - 결정적(deterministic) 응답 반환
 * - 테스트에서 설정 가능한 규칙 기반 로직
 * - 실제 LLM 호출 없이 PolicyLLM / ExpressionLLM 의존 코드 검증 가능
 */

import type { Intent, NormalizedUtterance } from '../domain/intent.ts';
import type { ExpressionInput, ExpressionLLM } from './expression.ts';
import type { IntentClassifier } from './intent.ts';
import type { PolicyContext, PolicyDecision, PolicyLLM } from './policy.ts';

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

const DEFAULT_FAKE_CONFIDENCE = 0.9;

function isWithinRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) {
    return false;
  }
  if (max !== undefined && value > max) {
    return false;
  }

  return true;
}

function matches(
  context: PolicyContext,
  when: FakePolicyRule['when'],
): boolean {
  const { condition, trends } = context;
  const { fatigue, painLevel } = condition;
  const { stagnationCount, daysSinceLastRest } = trends;

  return (
    isWithinRange(fatigue, when.minFatigue, when.maxFatigue) &&
    isWithinRange(painLevel, when.minPainLevel, when.maxPainLevel) &&
    isWithinRange(
      stagnationCount,
      when.minStagnationCount,
      when.maxStagnationCount,
    ) &&
    isWithinRange(
      daysSinceLastRest,
      when.minDaysSinceLastRest,
      when.maxDaysSinceLastRest,
    )
  );
}

function stripUndefinedDetails(decision: PolicyDecision): PolicyDecision {
  const { details, ...rest } = decision;
  if (details === undefined) {
    return rest;
  }

  return { ...rest, details };
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
    confidence: DEFAULT_FAKE_CONFIDENCE,
  };

  return {
    async decide(context: PolicyContext): Promise<PolicyDecision> {
      const matched = rules.find((rule) => matches(context, rule.when));
      const result =
        matched === undefined
          ? defaultDecision
          : stripUndefinedDetails(matched.then);

      return await Promise.resolve(result);
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

const DEFAULT_TEMPLATE = '[{{kind}}] {{reasoning}}';

function fillTemplate(template: string, input: ExpressionInput): string {
  const { decision, persona } = input;
  const replacements: Record<string, string> = {
    kind: decision.kind,
    reasoning: decision.reasoning,
    confidence: String(decision.confidence),
    weightDelta: String(decision.details?.weightDelta ?? ''),
    suggestedExercise: decision.details?.suggestedExercise ?? '',
    personaName: persona.name,
    personaTone: persona.tone,
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

/**
 * Fake ExpressionLLM을 생성한다.
 *
 * 결정 정보를 템플릿에 채워 반환하거나, 고정 응답을 반환.
 * 실제 LLM 호출 없이 ExpressionLLM 의존 코드 검증 가능.
 */
export function createFakeExpressionLLM(
  options?: FakeExpressionLLMOptions,
): ExpressionLLM {
  const template = options?.template ?? DEFAULT_TEMPLATE;
  const fixedResponse = options?.fixedResponse;

  return {
    async express(input: ExpressionInput): Promise<string> {
      const result = fixedResponse ?? fillTemplate(template, input);

      return await Promise.resolve(result);
    },
  };
}

// ---------------------------------------------------------------------------
// createFakeIntentClassifier
// ---------------------------------------------------------------------------

/**
 * Fake IntentClassifier를 생성한다.
 *
 * 키워드→Intent 결정적 매핑(첫 매칭 우선, 대소문자 무시):
 *
 * | 키워드 포함                        | Intent                |
 * |------------------------------------|-----------------------|
 * | 시작 / start                       | StartSession          |
 * | 끝났 / 완료 / 했어 / 했다          | CompleteSet           |
 * | 늘려 / 증가 / 올려                 | IncreaseLoad          |
 * | 줄여 / 감소 / 내려                 | DecreaseLoad          |
 * | 무게 <숫자>[kg]                    | SetLoadTo{valueKg}    |
 * | rpe <숫자>                         | ReportRPE{rpe}        |
 * | 종료 / end                         | EndSession            |
 * | (기본)                             | AskQuestion           |
 *
 * 실제 LLM 호출 없이 IntentClassifier 의존 코드 검증 가능.
 */
const WEIGHT_PATTERN = /무게\s*(?<weight>\d+)\s*(?:kg)?/iv;
const RPE_PATTERN = /rpe\s*(?<rpe>\d+)/iv;
const PAIN_PATTERN = /(?:통증|아파|아픔|아픈)/iv;
const PAIN_LEVEL_PATTERN = /(?<level>\d+)/v;
const BODY_PARTS = [
  '무릎',
  '어깨',
  '허리',
  '손목',
  '팔꿈치',
  '발목',
  '목',
] as const;

function containsAny(lower: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => lower.includes(keyword));
}

function matchKeywordIntent(lower: string): Intent | null {
  if (containsAny(lower, ['시작', 'start'])) {
    return { kind: 'StartSession' };
  }
  if (containsAny(lower, ['끝났', '완료', '했어', '했다'])) {
    return { kind: 'CompleteSet' };
  }
  if (containsAny(lower, ['늘려', '증가', '올려'])) {
    return { kind: 'IncreaseLoad' };
  }
  if (containsAny(lower, ['줄여', '감소', '내려'])) {
    return { kind: 'DecreaseLoad' };
  }
  if (containsAny(lower, ['종료', 'end'])) {
    return { kind: 'EndSession' };
  }
  if (containsAny(lower, ['잠깐', '멈춰', '일시정지', 'pause'])) {
    return { kind: 'PauseSession' };
  }
  if (containsAny(lower, ['재개', '다시 하자', 'resume'])) {
    return { kind: 'ResumeSession' };
  }

  return null;
}

function matchNumberIntent(lower: string): Intent | null {
  const weightMatch = WEIGHT_PATTERN.exec(lower);
  if (weightMatch !== null) {
    return {
      kind: 'SetLoadTo',
      valueKg: Number(weightMatch.groups?.weight ?? 0),
    };
  }

  const rpeMatch = RPE_PATTERN.exec(lower);
  if (rpeMatch !== null) {
    return { kind: 'ReportRPE', rpe: Number(rpeMatch.groups?.rpe ?? 0) };
  }

  return null;
}

/**
 * 통증 보고를 매칭한다. 강도를 언급하지 않으면 `level: 0`(미보고)으로 둔다 —
 * 값을 지어내지 않고, 되묻기는 결정 계층의 몫이다.
 */
function matchPainIntent(lower: string): Intent | null {
  if (!PAIN_PATTERN.test(lower)) {
    return null;
  }

  const levelMatch = PAIN_LEVEL_PATTERN.exec(lower);

  return {
    kind: 'ReportPain',
    areas: BODY_PARTS.filter((part) => lower.includes(part)),
    level: Number(levelMatch?.groups?.level ?? 0),
  };
}

function matchIntent(utterance: NormalizedUtterance): Intent {
  const lower = utterance.text.toLowerCase();
  // 통증은 안전 의도라 다른 키워드보다 먼저 본다 ("어깨 아파서 못 했어" 같은 복합 발화).
  const painIntent = matchPainIntent(lower);
  if (painIntent !== null) {
    return painIntent;
  }
  const keywordIntent = matchKeywordIntent(lower);
  if (keywordIntent !== null) {
    return keywordIntent;
  }
  const numberIntent = matchNumberIntent(lower);
  if (numberIntent !== null) {
    return numberIntent;
  }

  return { kind: 'AskQuestion', text: utterance.text };
}

export function createFakeIntentClassifier(): IntentClassifier {
  return {
    async classify(utterance: NormalizedUtterance): Promise<Intent> {
      return await Promise.resolve(matchIntent(utterance));
    },
  };
}
