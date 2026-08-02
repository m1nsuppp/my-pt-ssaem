/**
 * OpenRouter LLM 구현체.
 *
 * @openrouter/agent와 @openrouter/sdk를 래핑하여 도메인 계층에서 직접 import하지 않도록 한다.
 * 모델 변경, temperature, maxCost 등은 이 레이어 내부에 캡슐화한다.
 */

import { callModel, maxCost, OpenRouter } from '@openrouter/agent';
import { z } from 'zod';
import type { Intent, NormalizedUtterance } from '../../domain/intent.ts';
import type { ExpressionInput, ExpressionLLM } from '../expression.ts';
import type { IntentClassifier } from '../intent.ts';
import type {
  PolicyContext,
  PolicyDecision,
  PolicyDecisionDetails,
  PolicyLLM,
} from '../policy.ts';

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

/** OpenRouter LLM 호출에 필요한 설정 */
export interface OpenRouterLLMConfig {
  /** OpenRouter SDK 인스턴스 */
  client: OpenRouter;
  /** 사용할 모델 ID (예: "openai/gpt-4o") */
  model: string;
  /** temperature (0.0 ~ 2.0, 기본값 0.7) */
  temperature?: number;
  /** 최대 토큰 수 */
  maxTokens?: number;
  /** 최대 비용 (USD) — 이 비용을 초과하면 호출 중단 */
  maxCost?: number;
}

const DEFAULT_POLICY_TEMPERATURE = 0.7;
const DEFAULT_POLICY_MAX_TOKENS = 500;
const DEFAULT_EXPRESS_TEMPERATURE = 0.8;
const DEFAULT_EXPRESS_MAX_TOKENS = 300;
const DEFAULT_INTENT_TEMPERATURE = 0;
const DEFAULT_INTENT_MAX_TOKENS = 120;
const FALLBACK_CONFIDENCE = 0.3;
const FALLBACK_CONFIDENCE_PARSED = 0.5;
const PERCENT_MULTIPLIER = 100;
const RPE_SCALE_MAX = 10;
const DATE_STRING_LENGTH = 10;
const DISPLAY_OFFSET = 1;
const REGEX_FULL_MATCH_INDEX = 0;
const STRING_START_INDEX = 0;
const POSITIVE_COMPARISON = 0;
const MINIMUM_LENGTH = 1;

const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/v;

const DECISION_SYSTEM_PROMPT = [
  '당신은 전문 운동 트레이너입니다. 회원의 컨디션, 운동 이력, 추세를 분석하여',
  '이번 세션의 방향을 결정해야 합니다.',
  '',
  '다음 중 하나를 결정하세요:',
  '- deload: 회원이 과도한 피로/정체 상태 → 부하 감량 주기',
  '- exerciseSwap: 특정 운동이 정체 또는 통증 유발 → 운동 교체',
  '- weightAdjustment: 무게 증감이 필요함',
  '- continue: 현재 계획을 그대로 유지',
  '- sessionEnd: 세션 종료 (부상 위험, 극심한 피로)',
  '- pause: 세션 일시 중지',
  '',
  'JSON 형식으로 응답하세요:',
  '{',
  '  "kind": "deload" | "exerciseSwap" | "weightAdjustment" | "continue" | "sessionEnd" | "pause",',
  '  "reasoning": "한국어로 결정 이유를 설명",',
  '  "confidence": 0.0 ~ 1.0,',
  '  "details": {',
  '    "suggestedExercise": "교체할 운동 이름 (exerciseSwap인 경우)",',
  '    "weightDelta": -5 (weightAdjustment인 경우, kg 단위),',
  '    "deloadWeeks": 1 (deload인 경우),',
  '    "pauseMinutes": 5 (pause인 경우)',
  '  }',
  '}',
].join('\n');

const OPENROUTER_INTENT_SYSTEM_PROMPT = [
  '발화를 분류해 JSON으로 반환하라.',
  'kind는 [startSession|completeSet|increaseLoad|decreaseLoad|setLoadTo|reportRPE|endSession|askQuestion] 중 하나.',
  '',
  'setLoadTo인 경우 valueKg(kg)을, reportRPE인 경우 rpe(1~10)를 포함하라.',
  'JSON 형식:',
  '{ "kind": "setLoadTo", "valueKg": 100 }',
  '{ "kind": "reportRPE", "rpe": 8 }',
].join('\n');

