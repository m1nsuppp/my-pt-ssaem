# Agentic AI System 설계 리뷰

이슈 2~8 완료 시점 코드베이스를 "에이전틱 AI 시스템의 토대로 적절한가" 관점에서 리뷰한다.
기능 갭 목록은 action-items.md에, 용어·패턴의 출처와 정의는 agentic-ai-trends-2026.md에 있다.
이 문서는 **구조적 설계 판단**만 다루며, 각 항목에 해당하는 2026 표준 패턴명을 `[패턴: …]`으로 표기한다.

## 요약

2026년의 지배적 프레임은 **Agent = Model + Harness** — 모델을 제외한 모든 실행 로직(상태, 도구, 가드레일,
승인, 감사, 컨텍스트 관리)이 에이전트의 성패를 가른다. 이 기준으로 보면 현재 코드는 **모델 호출부는 있으나
하네스가 없다**. 계층 분리(Intent/Policy/Expression)와 래핑 원칙은 좋은 뼈대지만, 프로덕션 경로(server)는
에이전트가 아니라 페르소나 목소리를 입힌 단발 NLU 파이프라인이다.

에이전트 코어 루프는 `read state → plan → execute → observe → update state`의 반복인데, 현 구조는
이 루프의 세 마디가 끊겨 있다:

1. **행동(execute) 미집행** — 결정(weightAdjustment)이 세션 상태에 반영되지 않는다. 에이전트가 말만 하고 행동하지 않는다.
2. **지각(observe) 하드코딩** — 세트 기록의 RPE가 8로 고정되어, 유일한 규칙(RPE≥9 디로드)이 서버 경로에서 **절대 발화할 수 없다**. 사용자가 RPE를 보고해도 무시된다.
3. **상태(state) 부재** — 어떤 LLM 호출도 대화 이력을 받지 않는다. 멀티턴 대화가 구조적으로 불가능하다.

방향 제언을 한 줄로 요약하면: **에이전트를 더 만들지 말고 하네스를 만들어라.** 2026년 패턴 가이드들의
공통 경고("멀티에이전트처럼 보이는 과제 대부분은 좋은 도구를 가진 단일 ReAct 에이전트로 해결된다")가
이 프로젝트에 정확히 적용된다 — 필요한 것은 루프·도구·가드레일이지 에이전트 증식이 아니다.

---

## 1. 에이전트 코어 — 루프가 없다

### 1.1 결정이 세계에 반영되지 않음 (execute 부재) — 심각도 최상

`src/server/process.ts:66-113`의 처리 흐름은 분류 → 판정 → 발화 생성으로 끝난다.
`weightAdjustment` 결정이 나와도 `record.state.currentSet.weightKg`를 **아무도 갱신하지 않는다**.
"다음 세트는 5kg 내릴게요"라고 말한 직후의 다음 발화도 변경 전 상태로 처리된다.

- 에이전트 관점: 발화(narration)와 행동(execution)이 분리되어 있고 행동 쪽이 없다. LLM의 자유 텍스트가 시스템의 유일한 실질 출력이다.
- 제안 `[패턴: 코어 루프 + reducer]`: **Executor 단계 도입** — 결정을 상태 머신 전이 + 세계 상태 변경으로 집행한다. LLM의 결정(확률적)과 상태 갱신(결정적 reducer)을 분리하면 리플레이·디버깅도 얻는다. Expression은 *집행된* 행동의 렌더링만 담당하고, 메시지는 행동의 파생물이어야 한다.

### 1.2 지각이 하드코딩되어 결정 로직이 사문화됨 (observe 부재) — 심각도 최상

`src/server/process.ts:73-85`는 `CompleteSet`일 때 `rpe: 8`, `actualReps = plannedReps`(항상 완벽 수행)로
합성 기록을 쌓는다. 서버 기본 규칙은 `thresholdRpe: 9`(`src/cli/scenarios.ts:191`)이고 판정은
`set.rpe >= thresholdRpe`(`src/engine/rules/rpe-deload.ts:61`)이므로 **8 ≥ 9는 영원히 거짓** —
프로덕션 경로에서 엔진은 항상 `null`, 결정은 항상 `continue`다. 유일한 자동조절 규칙이 simulate + 수기 JSON에서만 동작한다.

