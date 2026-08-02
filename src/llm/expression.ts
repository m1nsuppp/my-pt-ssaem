/**
 * ExpressionLLM — 엔진 결정을 사용자 페르소나로 변환한다.
 *
 * Layer 3 (Expression) 책임:
 * - Calculation Layer(엔진)가 산출한 결정을 받아 사용자 페르소나 톤으로 변환
 * - 결정 자체는 변하지 않음. 표현만 LLM이 담당
 * - 입력: 결정 + 페르소나, 출력: 발화 텍스트
 *
 * 사용 측 관점에서 설계: 메서드명과 시그니처만 보고 동작을 예측할 수 있어야 함.
 */

import type { PolicyDecision } from './policy.ts';
import type { Persona } from '../domain/persona.ts';

/** ExpressionLLM.express()의 입력 */
export interface ExpressionInput {
  /** Calculation Layer가 산출한 최종 결정 */
  decision: PolicyDecision;
  /** 사용자가 선택한 AI 코치 페르소나 */
  persona: Persona;
  /** 현재 세션 맥락 (선택) */
  sessionContext?: SessionContext;
}

/** AI 코치 페르소나 — 성격/말투를 정의 (도메인 src/domain/persona.ts) */

/** 현재 세션 맥락 */
export interface SessionContext {
  /** 현재 세션 상태 */
  sessionState: string;
  /** 경과 시간 (분) */
  elapsedMinutes: number;
  /** 현재 운동 중인 경우 운동 이름 */
  currentExercise?: string;
  /** 완료한 세트 수 */
  completedSets: number;
  /** 전체 목표 세트 수 */
  totalSets: number;
}

/**
 * ExpressionLLM 인터페이스.
 *
 * 구현체는 OpenRouter, fake, 또는 다른 LLM 제공자를 사용할 수 있음.
 * 도메인 코드는 이 인터페이스에만 의존하고, 구체 구현을 직접 import하지 않음.
 */
export interface ExpressionLLM {
  /**
   * 엔진 결정을 사용자 페르소나에 맞는 발화로 변환한다.
   *
   * @param input - 결정 + 페르소나 + 세션 맥락
   * @returns 사용자에게 전달할 발화 텍스트
   */
  express: (input: ExpressionInput) => Promise<string>;
}
