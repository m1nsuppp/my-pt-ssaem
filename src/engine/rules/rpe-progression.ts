/**
 * RPE 증량 룰 (RPE Progression Rule) — 부하를 늘리는 방향의 자동조절.
 *
 * 가장 최근 완료 세트부터 목표 반복을 채우면서 RPE가 낮게 유지된 세트가 연속 N개면,
 * 다음 세트 무게를 deltaKg만큼 증가시키는 조정을 제안한다.
 * 점진적 과부하의 나머지 절반으로, 디로드 규칙 다음 순위에서 평가된다.
 */

import type { DecisionInput, Rule } from '../decision-engine.ts';

/** 기본 RPE 상한 — 이 값 이하로 수행해야 여유가 있다고 본다 */
const DEFAULT_CEILING_RPE = 7;
/** 기본 연속 세트 임계 개수 */
const DEFAULT_CONSECUTIVE_SETS = 3;
/** 기본 무게 변화 (kg) */
const DEFAULT_DELTA_KG = 2.5;
/** 기본 확신도 — 증량은 감량보다 보수적으로 제안한다 */
const DEFAULT_CONFIDENCE = 0.7;

export interface RpeProgressionRuleConfig {
  /** RPE 상한 (기본 7) */
  ceilingRpe?: number;
  /** 연속 세트 임계 개수 (기본 3) */
  consecutiveSets?: number;
  /** 무게 변화 (kg, 기본 +2.5) */
  deltaKg?: number;
  /** 확신도 (기본 0.7) */
  confidence?: number;
}

/**
 * RPE 증량 규칙을 만든다.
 *
 * 계획 반복 수는 세트 기록이 아니라 현재 계획 세트(`input.currentSet`)를 기준으로 본다 —
 * 목표가 바뀌었다면 새 목표를 채웠는지로 판단해야 한다.
 * 맨몸 운동(`weightKg === null`)은 무게로 증량할 수 없어 판정하지 않는다.
 */
export function createRpeProgressionRule(
  config: RpeProgressionRuleConfig = {},
): Rule {
  const {
    ceilingRpe = DEFAULT_CEILING_RPE,
    consecutiveSets = DEFAULT_CONSECUTIVE_SETS,
    deltaKg = DEFAULT_DELTA_KG,
    confidence = DEFAULT_CONFIDENCE,
  } = config;

  return {
    name: 'rpe-progression',
    apply(input: DecisionInput) {
      const { currentSet } = input;
      if (currentSet.weightKg === null) {
        return null;
      }

      let count = 0;
      for (const set of input.recentHistory.slice().reverse()) {
        const matches =
          set.completed &&
          set.rpe !== undefined &&
          set.rpe <= ceilingRpe &&
          set.actualReps >= currentSet.reps;

        if (!matches) {
          break;
        }
        count += 1;
      }

      if (count < consecutiveSets) {
        return null;
      }

      return {
        scope: 'inSession',
        type: 'weightAdjustment',
        adjustment: {
          exerciseId: input.exerciseId,
          deltaKg,
          reason: `RPE <= ${ceilingRpe} with target reps met for ${consecutiveSets} consecutive sets`,
          confidence,
        },
      };
    },
  };
}