- `ReportRPE` intent는 분류기가 지원하지만(`src/llm/openrouter/index.ts:380`) 브레인이 버린다. 사용자가 "RPE 9.5였어"라고 말해도 세계 모델에 기록되지 않는다.
- 이 도메인은 **Verifiability가 높은 도메인**(RPE, 세트 기록, 볼륨 — 전부 측정 가능)이라 에이전트 자동화에 유리한데, 정작 그 신호를 버리고 있다.
- 제안: 의도 → 세계 상태 갱신 매핑을 1급 로직으로. `ReportRPE`는 직전 세트에 기록, `CompleteSet`은 RPE 미보고 시 되묻거나 `undefined`로 기록(가짜 8 금지 — "버그를 숨기지 않는다" 원칙 위반이기도 함).

### 1.3 대화 이력이 어떤 LLM 호출에도 없음 — 심각도 최상 `[패턴: Context Engineering]`

- IntentClassifier는 현재 발화 텍스트만 받는다(`src/llm/openrouter/index.ts:424-437`). 세션 상태도, 직전 턴도 모른다. "그럼 5kg만 내려줘", "아까 말한 걸로 할게" 같은 지시대명사·생략 발화를 해석할 방법이 없다.
- ExpressionLLM 호출 시 `sessionContext`를 지원하는데도(`src/llm/expression.ts:22`) `process.ts:89-92`가 전달하지 않는다. 코치가 세션 진행 상황을 전혀 모른 채 말한다.
- 제안: **Context Assembler 계층** — 매 턴 "LLM이 보는 것"(대화 최근 N턴 + 롤링 요약, 세션 상태 머신 컨텍스트, 기록에서 파생한 이력 요약)을 조립하는 단일 지점을 만든다. 2026년의 컨텍스트 엔지니어링 원칙 그대로: 압축 전에 선별하고, 컨텍스트를 계층(작업/대화/과제/장기)으로 나눠 관리한다. 에이전틱 시스템의 심장은 이 조립 정책이다.

### 1.4 순수 반응형 — 능동성 부재 `[패턴: Ambient/Proactive Agent]`

코치는 먼저 말을 거는 에이전트다: 휴식 타이머 만료 → "다음 세트 가시죠", 무응답 → 체크인.
CONTEXT.md도 자동 전이(타이머 만료 → mainWorkout)를 명시한다. 2026년 용어로 이 제품의 지향점은
**ambient agent**(이벤트를 상시 관찰하고 정책 경계 안에서 먼저 행동)인데, 현 구조는 인바운드 발화로만
구동되는 순수 reactive다. SSE 푸시 채널은 이미 있으나(잘 만든 부분) 타이머/자동 전이가 브레인에 유입될 통로가 없다.

- 제안: 사용자 발화와 시스템 이벤트(타이머, 상태 전이)가 **같은 브레인 입력 큐**로 합류하는 이벤트 루프 구조. `processUtterance(sessionId, text)` 시그니처를 `processTurn(sessionId, TurnInput)`(발화 | 시스템 이벤트)로 일반화. ambient agent의 요건(정책 경계, 에스컬레이션, 감사 가능성)은 3장의 가드레일·감사 로그와 같은 기반을 공유한다.

### 1.5 세계 모델이 시연용 픽스처 `[패턴: 메모리 4층]`

세션 상태의 실체가 `ScenarioState`(`src/cli/scenarios.ts:24-33`) — simulate용 픽스처를
`structuredClone(DEFAULT_CHAT_STATE)`로 복제해 프로덕션 세션으로 쓴다(`src/server/session-store.ts:50`, `src/server.ts:76`).

- `userId` 개념이 없다 — 세션이 회원에게 귀속되지 않아 사용자 단위 기억이 원천 불가능.
- `exerciseId` 하나 + `currentSet` 하나 — Workout/WorkoutExercise 타입이 있는데도 운동 여러 개를 진행할 수 없는 세계 모델.
- 엔진 튜닝값(`rule.thresholdRpe` 등)이 세션 상태 안에 산다 — 설정과 세계 상태의 혼합.
- `policy` 컨텍스트(컨디션/추세/세션 요약)가 수기 스냅샷 — 에이전트의 "이력 인식"이 기록에서 파생되지 않는 허구다.
- 제안: 2026 메모리 4층 모델로 재편성 —