const CONTINUE_DECISION: PolicyDecision = {
  kind: 'continue',
  reasoning: 'LLM 응답을 파싱할 수 없어 기본값(continue)을 반환합니다.',
  confidence: FALLBACK_CONFIDENCE,
};

// ---------------------------------------------------------------------------
// 도우미
// ---------------------------------------------------------------------------

function hasPositiveLength(array: unknown[]): boolean {
  return array.length >= MINIMUM_LENGTH;
}

// ---------------------------------------------------------------------------
// createOpenRouterPolicyLLM
// ---------------------------------------------------------------------------

function buildConditionLines(context: PolicyContext): string[] {
  const { condition } = context;
  const painAreas = hasPositiveLength(condition.painAreas)
    ? condition.painAreas.join(', ')
    : '없음';
  const lines: string[] = [
    '## 컨디션',
    `- 수면: ${condition.sleepHours}시간`,
    `- 피로도: ${condition.fatigue}/${RPE_SCALE_MAX}`,
    `- 통증 부위: ${painAreas}`,
    `- 통증 강도: ${condition.painLevel}/${RPE_SCALE_MAX}`,
    `- 영양: ${condition.nutrition}`,
  ];
  if (condition.notes !== undefined) {
    lines.push(`- 메모: ${condition.notes}`);
  }
  return lines;
}

function buildHistoryLines(context: PolicyContext): string[] {
  return context.recentHistory.map((s, i) => {
    const dateStr = s.date
      .toISOString()
      .slice(STRING_START_INDEX, DATE_STRING_LENGTH);
    const completionPct = Math.round(s.completionRate * PERCENT_MULTIPLIER);
    return [
      `[세션 ${i + DISPLAY_OFFSET}] ${dateStr}`,
      `  RPE: ${s.averageRPE}/${RPE_SCALE_MAX}, 볼륨: ${s.totalVolume}kg, 완료율: ${completionPct}%`,
      `  종료: ${s.endReason}`,
    ].join('\n');
  });
}

function buildTrendLines(context: PolicyContext): string[] {
  const { trends } = context;
  const fatiguePct = Math.round(trends.accumulatedFatigue * PERCENT_MULTIPLIER);
  return [
    '## 추세',
    `- 볼륨 추세: ${trends.volumeTrend}`,
    `- RPE 추세: ${trends.rpeTrend}`,
    `- 정체 세션 수: ${trends.stagnationCount}`,
    `- 누적 피로도: ${fatiguePct}%`,
    `- 마지막 휴식일로부터: ${trends.daysSinceLastRest}일`,
  ];
}

function buildPolicyUserPrompt(context: PolicyContext): string {
  return [
    ...buildConditionLines(context),
    '',
    '## 최근 세션 이력',
    ...buildHistoryLines(context),
    '',
    ...buildTrendLines(context),
    '',
    '위 정보를 바탕으로 이번 세션의 방향을 결정해주세요.',
  ].join('\n');
}

function extractJsonText(text: string): string {
  const matchResult = JSON_OBJECT_PATTERN.exec(text);
  if (matchResult !== null) {
    return matchResult[REGEX_FULL_MATCH_INDEX];
  }
  return text;
}

const DECISION_KIND_VALUES = [
  'deload',
  'exerciseSwap',
  'weightAdjustment',
  'continue',
  'sessionEnd',
  'pause',
] as const;

const decisionKindSchema = z.enum(DECISION_KIND_VALUES);

const rawDecisionSchema = z.object({
  kind: z.string(),
  reasoning: z.string().optional(),
  confidence: z.number().optional(),
  details: z.custom<PolicyDecisionDetails>().optional(),
});

function parseDecision(text: string): PolicyDecision {
  try {
    const jsonText = extractJsonText(text);
    const raw = rawDecisionSchema.safeParse(JSON.parse(jsonText));

    if (!raw.success) {
      return CONTINUE_DECISION;
    }

    const {
      data: { kind, reasoning, confidence, details },
    } = raw;
    const validatedKind = decisionKindSchema.safeParse(kind);

    if (!validatedKind.success) return CONTINUE_DECISION;

    return {
      kind: validatedKind.data,
      reasoning: reasoning ?? '이유 없음',
      confidence: confidence ?? FALLBACK_CONFIDENCE_PARSED,
      ...(details === undefined ? {} : { details }),
    };
  } catch {
    return CONTINUE_DECISION;
  }
}

/**
 * OpenRouter 기반 PolicyLLM을 생성한다.
 *
 * 컨디션/이력/트렌드를 분석하여 세션 방향을 결정한다.
 */
