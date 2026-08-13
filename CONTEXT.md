# Personal Trainer AI Agent — 도메인 모델

## 핵심 개념

### 프로그램 (Program)
- 트레이너(AI)가 회원을 위해 수립하는 **주 단위 운영 계획**.
- 여러 개의 워크아웃 템플릿으로 구성.
- **주기화(Periodization)**: 시간에 따라 루틴이 변화할 수 있음 (1~4주차, 5~8주차 등).
- 회원은 동시에 하나의 활성 프로그램을 가질 수 있음.

### 워크아웃 (Workout)
- 특정 날짜/순서에 수행하는 **운동 1회의 계획**.
- 요일별 분할이 가능 (Push/Pull/Legs, 상체/하체 등).
- 동일한 프로그램 내에서 여러 워크아웃 템플릿이 존재할 수 있음.

### 운동 종목 (Exercise)
- 하나의 워크아웃을 구성하는 **개별 운동 동작**.
- 세트 × 횟수 × 무게로 표현.

### 세트 기록 (Set Record)
- 회원이 실제로 수행한 **세트별 결과**.
- 목표치 대비 실제 수행량을 기록.

### 컨디션 체크 (Condition Check)
- 세션 시작 전, 회원의 **현재 상태**를 확인하는 절차.
- 수면, 피로도, 통증 부위, 영양 상태 등.

### 점진적 과부하 (Progressive Overload)
- 시간이 지남에 따라 무게, 횟수, 세트를 **점진적으로 증가**시키는 원칙.
- 프로그램의 핵심 전제.

### 분할 (Split)
- 워크아웃을 **부위별로 나누는 방식**.
- Push/Pull/Legs, 상체/하체, 전신 등.

### 운동 이력 (Exercise History)
- 회원의 **과거 수행 기록 전체**.
- 이를 기반으로 프로그램을 조정하고 점진적 과부하를 계산.

## AI Agent

### 페르소나 (Persona)
- 사용자가 선택하는 **AI 코치의 성격/말투**.
- 도메인(운동 계획, 기록)은 동일하고 **표현 방식만 달라짐**.
- 강성(동기부여형), 부드러움(케어형), 분석형(데이터 중심) 등.

## 제약 모델 (User / Exercise 매칭)

### User의 제약
- **가용 장비** — 회원이 접근 가능한 장비 목록 (맨몸, 맨매트, 덤벨, 바벨, 풀랙 등)
- **운동 가용 시간** — 주당 가능 횟수, 회당 가능 시간
- **종목별 숙련도** — 운동별로 다른 수준일 수 있음 (스쿼트 중급, 데드 초급 등)
- **부상/주의 부위** — 피해야 할 신체 부위

### Exercise의 요구사항
- **필요 장비** — 이 운동을 수행하는 데 필요한 장비
- **주의 부위** — 이 운동이 부담을 주는 신체 부위
- **최소 숙련도** — 이 운동을 안전하게 수행하기 위한 최소 수준

### 매칭 엔진
- 프로그램 생성 시 User 제약과 Exercise 요구사항을 대조하여 적절한 운동을 필터링.

## 인터랙션 모델

### 의도(Intent) 기반 통합
세가지 모드(채팅/음성/비동기)는 도메인에서 **하나로 통합**:

```
User Input (채팅/음성/버튼)
    ↓ 정규화
User Utterance (사용자 발화)
    ↓ 해석
Intent (의도) + 파라미터
    ↓ 실행
Domain Action (도메인 액션)
```

### 의도 분류

**세션 라이프사이클**
- `StartSession` / `EndSession` / `PauseSession` / `ResumeSession`

**세트/운동 진행**
- `CompleteSet` / `CompleteExercise` / `SkipSet` / `SwapExercise`

**부하 조절**
- `IncreaseLoad` / `DecreaseLoad` / `SetLoadTo(value)` / `AddReps` / `RemoveReps`

**컨디션 리포트**
- `ReportRPE` / `ReportPain` / `ReportEnergy` / `ReportSoreness`

**메타**
- `AskQuestion` / `RequestFormCheck` / `RequestDemo` / `ChangeProgram` / `Reschedule`

## 사용 모드

동일한 도메인 모델 위에 **4가지 사용 방식**이 공존:

1. **실시간 코칭** — 음성/실시간 대화 기반, 세션 리드
2. **운동 기록 자동화** — 기록과 분석 중심
3. **루틴 프로그래밍** — 프로그램 수립과 피드백 중심
4. **홈트레이닝** — 맨몸/소도구 기반 운동

## 과부하 모델

### 기본 모델: Autoregulation (자동조절)
AI가 컨디션, 최근 RPE, 누적 피로 등을 종합하여 실시간으로 부하를 결정.

### 자동조절의 시간 범위 (3개 스코프)

