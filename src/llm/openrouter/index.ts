/**
 * OpenRouter LLM 구현체.
 *
 * @openrouter/agent와 @openrouter/sdk를 래핑하여 도메인 계층에서 직접 import하지 않도록 한다.
 * 모델 변경, temperature, maxCost 등은 이 레이어 내부에 캡슐화한다.
 */

import { callModel, maxCost } from '@openrouter/agent';
import type { OpenRouter } from '@openrouter/agent';
import type { PolicyLLM, PolicyContext, PolicyDecision } from '../policy.ts';
import type { ExpressionLLM, ExpressionInput } from '../expression.ts';

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

// ---------------------------------------------------------------------------
// createOpenRouterPolicyLLM
// ---------------------------------------------------------------------------

function buildPolicySystemPrompt(): string {
  return [
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
}

function buildPolicyUserPrompt(context: PolicyContext): string {
  return [
    '## 컨디션',
    `- 수면: ${context.condition.sleepHours}시간`,
    `- 피로도: ${context.condition.fatigue}/10`,
    `- 통증 부위: ${context.condition.painAreas.length > 0 ? context.condition.painAreas.join(', ') : '없음'}`,
    `- 통증 강도: ${context.condition.painLevel}/10`,
    `- 영양: ${context.condition.nutrition}`,
    context.condition.notes ? `- 메모: ${context.condition.notes}` : '',
    '',
    '## 최근 세션 이력',
    ...context.recentHistory.map((s, i) => [
      `[세션 ${i + 1}] ${s.date.toISOString().slice(0, 10)}`,
      `  RPE: ${s.averageRPE}/10, 볼륨: ${s.totalVolume}kg, 완료율: ${Math.round(s.completionRate * 100)}%`,
      `  종료: ${s.endReason}`,
    ].join('\n')),
    '',
    '## 추세',
    `- 볼륨 추세: ${context.trends.volumeTrend}`,
    `- RPE 추세: ${context.trends.rpeTrend}`,
    `- 정체 세션 수: ${context.trends.stagnationCount}`,
    `- 누적 피로도: ${Math.round(context.trends.accumulatedFatigue * 100)}%`,
    `- 마지막 휴식일로부터: ${context.trends.daysSinceLastRest}일`,
    '',
    '위 정보를 바탕으로 이번 세션의 방향을 결정해주세요.',
  ].join('\n');
}

function parseDecision(text: string): PolicyDecision {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const json = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);

    return {
      kind: json.kind,
      reasoning: json.reasoning,
      confidence: json.confidence,
      details: json.details,
    };
  } catch {
    return {
      kind: 'continue',
      reasoning: 'LLM 응답을 파싱할 수 없어 기본값(continue)을 반환합니다.',
      confidence: 0.3,
    };
  }
}

/**
 * OpenRouter 기반 PolicyLLM을 생성한다.
 *
 * 컨디션/이력/트렌드를 분석하여 세션 방향을 결정한다.
 */
export function createOpenRouterPolicyLLM(config: OpenRouterLLMConfig): PolicyLLM {
  return {
    async decide(context: PolicyContext): Promise<PolicyDecision> {
      const systemPrompt = buildPolicySystemPrompt();
      const userPrompt = buildPolicyUserPrompt(context);

      const result = callModel(config.client, {
        model: config.model,
        instructions: systemPrompt,
        input: userPrompt,
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens ?? 500,
        ...(config.maxCost !== undefined
          ? { stopWhen: [maxCost(config.maxCost)] }
          : {}),
      });

      const text = await result.getText();
      return parseDecision(text);
    },
  };
}

// ---------------------------------------------------------------------------
// createOpenRouterExpressionLLM
// ---------------------------------------------------------------------------

function buildExpressionSystemPrompt(persona: ExpressionInput['persona']): string {
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

function buildExpressionUserPrompt(input: ExpressionInput): string {
  const parts: string[] = [
    '## 전달할 결정',
    `- 종류: ${input.decision.kind}`,
    `- 사유: ${input.decision.reasoning}`,
    `- 확신도: ${input.decision.confidence}`,
  ];

  if (input.decision.details) {
    const d = input.decision.details;
    if (d.weightDelta !== undefined) {
      parts.push(`- 무게 조정: ${d.weightDelta > 0 ? '+' : ''}${d.weightDelta}kg`);
    }
    if (d.suggestedExercise) {
      parts.push(`- 교체 운동: ${d.suggestedExercise}`);
    }
    if (d.deloadWeeks !== undefined) {
      parts.push(`- 델로드 기간: ${d.deloadWeeks}주`);
    }
    if (d.pauseMinutes !== undefined) {
      parts.push(`- 휴식 시간: ${d.pauseMinutes}분`);
    }
  }

  if (input.sessionContext) {
    parts.push('', '## 세션 맥락');
    parts.push(`- 상태: ${input.sessionContext.sessionState}`);
    parts.push(`- 경과: ${input.sessionContext.elapsedMinutes}분`);
    if (input.sessionContext.currentExercise) {
      parts.push(`- 현재 운동: ${input.sessionContext.currentExercise}`);
    }
    parts.push(`- 세트 진행: ${input.sessionContext.completedSets}/${input.sessionContext.totalSets}`);
  }

  parts.push('', '위 결정을 회원에게 전달하는 말을 작성해주세요.');

  return parts.join('\n');
}

/**
 * OpenRouter 기반 ExpressionLLM을 생성한다.
 *
 * 엔진 결정을 사용자 페르소나에 맞는 발화로 변환한다.
 */
export function createOpenRouterExpressionLLM(config: OpenRouterLLMConfig): ExpressionLLM {
  return {
    async express(input: ExpressionInput): Promise<string> {
      const systemPrompt = buildExpressionSystemPrompt(input.persona);
      const userPrompt = buildExpressionUserPrompt(input);

      const result = callModel(config.client, {
        model: config.model,
        instructions: systemPrompt,
        input: userPrompt,
        temperature: config.temperature ?? 0.8,
        maxOutputTokens: config.maxTokens ?? 300,
        ...(config.maxCost !== undefined
          ? { stopWhen: [maxCost(config.maxCost)] }
          : {}),
      });

      return result.getText();
    },
  };
}