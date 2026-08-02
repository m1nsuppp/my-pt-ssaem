/**
 * RPE 디로드 룰 (RPE Deload Rule) — 세션 중 과부하 판정의 첫 규칙.
 *
 * 가장 최근 완료 세트부터 RPE가 임계치 이상으로 연속 N개면,
 * 다음 세트 무게를 deltaKg만큼 감소시키는 조정을 제안한다.
 * 아직 규칙이 하나뿐이므로 추상 Rule 인터페이스는 만들지 않는다.
 */

import type { WeightAdjustment } from '../../domain/progressive-overload.ts';
import type { SetRecord } from '../../domain/set-record.ts';

/** 기본 RPE 임계치 */
const DEFAULT_THRESHOLD_RPE = 9;
/** 기본 연속 세트 임계 개수 */
const DEFAULT_CONSECUTIVE_SETS = 3;
/** 기본 무게 변화 (kg) */
const DEFAULT_DELTA_KG = -5;
/** 기본 확신도 */
const DEFAULT_CONFIDENCE = 0.9;

export interface RpeDeloadRuleConfig {
  /** 룰이 제안할 WeightAdjustment의 귀속 운동 */
  exerciseId: string;
  /** RPE 임계치 (기본 9) */
  thresholdRpe?: number;
  /** 연속 세트 임계 개수 (기본 3) */
  consecutiveSets?: number;
  /** 무게 변화 (kg, 기본 -5) */
  deltaKg?: number;
  /** 확신도 (기본 0.9) */
  confidence?: number;
}

export interface RpeDeloadRule {
  /**
   * 가장 최근 세트부터 연속으로 RPE>=임계치인 완료 세트가 N개면 감소 제안.
   * `history`는 해당 운동 세트 목록으로, 가장 최근 세트가 배열 마지막이어야 한다.
   */
  apply: (history: SetRecord[]) => WeightAdjustment | null;
}

export function createRpeDeloadRule(
  config: RpeDeloadRuleConfig,
): RpeDeloadRule {
  const {
    exerciseId,
    thresholdRpe = DEFAULT_THRESHOLD_RPE,
    consecutiveSets = DEFAULT_CONSECUTIVE_SETS,
    deltaKg = DEFAULT_DELTA_KG,
    confidence = DEFAULT_CONFIDENCE,
  } = config;

  return {
    apply(history: SetRecord[]): WeightAdjustment | null {
      // 연속 카운트 초기값 (0)
      let count = 0;

      // 가장 최근 세트(배열 끝)부터 역방향으로 연속 개수 카운트
      for (const set of history.slice().reverse()) {
        const matches =
          set.completed && set.rpe !== undefined && set.rpe >= thresholdRpe;

        if (!matches) {
          break;
        }
        count += 1;
      }

      if (count < consecutiveSets) {
        return null;
      }

      return {
        exerciseId,
        deltaKg,
        reason: `RPE >= ${thresholdRpe} for ${consecutiveSets} consecutive sets`,
        confidence,
      };
    },
  };
}