1. **세션 중 자동조절** — 같은 세션 안에서 결정 변경
   - 예: 1세트가 너무 어려움 → 2세트 무게 -5kg 제안
2. **세션 간 자동조절** — 다음 세션의 계획을 조정
   - 예: 지난주 RPE가 평균 9 → 이번주 같은 무게 대신 -10%로 시작
3. **프로그램 자동조절** — 전체 프로그램을 재설계
   - 예: 스쿼트 3주 정체 → 변형 운동(프론트 스쿼트)으로 교체 제안

## 세션 상태 머신

### 상태
- `preCheckin` — 컨디션 체크 진행 중
- `warmup` — 워밍업 가이드
- `mainWorkout` — 세트 수행 중
- `rest` — 세트 사이 휴식
- `betweenExercise` — 운동 간 전환
- `cooldown` — 마무리
- `completed` — 세션 완료
- `paused` — 일시 중지
- `abandoned` — 중도 포기

### 전이 트리거
- **명시적 의도**: `StartSession`, `EndSession`, `PauseSession`, `CompleteSet` 등
- **자동 전이**: 휴식 타이머 만료 → `mainWorkout`
- **AI 결정**: 누적 피로 감지 → 종료/축소 제안

### 상태별 의도 유효성
각 상태에서 허용되는 의도가 다르다.
예: `mainWorkout`에서 `CompleteSet`는 가능, `StartSession`은 불가.

## Program 구조

### Program이 가지는 속성
- **목표** — 근력 / 근비대 / 체중 감량 / 일반 건강 / 재활
- **경험 수준** — 초급 / 중급 / 상급
- **기간** — 8주 / 12주 / 무기한
- **스케줄** — 주당 횟수, 요일 매핑, 회당 시간
- **분할(Split)** — Push/Pull/Legs, 상/하, 전신 등
- **기간화(Periodization)** — 단일 / 선형 / 블록 / Undulating
- **진행 규칙** — 증가 시점, 델로드 트리거

### 사용자 vs AI의 역할 (하이브리드)
- **사용자가 결정**: 목표, 가용 장비, 스케줄, 가용 시간
- **AI가 제안**: 구체적 운동, 세트/반복, 진행 규칙, 적응 트리거
- **사용자는 AI 제안을 언제든 수정 가능**
- AI는 사용자 수정 이력을 학습하여 다음 제안에 반영

## 운동 종목 DB

### 기반 데이터셋
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) — 1,324 운동, 10개 언어(한국어 포함), 이미지 + GIF 포함.

### 데이터셋 원본 필드 (snake_case)
외부 데이터셋의 JSON 키는 snake_case를 유지. 적재 레이어에서 camelCase로 매핑.
- `id`, `name`, `category`, `body_part`
- `equipment` (15+ 유형: body weight, dumbbell, barbell, cable, machine 등)
- `instructions` (다국어 텍스트)
- `instruction_steps` (다국어 step-by-step)
- `target` (주동근), `muscle_group` (협력근), `secondary_muscles` (부근)
- `image` (180x180 정지), `gif_url` (애니메이션)

### 우리 도메인 필드 (camelCase)
적재 레이어를 거친 후의 도메인 모델 필드.
- `minimumSkillLevel` — 초급/중급/상급 (안전성 필터링)
- `contraindicatedBodyParts` — 이 운동이 부담을 주는 신체 부위
- `movementPattern` — squat / hinge / push / pull / carry / lunge (프로그래밍에 필수)
- `performanceKind` — loadReps | time
- `instructionsKo` (다국어 객체 `instructions.ko` 매핑), `instructionStepsKo`
- `gifUrl`, `imagePath`

## 자세 교정 (Form Correction)

### A + B 전략
- **A: 자가 리포트 + 텍스트 가이드** — `instructionStepsKo`를 그대로 활용
- **B: 참고 영상/이미지** — `imagePath` + `gifUrl` 활용. AI가 "이 영상 보고 따라해보세요" 식으로 안내
- **C(컴퓨터 비전)는 당분간 제외** — MVP 범위 밖, 후순위

## 부상/주의 부위 처리

### 부상 정보 캡처 시점
- **온보딩** — 과거/현재 부상, 만성 질환
- **세션 시작 컨디션 체크** — 오늘 컨디션, 통증 부위
- **세션 중 리포트** — 실시간 통증

### AI의 부상 대응 액션

1. **필터링 (자동 회피)** — 명백한 위험. "무릎 부상 + 스쿼트" → 자동 제외
2. **경고 (확인 후 진행)** — 약간의 부담이지만 진행 가능. "가벼운 허리 통증 + 데드" → 확인 후 진행
3. **제안 (대안 제시)** — 더 나은 대안이 있을 때. "벤치프레스 대신 플로어프레스" → 제안

