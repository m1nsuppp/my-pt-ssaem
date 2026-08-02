import love from 'eslint-config-love';

export default [
  {
    ...love,
    files: ['src/**/*.ts'],
  },
  {
    // 산술/경계에 보편적으로 쓰이는 숫자(0, 1)만 magic number에서 제외.
    // 규칙을 love 전체와 병합되도록 별도 객체로 둔다 (같은 객체에 넣으면 love 규칙이 통째로 교체됨).
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': ['error', { ignore: [0, 1] }],
    },
  },
  {
    // 스펙은 시나리오 수치를 리터럴로 검증하는 게 본질 — 테스트 코드에서는 off.
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
];
