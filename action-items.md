# Action Items — 다음 마일스톤

이슈 2~8(초기 설정, LLM 래퍼, 도메인 타입, 결정 엔진, CLI, HTTP 서버) 완료 시점의 코드베이스를 기준으로,
CONTEXT.md 도메인 모델 대비 미구현 갭을 우선순위 순으로 정리한다.

## 현재 상태 요약

- **구현됨**: 도메인 타입 전체, LLM 3계층(Intent/Policy/Expression) 인터페이스 + OpenRouter/fake 구현,
  RPE Deload 단일 규칙 엔진, CLI(simulate/chat), Bun.serve + SSE 서버, 인메모리 세션 스토어.
  서버 경로의 지각(RPE·통증·무게)과 집행(결정 → 세계 상태), `bun run check` + GitHub Actions CI.
- **핵심 갭**: 세션 상태 머신이 enum뿐이고 전이 로직이 없어 `sessionEnd`/`exerciseSwap` 결정이
  발화로만 나가고 집행되지 않음. 대화 이력이 어떤 LLM 호출에도 들어가지 않아 멀티턴 불가.
  운동 DB·매칭 엔진·프로그램 생성·영속성·진행 추적은 전부 미착수.

---

## P0 — 코칭 루프를 실제로 동작하게

### 1. 세션 상태 머신 전이 로직
`src/domain/session-state.ts`에 enum만 존재. "상태 전이 로직은 후속 이슈에서 구현" 주석으로 명시된 부채.

- [ ] 전이 함수 구현: `(현재 상태, Intent | 자동 트리거) → 다음 상태 | InvalidTransitionError`
- [ ] 상태별 의도 유효성 테이블 (CONTEXT "상태별 의도 유효성" — 예: `mainWorkout`에서만 `CompleteSet` 허용)
- [ ] 자동 전이: 휴식 타이머 만료 → `mainWorkout`
- [ ] `ServerBrain`이 세션 상태를 검사·갱신하도록 연결 (현재는 상태 무시)

### 2. Intent 처리 폭 확장 (ServerBrain)
`src/server/process.ts`가 지각(의도 → 세계 상태)과 집행(결정 → 세계 상태)을 담당한다.
상태 머신에 의존하는 세션 생명주기 의도만 남았다.

