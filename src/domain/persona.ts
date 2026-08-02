/**
 * 페르소나 (Persona) — 사용자가 선택하는 AI 코치의 성격/말투.
 *
 * CONTEXT "페르소나" 섹션에서 파생.
 * 기존 src/llm/expression.ts의 Persona를 단일 진실 원천으로 옮긴 것.
 */
export type PersonaTone =
  | 'motivational'
  | 'caring'
  | 'analytical'
  | 'challenging';

export interface Persona {
  id: string;
  name: string;
  /** 말투 유형 */
  tone: PersonaTone;
  /** 페르소나에 대한 자연어 설명 */
  description: string;
  /** 말투 스타일 가이드 (LLM에 전달할 시스템 프롬프트 조각) */
  styleGuide: string;
}
