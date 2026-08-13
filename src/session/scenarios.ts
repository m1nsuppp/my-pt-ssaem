/**
 * 시나리오 로딩 — `scenarios/*.json`을 Domain/Policy 타입으로 역직렬화한다.
 *
 * JSON의 ISO 날짜 문자열을 `Date`로 변환하고,
 * chat이 시나리오 파일 없이 독립 동작하도록 기본 상태(내장 demo)를 제공한다.
 */

import { z } from 'zod';
import type { Persona } from '../domain/persona.ts';
import type { Program } from '../domain/program.ts';
import type { SetRecord } from '../domain/set-record.ts';
import type { PlannedSet } from '../domain/workout.ts';
import type { PolicyContext } from '../llm/policy.ts';

/**
 * 자동조절 규칙 설정.
 *
 * 디로드는 시나리오가 반드시 명시하고, 증량은 생략하면 규칙 기본값을 쓴다 —
 * 기존 시나리오 파일이 그대로 동작해야 한다.
 */
export interface RuleConfig {
  thresholdRpe: number;
  consecutiveSets: number;
  deltaKg: number;
  confidence: number;
  /** 증량 판정 RPE 상한 */
  progressionCeilingRpe?: number | undefined;
  /** 증량 판정 연속 세트 수 */
  progressionConsecutiveSets?: number | undefined;
  /** 증량 폭 (kg) */
  progressionDeltaKg?: number | undefined;
  /** 증량 확신도 */
  progressionConfidence?: number | undefined;
}

/** 로드된 시나리오 전체 상태 */
export interface ScenarioState {
  name: string;
  program: Program;
  exerciseId: string;
  rule: RuleConfig;
  recentHistory: SetRecord[];
  currentSet: PlannedSet;
  persona: Persona;
  policy: PolicyContext;
}

const conditionSchema = z.object({
  sleepHours: z.number(),
  fatigue: z.number(),
  painAreas: z.array(z.string()),
  painLevel: z.number(),
  nutrition: z.enum(['good', 'fair', 'poor']),
});

const sessionSummarySchema = z.object({
  sessionId: z.string(),
  date: z.coerce.date(),
  averageRPE: z.number(),
  totalVolume: z.number(),
  completionRate: z.number(),
  endReason: z.enum(['completed', 'abandoned', 'paused']),
});

const trendSchema = z.object({
  volumeTrend: z.enum(['increasing', 'stable', 'decreasing']),
  rpeTrend: z.enum(['increasing', 'stable', 'decreasing']),
  stagnationCount: z.number(),
  accumulatedFatigue: z.number(),
  daysSinceLastRest: z.number(),
});

const setRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  exerciseId: z.string(),
  setNumber: z.number(),
  plannedReps: z.number(),
  actualReps: z.number(),
  rpe: z.number(),
  completed: z.boolean(),
  performedAt: z.coerce.date(),
});

const programSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.enum([
    'strength',
    'hypertrophy',
    'weightLoss',
    'generalHealth',
    'rehabilitation',
  ]),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  durationWeeks: z.number().nullable(),
  workoutsPerWeek: z.number(),
  workouts: z.array(z.unknown()),
  split: z.enum(['pushPullLegs', 'upperLower', 'fullBody']),
  periodization: z.enum(['single', 'linear', 'block', 'undulating']),
  status: z.enum(['active', 'archived']),
  startedAt: z.coerce.date(),
});

const personaSchema = z.object({
  id: z.string(),
  name: z.string(),
  tone: z.enum(['motivational', 'caring', 'analytical', 'challenging']),
  description: z.string(),
  styleGuide: z.string(),
});

const ruleSchema = z.object({
  thresholdRpe: z.number(),
  consecutiveSets: z.number(),
  deltaKg: z.number(),
  confidence: z.number(),
  progressionCeilingRpe: z.number().optional(),
  progressionConsecutiveSets: z.number().optional(),
  progressionDeltaKg: z.number().optional(),
  progressionConfidence: z.number().optional(),
});

const scenarioSchema = z.object({
  name: z.string(),
  program: programSchema,
  exerciseId: z.string(),
  rule: ruleSchema,
  recentHistory: z.array(setRecordSchema),
  currentSet: z.object({
    reps: z.number(),
    weightKg: z.number().nullable(),
  }),
  persona: personaSchema,
  policy: z.object({
    condition: conditionSchema,
    sessionSummaries: z.array(sessionSummarySchema),
    trends: trendSchema,
  }),
});

type RawScenario = z.infer<typeof scenarioSchema>;

function toScenarioState(parsed: RawScenario): ScenarioState {
  return {
    name: parsed.name,
    program: { ...parsed.program, workouts: [] },
    exerciseId: parsed.exerciseId,
    rule: parsed.rule,
    recentHistory: parsed.recentHistory,
    currentSet: parsed.currentSet,
    persona: parsed.persona,
    policy: {
      condition: parsed.policy.condition,
      recentHistory: parsed.policy.sessionSummaries,
      trends: parsed.policy.trends,
    },
  };
}

async function parseScenarioFile(name: string): Promise<RawScenario> {
  try {
    const raw: unknown = await Bun.file(`scenarios/${name}.json`).json();

    return scenarioSchema.parse(raw);
  } catch (err) {
    throw new Error(`시나리오를 찾을 수 없습니다: ${name}`, { cause: err });
  }
}

/**
 * `scenarios/<name>.json`을 로드해 ScenarioState로 반환한다.
 *
 * JSON의 `policy.sessionSummaries`는 PolicyContext의 `recentHistory`로 매핑한다.
 *
 * @param name - 시나리오 이름 (확장자 제외)
 * @throws 시나리오 파일이 없거나 형식이 틀리면 Error
 */
export async function loadScenario(name: string): Promise<ScenarioState> {
  return toScenarioState(await parseScenarioFile(name));
}

/** 기본 페르소나 — chat이 시나리오 없이 사용하는 demo 코치 */
export const DEFAULT_PERSONA: Persona = {
  id: 'careful-coach',
  name: '케어형 코치',
  tone: 'caring',
  description: '부드럽고 배려하는 코치',
  styleGuide: '부드럽고 배려하는 말투로, 회원의 컨디션을 먼저 살피며 조언한다.',
};

/** chat용 내장 demo 상태 — 시나리오 파일 없이 독립 동작 */
export const DEFAULT_CHAT_STATE: ScenarioState = {
  name: 'chat-demo',
  program: {
    id: 'p1',
    name: 'demo strength',
    goal: 'strength',
    experienceLevel: 'beginner',
    durationWeeks: null,
    workoutsPerWeek: 3,
    workouts: [],
    split: 'fullBody',
    periodization: 'linear',
    status: 'active',
    startedAt: new Date('2026-01-01T00:00:00Z'),
  },
  exerciseId: 'squat',
  rule: { thresholdRpe: 9, consecutiveSets: 3, deltaKg: -5, confidence: 0.9 },
  recentHistory: [],
  currentSet: { reps: 5, weightKg: 100 },
  persona: DEFAULT_PERSONA,
  policy: {
    condition: {
      sleepHours: 7,
      fatigue: 3,
      painAreas: [],
      painLevel: 0,
      nutrition: 'good',
    },
    recentHistory: [],
    trends: {
      volumeTrend: 'stable',
      rpeTrend: 'stable',
      stagnationCount: 0,
      accumulatedFatigue: 0,
      daysSinceLastRest: 0,
    },
  },
};
