/**
 * 부하·반복 계산 (Load & Rep Calculation) — 1RM 추정 (e1RM).
 *
 * 여러 공식으로 세트 기록(무게 × 반복)을 1회 최대 추정치로 환산한다.
 * 계산 계층은 세션 중 자동조절 결정의 기초 데이터를 제공한다.
 */

export type E1rmFormula = 'epley' | 'brzycki';

/** 최소 허용 반복 수 */
const MIN_REPS = 1;
/** Epley 공식의 반복 나눗셈 상수 */
const EPLEY_REP_DIVISOR = 30;
/** Brzycki 공식의 분자 상수 */
const BRZYCKI_NUMERATOR = 36;
/** Brzycki 공식에서 분모가 0이 되는 반복 수 경계 */
const BRZYCKI_MAX_REPS = 37;

/**
 * e1RM(추정 1RM) 계산.
 *
 * @param reps      수행 반복 횟수 (>= 1)
 * @param weightKg  수행 무게 (kg, > 0)
 * @param formula   추정 공식 (기본: 'epley')
 * @returns 추정 1RM — 반올림하지 않은 원시값
 */
export function estimateE1rm(
  reps: number,
  weightKg: number,
  formula: E1rmFormula = 'epley',
): number {
  if (reps < MIN_REPS) {
    throw new RangeError('reps must be >= 1');
  }
  if (weightKg <= 0) {
    throw new RangeError('weightKg must be > 0');
  }

  switch (formula) {
    case 'epley':
      return weightKg * (1 + reps / EPLEY_REP_DIVISOR);
    case 'brzycki':
      if (reps >= BRZYCKI_MAX_REPS) {
        throw new RangeError('Brzycki invalid for reps >= 37');
      }

      return (weightKg * BRZYCKI_NUMERATOR) / (BRZYCKI_MAX_REPS - reps);
  }
}
