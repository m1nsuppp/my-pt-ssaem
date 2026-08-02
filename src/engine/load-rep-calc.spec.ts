/**
 * load-rep-calc 스펙 — e1RM 추정 공개 인터페이스(입력 → 출력) 검증.
 */
import { describe, expect, test } from 'bun:test';
import { estimateE1rm } from './load-rep-calc.ts';

describe('estimateE1rm', () => {
  test('Epley 100kg x 5 -> 116.6667 수준', () => {
    expect(estimateE1rm(5, 100, 'epley')).toBeCloseTo(116.6667, 3);
  });

  test('Epley가 기본 formula', () => {
    expect(estimateE1rm(5, 100)).toBeCloseTo(estimateE1rm(5, 100, 'epley'), 10);
  });

  test('Brzycki 100kg x 5 -> 112.5', () => {
    expect(estimateE1rm(5, 100, 'brzycki')).toBeCloseTo(112.5, 6);
  });

  test('reps=1, Epley 100 -> 100 * (1 + 1/30)', () => {
    expect(estimateE1rm(1, 100, 'epley')).toBeCloseTo(100 * (1 + 1 / 30), 10);
  });

  test('reps=0 -> throw', () => {
    expect(() => estimateE1rm(0, 100)).toThrow(RangeError);
  });

  test('weightKg=0 -> throw', () => {
    expect(() => estimateE1rm(5, 0)).toThrow(RangeError);
  });

  test('Brzycki reps=37 -> throw', () => {
    expect(() => estimateE1rm(37, 100, 'brzycki')).toThrow(RangeError);
  });
});