### 통증 강도 스케일 (RPE 스타일)
- 1~3: 가벼운 통증 → 경고만, 진행
- 4~6: 중간 통증 → 운동 변경 제안
- 7~10: 강한 통증 → 즉시 중단 권고

## 운동의 성과 단위 (Performance Metric)

### 두 트랙 모델
대부분의 운동은 **loadReps**, 일부는 **time** 기반.

```typescript
type PerformanceMetric = 
  | { kind: 'loadReps' }   // 기본 — 스쿼트, 벤치, 데드 등
  | { kind: 'time' }         // 플랭크, 워싯, 스트레치 등
```

### Exercise가 자기 단위를 선언
- Exercise에 `performanceKind: 'loadReps' | 'time'` 필드 추가
- AI 로직 (자동조절 등)은 `loadReps`에만 적용. `time` 기반은 별도 규칙.

### 데이터셋 분포
- 1,324개 중 ~1,195개 (90%): loadReps
- ~100개 (8%): time 기반 (플랭크, 스트레치, isometric)
- ~29개 (2%): cardio — 현 도메인 스코프 외

## 진행 추적 (Progress Tracking)

### AI 결정용 메트릭 (내부)
- 세션 단위 — 평균 RPE, 총 볼륨, 완료율, 체감 컨디션
- 추세 단위 — 최근 N세션 볼륨 추세, 운동별 RPE 추세, 누적 피로도, 휴식 일수

### 사용자 시각화용 메트릭 (외부)
- 객관적 성취 — 운동별 Personal Record, 주간/월간 총 볼륨, 부위별 볼륨 분포
- 행동적 지표 — 연속 출석(streak), 주간 완료율, 총 세션 수
- 목표 추적 — 구체 목표(예: 100kg 스쿼트), 체중/체지방, 둘레

### Personal Record (개인 기록) — 모든 종류 추적/노출
- **1RM** — 1회 최대 (실제 측정 or e1RM 추정)
- **nRM** — n회 최대 (e.g., 100kg × 5회 Personal Record)
- **e1RM** — Epley/Brzycki 공식으로 추정
- **볼륨 Personal Record** — 단일 세션 내 운동별 총 볼륨
- **시간 Personal Record** — time 기반 운동 (e.g., 플랭크 90초)
- 모든 Personal Record는 히스토리 보존 (현재 + 과거 기록 모두)

## 프로그램 히스토리 (Program History)

### 라이프사이클
활성화 → (사용자 종료 OR 목표 달성 OR 시간 만료) → 보관 → 새 프로그램 시작

### 종료 사유 (다음 프로그램 설계에 참고)
- 목표 변경 / 정체 / 시간 제약 변경 / 부상 / 계절적 / 단순 변심

### 보존 항목
- 종료 사유, 종료 시점 상태(Personal Record/볼륨/완료율), 세션 히스토리 전체

## 목표 설정 (Goal Setting)

### 목표 종류
- **Strength** — 운동별 e1RM / 1RM / nRM / weightForReps
- **Body Composition** — 체중 / 체지방률 / 둘레
- **Volume** — 주간/월간 총 볼륨
- **Qualitative** — 정성적 목표 (자유 텍스트)

### Strength 목표의 측정 방식 (모두 지원)
- **e1RM** — Epley/Brzycki 공식으로 추정 (자동)
- **1RM** — 실제 1RM 시도 기록 시
- **nRM** — N회 최대 (예: 5RM)
- **weightForReps** — "100kg × 5" 같은 조합 목표

### Body Comp 목표
- 사용자 수동 입력 필요 (외부 측정값)
- 주기적 체크인 필요 (주 1회 등)

### 우선순위
- **Primary + Secondary** — 한 사용자가 동시에 여러 목표 (1개 메인 + 1~2개 보조)
- Primary는 프로그램과 동기화, Secondary는 보조 지표

### 데이터 출처
- 자유로움. 구조화된 목표(Strength/Body Comp/Volume) 외에 텍스트 기반 정성 목표 가능.
- AI는 가능한 한 자동으로 측정하고, 사용자 입력이 필요한 경우 체크인 요청.

### 목표 상태
- `active` — 진행 중
- `achieved` — 달성 (축하, 아카이브)
- `abandoned` — 포기 (사유 기록, 아카이브)
- `onHold` — 일시 중지 (부상/생활 변화)

### 목표 vs 프로그램
- 모든 Program은 Primary 목표를 가짐
- 목표 변경은 Program 재설계를 트리거할 수 있음 (사용자 재량)

### 시간 범위
- 단기 (4~8주) — 한 Program과 동기화
- 중기 (3~6개월) — 분기
- 장기 (6~12개월) — 연간
- 기한 없는 목표도 가능 ("건강 유지")

## 미정의 사항 (추후 결정)
- [ ] 운동 종목 DB에 우리 메타 필드 추가
- [ ] 운동의 성과 단위(loadReps/time)별 프로그래밍 로직 분리
