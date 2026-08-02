/**
 * 운동 종목 (Exercise) — 워크아웃을 구성하는 개별 운동 동작과 그 공유 스칼라.
 *
 * CONTEXT "운동 종목 DB" + "운동의 성과 단위" 섹션에서 파생.
 * 외부 datasets는 snake_case지만 적재 레이어에서 camelCase로 매핑되므로,
 * 도메인 타입은 camelCase만 노출한다.
 */

/** 기술 수준 — 안전성 필터링/프로그래밍에 사용 */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

/** 운동 패턴 — 프로그래밍 시 부위 균형에 필수 */
export type MovementPattern = 'squat' | 'hinge' | 'push' | 'pull' | 'carry' | 'lunge';

/** 성과 단위 — loadReps(무게×횟수) / time(시간) */
export type PerformanceKind = 'loadReps' | 'time';

/** 필요 장비 */
export type Equipment =
  | 'bodyWeight'
  | 'dumbbell'
  | 'barbell'
  | 'cable'
  | 'machine'
  | 'kettlebell'
  | 'resistanceBand'
  | 'pullUpBar'
  | 'bench'
  | 'mat';

/** 신체 부위 — CONTEXT가 부위 taxonomy를 정의하지 않아 string으로 둠 */
export type BodyPart = string;

export interface Exercise {
  id: string;
  name: string;
  category: string;
  bodyPart: BodyPart;
  equipment: Equipment[];
  /** 주동근 */
  target: string;
  /** 협력근 */
  muscleGroup: string;
  /** 부근 */
  secondaryMuscles: string[];
  movementPattern: MovementPattern;
  performanceKind: PerformanceKind;
  minimumSkillLevel: SkillLevel;
  /** 이 운동이 부담을 주는 신체 부위 (주의 부위) */
  contraindicatedBodyParts: BodyPart[];
  /** 다국어 instructions.ko 매핑 */
  instructionsKo: string;
  instructionStepsKo: string[];
  gifUrl: string;
  imagePath: string;
}
