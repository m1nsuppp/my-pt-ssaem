# Agentic AI 트렌드 & 디자인 패턴 — 2026년 8월 스냅샷

2026-08-05 웹 조사 결과. my-pt-ssaem의 설계 리뷰(agentic-design-review.md)에 참조할
현행 키워드·패턴·프로덕션 합의를 정리한다. 출처는 각 섹션 하단.

## 1. 핫 키워드

### 아키텍처 개념

| 키워드 | 정의 |
|---|---|
| **Agent Harness** | *Agent = Model + Harness*. 모델을 제외한 모든 코드·설정·실행 로직(권한, 샌드박스, 승인 플로우, 감사 로그, 컨텍스트 관리). 2026년의 지배적 프레임 — "프로덕션의 한계 요인은 더 이상 모델이 아니라 하네스" |
| **Graph Engineering** | 에이전트 "루프"가 아니라 시스템 **토폴로지**를 설계하는 규율: 어떤 노드(에이전트·결정적 함수·라우터·사람 체크포인트)가 존재하고, 어떤 전이가 허용되며, 런타임 워크 그래프가 어떻게 형성·변이되는가. 2026-07 급부상 — "루프는 에이전트 *행동*을, 그래프는 에이전트 *조직*을 프로그래머블하게 만든다" |
| **Graph Memory / GraphRAG** | 에이전트의 경험·지식을 그래프(개체·관계)로 축적하고 다중 홉 순회로 검색. MemGraphRAG(KDD'26)의 3층 메모리(스키마/사실/원문), 자기진화 그래프 메모리(SAGE) 등 — "기억은 검색되는 게 아니라 재구성된다" |
| **Context Engineering** | 모델이 받는 정보를 무엇을·어떤 구조로·언제 넣을지 설계하는 규율. 프롬프트 엔지니어링을 대체한 용어. 원칙: "압축하기 전에 선별하라(select before compress)", 검색은 고recall 후보 → 재랭킹 top-N |
| **Durable Execution** | 체크포인트·리플레이·복구로 장기 실행 에이전트를 중단/재개 가능하게 만드는 런타임 속성. human-in-the-loop 중단·재개 포함 |
| **Ambient / Background Agents** | 프롬프트 없이 이벤트를 상시 관찰하고 먼저 행동하는 상시 구동 에이전트. reactive → proactive → autonomous가 2026 엔터프라이즈 AI의 서사. 정책 경계 내 동작 + 경계 초과 시 사람에게 에스컬레이션 + 전체 감사 가능성이 요건 |
| **AgentOps / Agent Observability** | 에이전트 런의 모든 스텝을 타입드 span으로 추적. "관측성 없이 'smart'를 출시하는 것"이 대표 안티패턴. 관측 → 평가 → 거버넌스 개선의 루프 |
| **Tool Contracts** | 도구를 엄격한 API로 취급: 타입드/검증된 입력, 멱등 부작용, 구조화 출력 봉투 `{ok, data, error, meta}`, 도구별 예산(타임아웃·재시도·비용). "도구가 시스템 최대의 실패 표면" |
| **Trajectory Evals** | 최종 답이 아닌 **전체 궤적**을 평가: 도구 선택 정확도, 인자 유효성, 스텝 수, 비용, 정책 준수. CI에서는 결정적 도구 fake 사용, LLM-as-judge는 안정성 증명 전까지 불신 |
| **Guardrail Layering / Policy as Code** | 파이프라인 4개 지점(입력·계획·도구 호출·출력)에 다층 안전장치. 정책은 기계가독 형식으로 **LLM 바깥에서** 강제 |
| **Verifiability** | 출력이 객관적으로 검증 가능한 도메인일수록 자동화가 신뢰성 있게 성립한다는 관찰. 검증 루프(테스트 실행, 측정)를 하네스에 내장 |
| **Intent-Based Work** | 사람은 결과를 명세하고 에이전트가 실행 단계를 결정하는 워크플로 |

### 모델/생태계

| 키워드 | 정의 |
|---|---|
| **SLM (Small Language Models)** | 1~12B 모델이 특정 계층(라우팅·분류)에서 대형 모델 대비 ~10배 저비용으로 동급 성능. 계층별 모델 배치의 근거 |
| **Vertical AI Agents** | 도메인 특화 에이전트가 범용을 능가. (my-pt-ssaem이 정확히 이 카테고리) |
| **Agent Skills / Progressive Disclosure** | 능력을 스킬 단위로 패키징하고 필요할 때만 로드 — 시작 시 과도한 도구 적재 방지 |
| **CLI / Browser / Computer-use Agents** | 하네스의 2대 참조 설계: 태스크당 컨테이너 격리형(Codex 계열) vs 로컬 상주 + 행동별 명시 승인형(Claude Code 계열) |
| **RLM (Recursive Language Models)** | 재귀 자기호출로 컨텍스트 한계 밖 입력을 처리하는 모델 |
| **Governance-by-Design** | 거버넌스를 사후 부착이 아닌 아키텍처에 내장. 규제/신뢰가 배포 확대의 enabler라는 인식 전환. Gartner: 2026년 말 엔터프라이즈 앱의 40%가 에이전트 내장 전망 |

### 프로토콜 스택

| 프로토콜 | 역할 | 상태 (2026-08) |
|---|---|---|
| **MCP** (Model Context Protocol) | 에이전트 ↔ 도구/데이터 **수직** 통합 표준 | 월 SDK 다운로드 9,700만 (2026-03), 전 주요 벤더 네이티브 지원 — 사실상 표준 |
| **A2A** (Agent2Agent) | 에이전트 ↔ 에이전트 **수평** 조정. Agent Card 기반 보안 | 50+ 런치 파트너, 엔터프라이즈 기본값으로 수렴 중 |
| **ACP / ANP** | IBM·AGNTCY 계열 에이전트 통신 / 에이전트 네트워크 | MCP+A2A 2층 스택 대비 후순위 |

"MCP는 수직(도구 접근), A2A는 수평(에이전트 협업)"의 2층 스택이 아키텍처 기본값으로 굳는 중.

## 2. 디자인 패턴 카탈로그 (2026 합의)

### 기초 패턴 12종

| 패턴 | 한 줄 정의 | 사용 시점 |
|---|---|---|
| **ReAct** | 추론 ↔ 행동(도구 호출)을 교차하는 루프 | 반복 추론+도구가 필요한 개방형 과제 |
| **Tool Use** | 모델을 텍스트 생성기에서 행위자로 전환 | 학습 데이터 밖 정보/행동 필요 시 |
| **Reflection** | 자기 출력 비판·수정 반복 | 객관적 검증 기준이 있을 때 |
| **Planning** | 과제를 하위 목표로 분해 + 자기 비판 | 적응적 분해가 필요한 다단계 문제 |
| **Prompt Chaining** | 호출 출력을 다음 호출 입력으로 (고정 순서) | 고정 하위 과제로 깔끔히 분해될 때 |
| **Routing** | 입력 분류 후 특화 경로로 분기 | 성격이 다른 과제 카테고리 분리 |
| **Parallelization** | 독립 호출 동시 실행 후 집계 | 독립 하위 과제, 투표 |
| **Orchestrator-Workers** | 중앙 LLM이 워커에 동적 위임·종합 | 런타임 위임 결정이 필요할 때 |
| **Evaluator-Optimizer** | 생성 LLM과 평가 LLM의 역할 분리 | 명시적 품질 보증 |
| **Multi-Agent Collaboration** | 역할별 특화 에이전트 협업 | 단일 컨텍스트를 초과하는 전문화가 진짜 필요할 때 |
| **Human-in-the-Loop** | 승인 게이트/정지 조건 삽입 | 비가역 행동, 감독 필요 지점 |
| **Topology (Chain/Star/Mesh)** | 멀티에이전트 통신 구조 선택 | 멀티에이전트 설계 시 |

### 프로덕션 신흥 패턴

- **Context Engineering** — 컨텍스트의 선별·압축·격리 (위 키워드 참조)
- **Bounded Execution / Circuit Breaker** — 스텝 수·도구 호출·비용 상한 + 멱등 도구 설계. 모든 프로덕션 배포의 기본
- **Guardrail Layering** — 4개 실행 지점의 심층 방어

### 합성 관행과 반(反)트렌드

- 전형적 합성: 전면 Routing → Orchestrator-Worker 파이프라인 → 최종 출력에 Evaluator-Optimizer, 워커 내부는 ReAct.
- **반트렌드 (중요)**: "멀티에이전트가 필요해 보이는 과제 대부분은 **좋은 도구를 가진 단일 ReAct 에이전트**로 해결된다. 전문화는 그것으로만 풀리는 명확한 성능 실패가 확인된 후에만 추가하라." — 2026년 패턴 가이드들의 공통 경고. (AGENTS.md의 "추상화는 3회 반복 후" 원칙의 에이전트판)
- **Loop → Graph 논쟁 (2026-07)**: "아직 루프 얘기 중인가, 그래프로 넘어갔나"(P. Steinberger)를 계기로 Graph Engineering 어휘가 급확산. 루프는 순차라 동시성이 비효율(리뷰어 3명을 동시에 디스패치 못 함)이라는 것이 논지. 단 당사자들도 인정하는 맥락: "2025년의 LangGraph·AutoGen·Google ADK가 못 하던 것이 새로 생긴 건 없다 — **새로운 것은 어휘다**." 위 반트렌드와 모순되지 않는다: 그래프의 노드는 에이전트만이 아니라 결정적 함수·라우터·사람 체크포인트를 포함하므로, 단일 에이전트 시스템도 그래프로 설계할 수 있다.

## 3. 프로덕션 아키텍처 합의

### 에이전트 코어 루프

```
read state → plan → execute(도구/메시지) → observe → update state → 반복
```

"채팅 이력에 append"만 하는 구조는 안티패턴. LLM의 결정(확률적)과 상태 갱신(결정적)을 분리하는
**reducer 패턴**이 리플레이·디버깅을 가능하게 한다.

### 메모리 4층 모델

| 층 | 내용 | 저장 |
|---|---|---|
| Working | 진행 중 사고/계획 | 상태 객체 (프롬프트 아님) |
| Conversation | 최근 N턴 + 롤링 요약 (의도적 손실) | 세션 상태 |
| Task | 구조화 산출물·결정·로그 | DB (임베딩 아님) |
| Long-term | 안정적 선호 (명시 동의 후) | DB |

경고: "핵심 사실(critical facts)은 벡터가 아니라 DB에" — 벡터 검색은 문서 컨텍스트용.

### 하네스 구성요소 (LangChain 해부 기준)

저장/상태(파일시스템·git) · 실행(코드 실행·샌드박스) · 관찰/검증(자기 검증 루프: 실행→테스트→수정) ·
지식(AGENTS.md 표준, MCP, 웹 검색) · 컨텍스트 최적화(압축, 도구 출력 오프로딩, 스킬식 점진 공개).
설계 권고: **원하는 에이전트 행동에서 역산**해 하네스 기능을 정한다.

## 4. 음성/실시간 에이전트 (my-pt-ssaem 로드맵 관련)

- 2대 아키텍처: **cascade 파이프라인**(mic → VAD → 스트리밍 STT → endpointing → LLM → 스트리밍 TTS)
  vs **S2S**(speech-to-speech 단일 모델).
- 2026 프로덕션 합의: **cascade가 여전히 정답** — 제어 표면·관측성·컴포넌트 생태계 성숙도가 S2S의 지연 이점을 상회.
- 지연 벤치마크: 프로덕션 중앙값 p50 680ms / p95 1,180ms. 이종 벤더 조합 600~1,700ms, 동일 네트워크 co-location 시 200ms 미만.
- 성립 요건: 스트리밍 전 구간 관통(STT·LLM·TTS 모두), 학습 기반 turn detection(무음 임계치보다 우수), 결정적 barge-in(끼어들기 처리).
- 함의: LLM 계층이 `Promise<string>`이면 cascade에 편입 불가 — 스트리밍 인터페이스가 전제 조건.

## 5. my-pt-ssaem 매핑 — 키워드 → 설계 리뷰 항목

| 2026 키워드/패턴 | agentic-design-review.md 항목 |
|---|---|
| 코어 루프 (execute/observe 부재) | 1.1 행동 미집행, 1.2 지각 하드코딩 |
| Context Engineering | 1.3 Context Assembler |
| Ambient / Proactive Agents | 1.4 능동성 부재 |
| 메모리 4층 모델 | 1.5 세계 모델 재정의 |
| 단일 ReAct + Tool Use (멀티에이전트 반트렌드) | 2.1 tool-calling 전환 — 에이전트 추가가 아니라 도구 추가가 답 |
| Tool Contracts / 구조화 출력 강제 | 2.2 단일 원천화, 2.3 침묵 폴백 제거 |
| SLM 계층 배치 | 2.5 계층별 모델 정책 (intent → SLM) |
| Cascade 음성 파이프라인 | 2.6 스트리밍 인터페이스 |
| Guardrail Layering / Policy as Code | 3.1 가드레일, 3.2 통증 하드룰 |
| Human-in-the-Loop 승인 게이트 | 3.3 제안-수락 루프 |
| Durable Execution / reducer 패턴 | 3.4 턴 직렬화, 3.5 감사 로그 |
| AgentOps typed span / Trajectory Evals | 4. 관측성·평가 하네스 |
| Graph Engineering | 6. 타깃 아키텍처 — 파이프라인이 곧 타입드 노드 그래프(결정적 함수 + LLM 노드 + HITL 체크포인트, 상태 머신 = 허용 전이) |
| MCP | 6. 운동 DB·이력 도구의 노출 형식 후보 |
| Vertical Agent / Verifiability | 프로젝트 포지셔닝 — RPE·기록 등 검증 가능 신호가 풍부한 도메인 |

## 참고 자료

- [Firecrawl — Top 15 Agentic AI Trends 2026](https://www.firecrawl.dev/blog/agentic-ai-trends)
- [Augment Code — Agentic Design Patterns 2026 Catalog](https://www.augmentcode.com/guides/agentic-design-patterns)
- [LangChain — The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness)
- [Andrii Furmanets — AI Agents in 2026: Tools, Memory, Evals, Guardrails](https://andriifurmanets.com/blogs/ai-agents-2026-practical-architecture-tools-memory-evals-guardrails)
- [Zylos Research — Agent Interoperability Protocols 2026 (MCP/A2A/ACP)](https://zylos.ai/research/2026-03-26-agent-interoperability-protocols-mcp-a2a-acp-convergence/)
- [Zylos Research — Durable Execution for Agent Runtimes](https://zylos.ai/research/2026-04-24-durable-execution-agent-runtimes/)
- [Atlan — AI Agent Harness Tools 2026](https://atlan.com/know/best-ai-agent-harness-tools-2026/), [Agent Observability Guide](https://atlan.com/know/ai-agent-observability/)
- [BoringBot — AI Agent Harnesses Explained](https://boringbot.substack.com/p/ai-agent-harnesses-explained-architecture)
- [SitePoint — Definitive Guide to Agentic Design Patterns 2026](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)
- [Softcery — Real-Time vs Turn-Based Voice Agents 2026](https://softcery.com/lab/ai-voice-agents-real-time-vs-turn-based-tts-stt-architecture), [DestiLabs — Voice Agent Benchmark 2026](https://www.destilabs.com/blog/ai-voice-agent-benchmark-2026)
- [Curious Compass — The Rise of Ambient Agents](https://curiouscompass.substack.com/p/ambient-ai-enterprise-invisible-ai-agents)
- [MachineLearningMastery — 7 Agentic AI Trends 2026](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)
- [TrueFoundry — Graph Engineering for Multi-Agent Systems](https://www.truefoundry.com/blog/graph-engineering-enterprise-guide), [AI Builder Club — Graph Engineering Guide 2026](https://www.aibuilderclub.com/blog/graph-engineering-guide-2026)
- [FalkorDB — Graph Database AI Agents: GraphRAG & Memory](https://www.falkordb.com/blog/graph-database-ai-agents/), [Memory is Reconstructed, Not Retrieved (arXiv)](https://arxiv.org/pdf/2606.06036)