export function createOpenRouterPolicyLLM(
  config: OpenRouterLLMConfig,
): PolicyLLM {
  return {
    async decide(context: PolicyContext): Promise<PolicyDecision> {
      const userPrompt = buildPolicyUserPrompt(context);

      const result = callModel(config.client, {
        model: config.model,
        instructions: DECISION_SYSTEM_PROMPT,
        input: userPrompt,
        temperature: config.temperature ?? DEFAULT_POLICY_TEMPERATURE,
        maxOutputTokens: config.maxTokens ?? DEFAULT_POLICY_MAX_TOKENS,
        ...(config.maxCost === undefined
          ? {}
          : { stopWhen: [maxCost(config.maxCost)] }),
      });

      const text = await result.getText();
      return parseDecision(text);
    },
  };
}

// ---------------------------------------------------------------------------
// createOpenRouterExpressionLLM
// ---------------------------------------------------------------------------

function buildExpressionSystemPrompt(
  persona: ExpressionInput['persona'],
): string {
  return [
    `당신은 ${persona.name}(${persona.id})입니다.`,
    `말투: ${persona.tone}`,
    '',
    persona.description,
    '',
    '## 말투 가이드',
    persona.styleGuide,
    '',
    '당신의 역할: 계산 엔진이 결정한 운동 계획/조정 사항을 회원에게',
    '자연스럽고 동기부여가 되는 방식으로 전달하는 것입니다.',
    '결정 자체는 변경하지 말고, 회원이 이해하고 따를 수 있도록 표현하세요.',
    '',
    '응답은 한국어 자연어로, 2~3문장 이내로 간결하게 작성하세요.',
  ].join('\n');
}

function buildDecisionDetailLines(decision: PolicyDecision): string[] {
  const { kind, reasoning, confidence, details } = decision;
  const lines: string[] = [
    '## 전달할 결정',
    `- 종류: ${kind}`,
    `- 사유: ${reasoning}`,
    `- 확신도: ${confidence}`,
  ];

  if (details !== undefined) {
    if (details.weightDelta !== undefined) {
      const sign = details.weightDelta > POSITIVE_COMPARISON ? '+' : '';
      lines.push(`- 무게 조정: ${sign}${details.weightDelta}kg`);
    }
    if (details.suggestedExercise !== undefined) {
      lines.push(`- 교체 운동: ${details.suggestedExercise}`);
    }
    if (details.deloadWeeks !== undefined) {
      lines.push(`- 델로드 기간: ${details.deloadWeeks}주`);
    }
    if (details.pauseMinutes !== undefined) {
      lines.push(`- 휴식 시간: ${details.pauseMinutes}분`);
    }
  }

  return lines;
}

function buildSessionContextLines(
  sessionContext: ExpressionInput['sessionContext'],
): string[] {
  if (sessionContext === undefined) return [];

  const {
    sessionState,
    elapsedMinutes,
    currentExercise,
    completedSets,
    totalSets,
  } = sessionContext;
  const lines: string[] = ['', '## 세션 맥락'];
  lines.push(`- 상태: ${sessionState}`);
  lines.push(`- 경과: ${elapsedMinutes}분`);

  if (currentExercise !== undefined) {
    lines.push(`- 현재 운동: ${currentExercise}`);
  }
  lines.push(`- 세트 진행: ${completedSets}/${totalSets}`);

  return lines;
}

function buildExpressionUserPrompt(input: ExpressionInput): string {
  const { decision, sessionContext } = input;

  const parts = [
    ...buildDecisionDetailLines(decision),
    ...buildSessionContextLines(sessionContext),
    '',
    '위 결정을 회원에게 전달하는 말을 작성해주세요.',
  ];

  return parts.join('\n');
}

/**
 * OpenRouter 기반 ExpressionLLM을 생성한다.
 *
 * 엔진 결정을 사용자 페르소나에 맞는 발화로 변환한다.
 */
export function createOpenRouterExpressionLLM(
  config: OpenRouterLLMConfig,
): ExpressionLLM {
  return {
    async express(input: ExpressionInput): Promise<string> {
      const systemPrompt = buildExpressionSystemPrompt(input.persona);
      const userPrompt = buildExpressionUserPrompt(input);

      const result = callModel(config.client, {
        model: config.model,
        instructions: systemPrompt,
        input: userPrompt,
        temperature: config.temperature ?? DEFAULT_EXPRESS_TEMPERATURE,
        maxOutputTokens: config.maxTokens ?? DEFAULT_EXPRESS_MAX_TOKENS,
        ...(config.maxCost === undefined
          ? {}
          : { stopWhen: [maxCost(config.maxCost)] }),
      });

      return await result.getText();
    },
  };
}

