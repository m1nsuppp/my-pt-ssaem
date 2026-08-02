/**
 * 워크아웃 (Workout) — 특정 날짜/순서에 수행하는 운동 1회의 계획.
 *
 * CONTEXT "워크아웃" 섹션에서 파생.
 * Exercise 타입은 import 없이 `exerciseId: string`으로만 참조해 결합을 최소화한다.
 */

/** 계획된 세트 — 목표 횟수/무게/RPE */
export interface PlannedSet {
  reps: number;
  /** null = 맨몸(bodyweight) */
  weightKg: number | null;
  /** 목표 RPE (1~10) */
  rpeTarget?: number;
}

/** 워크아웃 내 단일 운동 계획 */
export interface WorkoutExercise {
  exerciseId: string;
  sets: PlannedSet[];
  restSeconds: number;
  note?: string;
}

export interface Workout {
  id: string;
  name: string;
  /** 요일 (1~7), null = 요일 고정 없음 */
  dayOfWeek: number | null;
  order: number;
  exercises: WorkoutExercise[];
}
