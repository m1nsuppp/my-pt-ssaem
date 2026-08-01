# OpenRouter pi 에이전트 스킬 설치

설치 위치: `~/.pi/agent/skills/openrouter/`

## 설치된 스킬

| 스킬 | 설명 |
|------|------|
| `openrouter-typescript-sdk` | OpenRouter TypeScript SDK 완전 레퍼런스 (callModel, tools, streaming, OAuth 등) |
| `create-headless-agent` | 헤드리스 에이전트 스캐폴드 가이드 (CLI, HTTP, MCP 서버, 샘플 프로젝트 포함) |
| `openrouter-models` | 300+ 모델 카탈로그 조회/검색/비교 스크립트 (list, search, compare, resolve, get-endpoints) |

## 구조

```
~/.pi/agent/skills/openrouter/
├── openrouter-typescript-sdk/
│   ├── SKILL.md
│   ├── README.md
│   └── metadata.json
├── create-headless-agent/
│   ├── SKILL.md
│   ├── references/ (tools, modules, entry-points)
│   └── sample/ (완전한 헤드리스 에이전트 예제)
└── openrouter-models/
    ├── SKILL.md
    └── scripts/ (list, search, compare, resolve, get-endpoints)
```

## 사용 방법

pi 재시작 후 다음 명령어로 스킬 호출:

- `/skill:openrouter-typescript-sdk` — SDK 레퍼런스 로드
- `/skill:create-headless-agent` — 헤드리스 에이전트 스캐폴드
- `/skill:openrouter-models` — 모델 카탈로그 조회

## 참고

- 출처: https://github.com/OpenRouterTeam/skills
- pi docs: skills.md
- Closes #2