| 층 | 이 프로젝트에서 | 현재 상태 |
|---|---|---|
| Working | SessionStateContext(상태 머신, 진행 커서) | 타입만 있고 미연결 |
| Conversation | 대화 최근 N턴 + 롤링 요약 | 없음 |
| Task | SetRecord, 결정 로그, 세션 요약 | 인메모리 배열, 휘발 |
| Long-term | 사용자 프로필(제약, 부상 이력, 수정 선호) | 없음 (userId조차 없음) |

핵심 사실(기록, Personal Record)은 DB에 — "critical facts는 벡터가 아니라 DB에"가 2026 합의다.
ScenarioState는 테스트 픽스처로 강등한다.

## 2. LLM 경계 설계 — 닫힌 분류가 정보를 파괴한다

### 2.1 닫힌 Intent 집합 병목 + AskQuestion 블랙홀 `[패턴: 단일 ReAct + Tool Use]`

classify-then-act(닫힌 22종 중 8종 분류 → 룩업)는 Dialogflow 세대 NLU 설계다. 2026년 표준은
**tool-calling 루프** — LLM이 컨텍스트를 보고 타입드 액션(도구)을 직접 선택하거나 답변한다. 현 구조의 실손실:

- 복합 발화 파괴: "무게 100으로 하고 아까 세트 RPE 9였어" → 의도 1개만 살아남음.
- `AskQuestion`은 블랙홀: 분류 후 `synthesizeDecision`이 `continue`("부하 조정 없음")로 맵핑(`src/cli/pipeline.ts:152-156`) → 질문에 **답하지 않고** 페르소나가 continue를 낭독한다. "스쿼트 무릎 각도 어떻게 해?" → "오늘도 계획대로 가보죠" 같은 동문서답이 정상 동작 경로다.
- 버튼 입력도 LLM을 경유: CONTEXT.md는 버튼→발화 정규화를 명시하지만, 버튼은 이미 구조화된 입력이다. 정규화 목표 지점은 utterance가 아니라 **Intent**여야 한다. API에 `POST { intent }` 직행 경로 추가 필요.
- 제안: Policy 턴을 tool-calling 루프로 — 도구(이력 조회, 운동 DB 검색, e1RM 계산, 부하 조정 제안)를 노출하고 Intent union을 도구 스키마의 단일 원천으로 삼는다. 단순 확인 응답("네")은 LLM 없이 결정적 fast-path로. **멀티에이전트로 가지 않는다** — "전문화는 그것으로만 풀리는 명확한 성능 실패가 확인된 후에만"이 2026 공통 경고이고, 이 과제는 좋은 도구를 가진 단일 에이전트 루프의 전형적 사례다.

### 2.2 Intent 정의가 5중으로 드리프트

같은 의도 집합이 5곳에 독립 정의된다: 도메인 union(PascalCase 22종, `src/domain/intent.ts`),
OpenRouter 프롬프트(camelCase 8종, `openrouter/index.ts:83-91`), zod 스키마(8종, `:374-383`),
`parseIntent` 수동 매핑 switch(`:392-409`), fake 키워드 테이블(`src/llm/fake.ts:194-223`).
의도 1개 추가 = 최소 4~5곳 수정. 스키마 생성(도메인 union → zod → 도구/JSON 스키마 → 프롬프트)으로
단일 원천화해야 한다. 2.1의 tool-calling 전환 시 도구 스키마가 자연스럽게 그 단일 원천이 된다.

### 2.3 침묵 폴백 — 실패가 "계속 운동하세요"로 수렴 `[패턴: Tool Contracts]`

정규식 JSON 추출(`extractJsonText`, `openrouter/index.ts:170-176`) 후 파싱 실패 시:
Policy는 `CONTINUE_DECISION`(confidence 0.3, `:93-97`), Intent는 `AskQuestion`(→ 결국 continue).
재시도 없음, 에러 표면화 없음, 텔레메트리 없음. **모든 실패 모드가 "운동을 계속하라"는 결정으로 붕괴**한다.
신체 부하를 지시하는 에이전트에서 이는 안전 문제이자, AGENTS.md의 "버그를 숨기지 않고 throw한다" 원칙 위반이다.

- 제안: provider의 구조화 출력(JSON schema / tool call 강제)으로 정규식 파싱 자체를 제거. LLM 계층의 반환을 tool-contract 스타일 봉투(`{ok, data, error, meta}`)로 통일하고, 실패 시 에러 피드백 포함 유한 재시도 → 최종 실패는 throw. "LLM이 판단 불가"(→ 되묻기)와 "파싱 실패"(→ 재시도)를 구분한다.

