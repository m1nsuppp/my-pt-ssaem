/**
 * RPE 디로드 룰 (RPE Deload Rule) — 부하를 줄이는 방향의 자동조절.
 *
 * 가장 최근 완료 세트부터 RPE가 임계치 이상으로 연속 N개면,
 * 다음 세트 무게를 deltaKg만큼 감소시키는 조정을 제안한다.
 * 부하를 줄이는 판정이므로 증량 규칙보다 앞 순위에 둔다.
 */

import type { DecisionInput, Rule } from '../decision-engine.ts';

/** 기본 RPE 임계치 */
const DEFAULT_THRESHOLD_RPE = 9;
/** 기본 연속 세트 임계 개수 */
const DEFAULT_CONSECUTIVE_SETS = 3;
/** 기본 무게 변화 (kg) */
const DEFAULT_DELTA_KG = -5;
/** 기본 확신도 */
const DEFAULT_CONFIDENCE = 0.9;

export interface RpeDeloadRuleConfig {
  /** RPE 임계치 (기본 9) */
  thresholdRpe?: number;
  /** 연속 세트 임계 개수 (기본 3) */
  consecutiveSets?: number;
  /** 무게 변화 (kg, 기본 -5) */
  deltaKg?: number;
  /** 확신도 (기본 0.9) */
  confidence?: number;
}

/**
 * RPE 디로드 규칙을 만든다.
 *
 * 조정이 귀속될 운동은 판정 시점의 `input.exerciseId`를 따른다.
 */
export function createRpeDeloadRule(config: RpeDeloadRuleConfig = {}): Rule {
  const {
    thresholdRpe = DEFAULT_THRESHOLD_RPE,
    consecutiveSets = DEFAULT_CONSECUTIVE_SETS,
    deltaKg = DEFAULT_DELTA_KG,
    confidence = DEFAULT_CONFIDENCE,
  } = config;

  return {
    name: 'rpe-deload',
    apply(input: DecisionInput) {
      // 가장 최근 세트(배열 끝)부터 역방향으로 연속 개수 카운트
      let count = 0;
      for (const set of input.recentHistory.slice().reverse()) {
        const matches =
          set.completed && set.rpe !== undefined && set.rpe >= thresholdRpe;

        if (!matches) break;
        count += 1;
      }

      if (count < consecutiveSets) return null;

      return {
        scope: 'inSession',
        type: 'weightAdjustment',
        adjustment: {
          exerciseId: input.exerciseId,
          deltaKg,
          reason: `RPE >= ${thresholdRpe} for ${consecutiveSets} consecutive sets`,
          confidence,
        },
      };
    },
  };
}