// ---------------------------------------------------------------------------
// createOpenRouterIntentClassifier
// ---------------------------------------------------------------------------

const intentKindSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('startSession') }),
  z.object({ kind: z.literal('completeSet') }),
  z.object({ kind: z.literal('increaseLoad') }),
  z.object({ kind: z.literal('decreaseLoad') }),
  z.object({ kind: z.literal('setLoadTo'), valueKg: z.number() }),
  z.object({ kind: z.literal('reportRPE'), rpe: z.number() }),
  z.object({ kind: z.literal('endSession') }),
  z.object({ kind: z.literal('askQuestion') }),
]);

function parseIntent(text: string, utterance: NormalizedUtterance): Intent {
  try {
    const jsonText = extractJsonText(text);
    const parsed = intentKindSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) {
      return { kind: 'AskQuestion', text: utterance.text };
    }
    switch (parsed.data.kind) {
      case 'startSession':
        return { kind: 'StartSession' };
      case 'completeSet':
        return { kind: 'CompleteSet' };
      case 'increaseLoad':
        return { kind: 'IncreaseLoad' };
      case 'decreaseLoad':
        return { kind: 'DecreaseLoad' };
      case 'setLoadTo':
        return { kind: 'SetLoadTo', valueKg: parsed.data.valueKg };
      case 'reportRPE':
        return { kind: 'ReportRPE', rpe: parsed.data.rpe };
      case 'endSession':
        return { kind: 'EndSession' };
      case 'askQuestion':
        return { kind: 'AskQuestion', text: utterance.text };
    }
  } catch {
    return { kind: 'AskQuestion', text: utterance.text };
  }
}

/**
 * OpenRouter 기반 IntentClassifier를 생성한다.
 *
 * 정규화된 사용자 발화를 도메인 Intent로 분류한다.
 */
export function createOpenRouterIntentClassifier(
  config: OpenRouterLLMConfig,
): IntentClassifier {
  return {
    async classify(utterance: NormalizedUtterance): Promise<Intent> {
      const result = callModel(config.client, {
        model: config.model,
        instructions: OPENROUTER_INTENT_SYSTEM_PROMPT,
        input: utterance.text,
        temperature: DEFAULT_INTENT_TEMPERATURE,
        maxOutputTokens: config.maxTokens ?? DEFAULT_INTENT_MAX_TOKENS,
        ...(config.maxCost === undefined
          ? {}
          : { stopWhen: [maxCost(config.maxCost)] }),
      });

      const text = await result.getText();
      return parseIntent(text, utterance);
    },
  };
}

// ---------------------------------------------------------------------------
// createOpenRouterLLMs
// ---------------------------------------------------------------------------

/** createOpenRouterLLMs 생성 옵션 */
export interface OpenRouterLLMsConfig {
  /** OpenRouter API 키 */
  apiKey: string;
  /** 사용할 모델 ID */
  model: string;
  /** temperature (0.0 ~ 2.0) */
  temperature?: number;
  /** 최대 토큰 수 */
  maxTokens?: number;
  /** 최대 비용 (USD) */
  maxCost?: number;
}

/**
 * 하나의 OpenRouter 클라이언트로 모든 LLM 계층(Policy/Expression/Intent)을 생성한다.
 *
 * 클라이언트 생성과 모델 설정을 LLM 레이어 내부로 캡슐화해,
 * CLI/도메인 계층에서 OpenRouter를 직접 다루지 않도록 한다.
 */
export function createOpenRouterLLMs(config: OpenRouterLLMsConfig): {
  policy: PolicyLLM;
  expression: ExpressionLLM;
  intent: IntentClassifier;
} {
  const client = new OpenRouter({ apiKey: config.apiKey });
  const llmConfig: OpenRouterLLMConfig = {
    client,
    model: config.model,
    ...(config.temperature === undefined
      ? {}
      : { temperature: config.temperature }),
    ...(config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens }),
    ...(config.maxCost === undefined ? {} : { maxCost: config.maxCost }),
  };

  return {
    policy: createOpenRouterPolicyLLM(llmConfig),
    expression: createOpenRouterExpressionLLM(llmConfig),
    intent: createOpenRouterIntentClassifier(llmConfig),
  };
}