### 2.4 표현이 결정에 결속되지 않음

Expression의 "결정 자체는 변경하지 말고"는 프롬프트 지시일 뿐(`openrouter/index.ts:270`) 구조적 보장이 없다.
결정은 -5kg인데 발화가 "+5kg 올려보죠"여도 아무것도 걸러내지 못한다. 1.1의 Executor가 생기면 자연 해소되는
문제이기도 하다: 행동이 먼저 상태에 집행되고, 발화는 집행 결과의 렌더링이며, 렌더링 오류는 상태를 오염시키지
못한다. 추가로 발화 속 수치(kg, 세트 수)가 결정과 일치하는지 결정적 후검증(출력 지점 가드레일)을 둘 수 있다.

### 2.5 계층별 모델/지연/비용 정책이 없음 `[패턴: SLM 계층 배치]`

`createOpenRouterLLMs`(`openrouter/index.ts:466`)가 단일 모델을 3계층에 공유한다. 2026년의 관행은
계층별 배치다: Intent/라우팅 = **SLM**(1~12B, ~10배 저비용으로 분류엔 동급), Policy = 최고 추론 모델,
Expression = 문체 품질 + **스트리밍** 지원 모델. 지연 예산도 미검토: 발화당 LLM 2회 직렬 호출인데
실시간 코칭의 프로덕션 벤치마크는 음성 기준 p50 680ms다(4장). 세션·사용자 단위 비용 계정과
provider 장애 폴백 체인도 없다(`maxCost`는 호출 단위 옵션일 뿐).

### 2.6 스트리밍이 인터페이스 차원에서 막힘 `[패턴: cascade 음성 파이프라인]`

`ExpressionLLM.express: Promise<string>`(`src/llm/expression.ts:54`)은 토큰 스트리밍을 구조적으로 차단하고,
`chunkMessage`(`src/server/process.ts:45-59`)가 완성된 메시지를 30자로 잘라 **가짜 스트리밍**을 만든다.
실시간 음성 코칭의 2026 표준 아키텍처는 cascade 파이프라인(VAD → 스트리밍 STT → endpointing → LLM →
스트리밍 TTS)이고, 성립 조건이 **전 구간 스트리밍 관통**이다 — LLM 계층이 `Promise<string>`이면 이 파이프라인에
편입될 수 없다. SSE 배관은 이미 델타 전송이 가능하므로 병목은 LLM 인터페이스뿐. `express`를
`AsyncIterable<string>`(또는 스트림/일괄 병행)으로 재설계해야 한다. barge-in(끼어들기)·turn detection은
그다음 과제다.

## 3. 안전·신뢰성 — 신체 부하를 지시하는 에이전트의 의무

### 3.1 LLM 외부 가드레일 계층 부재 `[패턴: Guardrail Layering + Policy as Code]`

`PolicyDecision.details.weightDelta`는 무제한 — LLM이 +40kg을 내놓아도 검증 없이 페르소나가 낭독한다.
`suggestedExercise`는 자유 텍스트 — 운동 DB 대조도, 금기(부상 부위) 대조도 없다.
도메인이 명시한 하드 룰(통증 7~10 → 즉시 중단)은 프롬프트가 아니라 **기계가독 정책(policy as code)으로
LLM 바깥에서** 강제해야 한다 — 2026 가드레일 설계의 제1원칙이다.

- 제안: 입력·계획·도구 호출·출력 4개 지점의 다층 가드레일 중 최소 2개부터 — (a) 결정 집행 전 검증/클램프(현재 무게 대비 최대 변화율, 금기 매트릭스, 세션 상태 유효성), (b) 출력 후검증(2.4). 위반 시 재프롬프트 또는 결정적 안전 행동으로 폴백. 여기에 **Bounded Execution**(턴당 도구 호출·비용·재시도 상한)을 함께 둔다.

### 3.2 통증 리포트가 블랙홀 — 구체 실패 시나리오