- [x] `ReportRPE` → 직전 세트 기록에 실제 RPE 반영 (하드코딩 제거)
- [x] `SetLoadTo` / `IncreaseLoad` / `DecreaseLoad` → `currentSet` 무게 갱신
- [ ] `StartSession` / `EndSession` / `PauseSession` / `ResumeSession` → 상태 머신 전이와 연결 (#1 선행)
- [x] `ReportPain` → 부상 대응 3단계(필터링/경고/제안)의 최소 버전: 통증 강도 1~3 경고, 4~6 교체 제안, 7~10 중단 권고
- [~] Intent 분류기(OpenRouter)가 도메인 Intent 22종 중 8종만 지원 → `reportPain` 추가로 9종.
      위 세션 생명주기 의도를 처리할 때 함께 확장한다.
- [x] **Executor** — 결정을 표현보다 먼저 세계 상태에 집행. 무게가 바뀌면 최근 세트 윈도우를
      리셋해 같은 결정이 매 턴 반복되지 않게 한다. (리뷰 1.1)
- [ ] `sessionEnd` / `exerciseSwap` 집행 — 현재는 발화로만 나가고 세계는 그대로다.
      각각 상태 머신(#1)과 운동 DB(#4)가 전제.
- [ ] **코어 추출** — `processUtterance`에서 `SessionStore` 결합을 분리해 엔트리 공용 코어로.
      현재 `cli.ts runChat`과 `server/process.ts`가 같은 4단계(classify → pipeline → synthesize → express)를
      각각 필사하고 있고, 이것이 `server → cli` 역방향 import의 원인. 코어가 생기면 엔트리는 I/O만 담당.
- [ ] **CLI 정리** (코어 추출과 동시) — `src/cli.ts` 삭제 + `package.json`의 `bin`/`start`/`dev` 제거.
      `chat`은 서버 `/utterance`의 상태 없는 복제본(`recentHistory: []` 고정 → 엔진이 구조적으로 항상 `null`).
      `simulate`가 하던 시나리오 주입·엔진 판정 검증은 이미 `scenarios.spec.ts`/`pipeline.spec.ts`가 수행.
      유일한 실손실인 `--llm`(실 LLM 육안 확인)은 #7 평가 하네스의 채점 러너로 복원한다.
      `src/cli/*.ts`는 서버가 쓰는 공용 코드이므로 삭제가 아니라 중립 경로로 이동, `scenarios/*.json`은 존치.

### 3. 결정 엔진 규칙 체이닝
`src/engine/decision-engine.ts`가 단일 규칙(RPE Deload)만 수용. "규칙 체이닝/우선순위는 후속 이슈로 미룬다" 명시된 부채.

- [ ] 규칙 인터페이스 일반화 + 복수 규칙 등록, 우선순위/단락(first-match) 정책 결정
- [ ] 증량 규칙 추가: 목표 반복 성공 + 낮은 RPE 연속 → `deltaKg` 증가 (점진적 과부하의 나머지 절반)
- [ ] `DecisionInput`의 미사용 필드(`program`, `currentSet`)를 실제 소비하는 규칙 도입

## P1 — 도메인 완성의 전제 데이터

### 4. 운동 종목 DB 적재 레이어
CONTEXT "운동 종목 DB" 섹션 전체가 미구현. 매칭 엔진·프로그램 생성·데모 안내(B 전략)의 전제.

- [ ] exercises-dataset(1,324종) JSON 적재: snake_case → camelCase 매핑, `instructions.ko` → `instructionsKo`
- [ ] cardio(~29종) 제외, `performanceKind` 판별 (loadReps/time)
- [ ] 우리 메타 필드 부여 전략 결정: `minimumSkillLevel`, `contraindicatedBodyParts`, `movementPattern`
      (CONTEXT "미정의 사항" 1번 — 수작업 태깅 vs LLM 배치 태깅 vs 규칙 기반)
- [ ] `BodyPart` taxonomy 확정 (현재 `string`으로 열어둠 — 부상 매칭에 필요하므로 union으로 좁히기)

### 5. 매칭 엔진 (User 제약 × Exercise 요구사항)
- [ ] User 제약 타입: 가용 장비, 주당/회당 시간, 종목별 숙련도, 부상 부위
- [ ] 필터링: 장비 미보유 / 숙련도 미달 / `contraindicatedBodyParts` ∩ 부상 부위 → 제외
- [ ] 3단계 대응 연결: 자동 회피 / 경고 후 진행 / 대안 제시 (`SwapExercise` 후보 산출에 재사용)

### 6. 영속성 도입
전부 인메모리(`createInMemorySessionStore`)라 서버 재시작 시 소실. 이력 기반 자동조절(세션 간/프로그램)의 전제.

- [ ] 저장소 인터페이스 정의 (사용 측 관점 — 세션 이력 조회, SetRecord 추가, 프로그램 조회)
- [ ] 구현체 결정: bun:sqlite 우선 검토 (파일 1개, 의존성 0) — 테스트용 fake는 현 인메모리 재사용
- [ ] `SessionSummary` / `TrendAnalysis`를 저장된 이력에서 계산 (현재는 시나리오 JSON에 수기 입력)

## P2 — 자동조절 스코프 확장

### 7. 세션 간 자동조절 (PolicyLLM 실전 투입)
PolicyLLM이 simulate 경로에서만 쓰이고 chat/서버 경로는 `synthesizeDecision` 결정적 합성만 사용.

- [ ] 세션 시작 시(`preCheckin` 완료 후) PolicyLLM 호출: 컨디션 + 저장된 이력/추세 → 오늘 세션 방향
- [ ] 컨디션 체크 플로우: 세션 시작 시 수면/피로/통증/영양 질의 → `ConditionCheck` 생성 (타입만 존재)
- [ ] PolicyDecision → 세션 계획 반영 (deload → 시작 무게 -10% 등)

### 8. 진행 추적 + Personal Record
- [ ] e1RM 계산 (Epley/Brzycki), nRM/볼륨/시간 Personal Record 판정 + 히스토리 보존
- [ ] 세션 종료 시 요약 생성 (평균 RPE, 총 볼륨, 완료율) → 저장소 기록
- [ ] CLI/서버에 조회 노출 (신기록 달성 시 Expression 계층으로 축하 발화)

### 9. 프로그램 생성 (하이브리드)
- [ ] 사용자 입력(목표/장비/스케줄) + 매칭 엔진 후보 → AI가 운동/세트/반복 제안
- [ ] Goal 타입(현재 미사용)과 Program 연결: 모든 Program은 Primary 목표를 가짐
- [ ] time 기반 운동의 프로그래밍 규칙 분리 (CONTEXT "미정의 사항" 2번)

## 기타 (수시 처리)

- [x] `bun test` 스크립트가 package.json에 없음 (`check`에 테스트 미포함) → 추가
- [x] GitHub Actions CI 부재 (`.github`에 PR 템플릿뿐) → `bun run check` + `bun test` 워크플로
- [x] CONTEXT.md 오타: "울동" → "운동" (제약 모델·매칭 엔진 섹션 4곳)
- [ ] 서버 CORS `ALLOWED_ORIGIN = '*'` + secret 미설정 시 무인증 — 공개 배포 전 재검토
