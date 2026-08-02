/**
 * IntentClassifier — 정규화된 사용자 발화를 도메인 Intent로 분류한다.
 *
 * 채팅/음성/버튼 인터랙션을 단일 Intent로 통합하는 진입점.
 * 자연어 발화를 의도로 해석하므로 LLM이 담당하며,
 * 출력은 선택/표현 계층의 입력이 된다.
 *
 * 사용 측 관점에서 설계: 메서드명과 시그니처만 보고 동작을 예측할 수 있어야 함.
 */

import type { Intent, NormalizedUtterance } from '../domain/intent.ts';

/**
 * IntentClassifier 인터페이스.
 *
 * 구현체는 OpenRouter, fake, 또는 다른 LLM 제공자를 사용할 수 있음.
 * 도메인 코드는 이 인터페이스에만 의존하고, 구체 구현을 직접 import하지 않음.
 */
export interface IntentClassifier {
  /**
   * 정규화된 사용자 발화를 Intent로 분류한다.
   *
   * @param utterance - 정규화된 사용자 발화
   * @returns 해석된 도메인 Intent
   */
  classify: (utterance: NormalizedUtterance) => Promise<Intent>;
}