`ReportPain`은 도메인에 있지만 분류기 8종에 없고 브레인도 처리하지 않는다. 현재 시스템에서
**"무릎이 아파요" → askQuestion 분류 → continue 합성 → 케어형 코치가 "좋아요, 계속 가보죠"**가
정상 동작이다. 도메인 문서의 3단 대응(필터링/경고/제안)과 통증 스케일이 코드에 전혀 없다.
안전 관련 의도는 LLM 분류와 무관하게 결정적 키워드 매칭으로도 잡는 이중화(가드레일의 입력 지점)가 필요하다.

### 3.3 confidence는 장식이고, 제안-수락 루프가 없다 `[패턴: Human-in-the-Loop]`

confidence가 규칙 설정·LLM 자기보고·합성 결정에 두루 존재하지만 **아무도 소비하지 않는다**
(표현 프롬프트에 문자열로 흘러갈 뿐). LLM 자기보고 confidence는 보정되지 않은 값이라 제어 신호로 부적합.
CONTEXT.md는 "사용자는 AI 제안을 언제든 수정 가능"을 명시하는데, 인터랙션에 제안→수락/거절 루프가 없다 —
결정은 통보될 뿐이다. 2026 패턴으로는 **HITL 승인 게이트**: 결정에 `requiresConfirmation` 플래그를 두고,
비가역/고위험 행동(큰 증량, 운동 교체, 프로그램 변경)은 회원의 수락을 거쳐 집행한다. 이 도메인의 "human"은
운동 중인 회원 본인이므로 승인 UX가 자연스럽다("5kg 내릴까요?" → "네").

### 3.4 턴 직렬화·상관관계 부재 `[패턴: Durable Execution]`

동일 세션에 동시 POST 2건이 오면 둘 다 `record.state`를 읽고 변형하며(`recentHistory.push`),
SSE 버퍼에 이벤트가 뒤섞인다. 이벤트에 turn id가 없어 어느 발화의 결과인지 구분 불가.
상태 머신이 도입되면 순서 보장은 정합성의 전제다. 세션당 FIFO 큐(직렬 처리) + 턴 id 부여가 1단계,
장기적으로는 durable execution 속성(턴 단위 체크포인트, 중단 후 재개, 리플레이)을 갖춘 런타임으로 —
1.1의 reducer 패턴이 그 기반이 된다.

### 3.5 결정 감사 로그 부재

사람의 훈련 부하를 바꾸는 결정이 인메모리 이벤트로만 존재한다. 턴 단위로
`{입력 컨텍스트, 프롬프트, 모델/파라미터, 원시 응답, 파싱된 결정, 집행된 행동, 이후 결과}`를 영속 기록해야
디버깅·신뢰·평가가 가능하다. 도메인의 "AI는 사용자 수정 이력을 학습" 요구도 이 로그가 전제다.
ambient agent(1.4)의 요건인 "전체 감사 가능성"과 같은 기반이다.

## 4. 운영·진화 — 동작을 측정할 수단이 없다 `[패턴: AgentOps + Trajectory Evals]`

