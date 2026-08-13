/**
 * 결정적 텍스트 포매터 — 엔진 액션을 사람이 읽는 문장으로 변환한다.
 *
 * 표현 LLM 없이 simulate 기본(no `--llm`) 경로에서 사용.
 * 도메인 불문 순수 함수라 파이프라인과 같은 계층에 둔다.
 */

import type { ProgressiveOverloadAction } from '../domain/progressive-overload.ts';

const EMPTY_ADJUST_MESSAGE =
  '조정 없음 — RPE 디로드 조건(RPE >= 9 x 3세트 연속) 미충족';

/**
 * 엔진 액션을 한국어 한 줄 메시지로 포맷한다.
 *
 * - null: 디로드 조건 미충족 문구
 * - 액션: `{운동} 무게 {부호}{|deltaKg|}kg 조정 제안: {사유} (확신도 {confidence})`
 */
export function formatEngineAction(
  action: ProgressiveOverloadAction | null,
): string {
  // 이 엔진은 weightAdjustment만 반환하지만, 디스크리미네이터로 안전하게 좁힌다.
  if (action === null || !('adjustment' in action)) {
    return EMPTY_ADJUST_MESSAGE;
  }
  const { adjustment } = action;
  const sign = adjustment.deltaKg < 0 ? '-' : '+';

  return `${adjustment.exerciseId} 무게 ${sign}${Math.abs(
    adjustment.deltaKg,
  )}kg 조정 제안: ${adjustment.reason} (확신도 ${adjustment.confidence})`;
}
