import type { Workout } from './workout.ts';

/**
 * 프로그램 (Program) — 트레이너가 회원을 위해 수립하는 주 단위 운영 계획.
 *
 * CONTEXT "프로그램" / "Program 구조" 섹션에서 파생.
 * 세션 스케줄 생성(session → workout 매핑)은 후속 이슈에서 구현하므로,
 * 여기서는 정적 필드만 정의한다.
 */

export type GoalType =
  | 'strength'
  | 'hypertrophy'
  | 'weightLoss'
  | 'generalHealth'
  | 'rehabilitation';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/** 주기화(Periodization) — 시간에 따른 루틴 변화 방식 */
export type PeriodizationType = 'single' | 'linear' | 'block' | 'undulating';

/** 분할(Split) — 워크아웃을 부위별로 나누는 방식 */
export type SplitType = 'pushPullLegs' | 'upperLower' | 'fullBody';

export type ProgramStatus = 'active' | 'archived';

export interface Program {
  id: string;
  name: string;
  goal: GoalType;
  experienceLevel: ExperienceLevel;
  /** null = 무기한 */
  durationWeeks: number | null;
  workoutsPerWeek: number;
  workouts: Workout[];
  split: SplitType;
  periodization: PeriodizationType;
  status: ProgramStatus;
  startedAt: Date;
}