- **관측성 없음**: 2026 합의는 "에이전트 런의 모든 스텝을 타입드 span으로" + "관측성 없이 'smart'를 출시하는 것"이 대표 안티패턴. LLM 호출별 지연/토큰/비용 추적이 없고, `session-store.ts:73-77`은 구독자 예외까지 침묵 삼킴. 최소한 턴 단위 trace(NDJSON이라도)부터. 3.5의 감사 로그와 스키마를 공유하면 된다.
- **평가 하네스 없음**: 평가 대상은 최종 답이 아니라 **궤적**(의도 분류 정확도, 결정 종류, 조정량 범위, 정책 준수)이다. scenarios/*.json + simulate는 자연스러운 eval 씨앗인데 시나리오 1개, 기대 결과 필드 없음, 채점 러너 없음. fake는 배관을 검증할 뿐 **프롬프트 품질은 아무도 검증하지 않는다** — `DECISION_SYSTEM_PROMPT`를 고장 내도 잡을 테스트가 없다. 시나리오에 `expected: { kind, deltaRange }`를 추가하고 채점 러너를 만든다. CI는 결정적 fake로(이미 있음 — 강점), 실 LLM 평가는 별도 트랙으로. LLM-as-judge는 안정성이 증명되기 전까지 채점자로 쓰지 않는다.
- **무한 성장**: `record.events`와 `recentHistory`가 세션 수명 동안 무한 성장, 신규 SSE 구독자에게 전체 이력 재생(`session-store.ts:82-84`). 대화 메모리는 "최근 N턴 + 롤링 요약(의도적 손실)"로 관리하는 것이 표준이다.

## 5. 잘 된 지점 — 유지할 것

| 설계 | 왜 좋은가 (2026 관점) |
|---|---|
| LLM provider 래핑 (인터페이스 우선) | 계층별 모델 배치(SLM/대형/스트리밍)·provider 교체가 저비용. AGENTS.md 원칙 준수 |
| Policy / Calculation / Expression 분리 | "LLM은 방향, 엔진은 계산, LLM은 문체만" — 확률적 결정과 결정적 계산의 분리는 reducer 패턴과 같은 정신. 강제 장치만 없을 뿐 |
| 결정적 엔진의 LLM 분리 | policy-as-code 가드레일이 자랄 자리가 이미 있음 |
| 3계층 전부 fake 구현 | "CI는 결정적 도구 fake로"라는 2026 eval 관행을 이미 충족 |
| SSE 이벤트 스트림 | ambient/proactive 전환과 실시간 스트리밍의 올바른 기반. 턴 id와 영속화만 더하면 됨 |
| 시나리오 JSON | trajectory eval 하네스의 씨앗 |
| 단일 에이전트 구조 | 멀티에이전트 반트렌드에 부합 — 이 과제는 도구 좋은 단일 루프가 정답 |

## 6. 권장 타깃 아키텍처와 이행 순서

```
사용자 발화(텍스트/버튼→Intent 직행) ─┐
타이머·자동 전이(시스템 이벤트) ───────┴→ [세션별 턴 큐(직렬, 턴 id)]        ← Durable Execution
    → Context Assembler (대화 이력 + 세션 상태 + 기록 파생 추세)            ← Context Engineering
    → Policy 턴 (단일 LLM tool-calling 루프: 이력조회/운동DB/계산기/조정 제안) ← ReAct + Tool Use
    → Guardrails (물리 한계·금기·상태 유효성 검증, 통증 하드룰, 실행 상한)     ← Guardrail Layering + Bounded Execution
    → HITL 게이트 (고위험 결정은 회원 수락 후 집행)                          ← Human-in-the-Loop
    → Executor (상태 머신 전이 + 세계 상태 갱신 + 감사 로그)                 ← reducer + AgentOps
    → Expression (집행 결과를 페르소나로 스트리밍 렌더 — 결정 권한 없음)       ← cascade 파이프라인 대비
```

참고 1: 2026-07 부상한 **Graph Engineering** 어휘로 보면 위 파이프라인이 곧 타입드 노드 그래프다 —
노드는 결정적 함수(Assembler/Guardrails/Executor)·LLM 노드(Policy/Expression)·사람 체크포인트(HITL 게이트),
허용 전이는 세션 상태 머신. 멀티에이전트 없이도 이 설계 어휘가 그대로 적용되며, 체크포인트를 내장한
그래프 런타임을 채택하면 3.4의 durable execution을 런타임에서 얻는 경로도 열린다(자체 구현과 비교 검토).

참고 2: 운동 DB·이력 조회 도구는 내부 함수로 시작하되, 인터페이스를 도구 스키마로 정의해 두면
추후 MCP 서버로 노출(다른 하네스에서 재사용)하는 전환이 값싸다.

이행 순서 (action-items.md 번호와 연결):

1. **Executor + 실지각** — 결정의 상태 반영, RPE 하드코딩 제거, 상태 머신 연결 (AI #1·#2와 동일 작업의 구조 버전)
2. **Context Assembler** — 대화 이력 보존·주입, sessionContext 전달 (신규)
3. **침묵 폴백 제거 + 구조화 출력** — provider 스키마 강제, 재시도 후 throw (신규)
4. **가드레일 + 통증 하드룰 + HITL 플래그** — LLM 외부 불변식 (AI #2의 ReportPain 항목을 구조화)
5. **턴 직렬화 + 턴 id + 감사 로그** — 영속성 도입(AI #6)과 함께
6. **Intent 단일 원천화 → tool-calling 전환** — 5중 정의 해소 (AI #2 확장의 전제)
7. **평가 하네스** — 시나리오에 기대 결과 추가, trajectory 채점 러너 (신규)
8. **스트리밍 인터페이스 + 계층별 모델 정책(SLM)** — 실시간 코칭 준비 (신규)
