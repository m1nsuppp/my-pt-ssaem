/**
 * PolicyLLM — "이번 세션의 큰 방향"을 결정한다.
 *
 * Layer 1 (Policy) 책임:
 * - 컨디션/이력/트렌드를 보고 의도를 분류하거나 방향을 정함
 * - 자연어 추론이 필요해 LLM이 담당
 * - 출력은 Calculation Layer(엔진)의 입력이 됨
 *
 * 사용 측 관점에서 설계: 메서드명과 시그니처만 보고 동작을 예측할 수 있어야 함.
 */

/** PolicyLLM.decide()의 입력 맥락 */
export interface PolicyContext {
  /** 세션 시작 전 컨디션 체크 결과 */
  condition: ConditionCheck;
  /** 최근 N개 세션 요약 (최대 10개) */
  recentHistory: SessionSummary[];
  /** 추세 분석 결과 */
  trends: TrendAnalysis;
}

/** 컨디션 체크 — 세션 시작 전 회원의 현재 상태 */
export interface ConditionCheck {
  /** 수면 시간 (시간) */
  sleepHours: number;
  /** 주관적 피로도 (1~10, 10이 가장 피로) */
  fatigue: number;
  /** 보고된 통증 부위 */
  painAreas: string[];
  /** 통증 강도 (1~10, 0 = 통증 없음) */
  painLevel: number;
  /** 영양 상태 (좋음/보통/나쁨) */
  nutrition: 'good' | 'fair' | 'poor';
  /** 자유 텍스트 메모 */
  notes?: string;
}

/** 세션 요약 — 완료된 세션의 핵심 지표 */
export interface SessionSummary {
  /** 세션 ID */
  sessionId: string;
  /** 세션 날짜 */
  date: Date;
  /** 평균 RPE (1~10) */
  averageRPE: number;
  /** 총 볼륨 (kg × reps) */
  totalVolume: number;
  /** 계획 대비 완료율 (0.0 ~ 1.0) */
  completionRate: number;
  /** 세션 종료 이유 */
  endReason: 'completed' | 'abandoned' | 'paused';
}

/** 추세 분석 — 최근 세션들의 패턴 */
export interface TrendAnalysis {
  /** 볼륨 추세 (증가/유지/감소) */
  volumeTrend: 'increasing' | 'stable' | 'decreasing';
  /** RPE 추세 */
  rpeTrend: 'increasing' | 'stable' | 'decreasing';
  /** 연속 정체 세션 수 */
  stagnationCount: number;
  /** 누적 피로도 (0.0 ~ 1.0) */
  accumulatedFatigue: number;
  /** 마지막 휴식일로부터 경과 일수 */
  daysSinceLastRest: number;
}

/** PolicyLLM이 결정할 수 있는 방향의 종류 */
export type PolicyDecisionKind =
  | 'deload'
  | 'exerciseSwap'
  | 'weightAdjustment'
  | 'continue'
  | 'sessionEnd'
  | 'pause';

/** PolicyLLM.decide()의 출력 */
export interface PolicyDecision {
  /** 결정 종류 */
  kind: PolicyDecisionKind;
  /** 결정에 대한 자연어 추론 */
  reasoning: string;
  /** 확신도 (0.0 ~ 1.0) */
  confidence: number;
  /** 결정 종류별 추가 정보 */
  details?: PolicyDecisionDetails;
}

/** 결정 종류별 추가 정보 */
export interface PolicyDecisionDetails {
  /** exerciseSwap: 교체할 운동 이름 */
  suggestedExercise?: string;
  /** weightAdjustment: 조정량 (kg, 양수=증가, 음수=감소) */
  weightDelta?: number;
  /** deload: 델로드 주 수 */
  deloadWeeks?: number;
  /** pause: 예상 중단 시간 (분) */
  pauseMinutes?: number;
}

/**
 * PolicyLLM 인터페이스.
 *
 * 구현체는 OpenRouter, fake, 또는 다른 LLM 제공자를 사용할 수 있음.
 * 도메인 코드는 이 인터페이스에만 의존하고, 구체 구현을 직접 import하지 않음.
 */
export interface PolicyLLM {
  /**
   * 주어진 맥락에서 이번 세션의 방향을 결정한다.
   *
   * @param context - 현재 컨디션, 최근 세션 이력, 추세 분석
   * @returns 세션 방향 결정
   */
  decide(context: PolicyContext): Promise<PolicyDecision>;
}