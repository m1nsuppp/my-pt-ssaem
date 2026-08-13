import stylistic from '@stylistic/eslint-plugin';
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
    plugins: { '@stylistic': stylistic },
    rules: {
      '@typescript-eslint/no-magic-numbers': ['error', { ignore: [0, 1] }],

      // return 앞은 항상 한 줄 띄워 "여기서 나간다"를 시각적으로 분리한다.
      // core 동명 규칙은 ESLint 9에서 deprecated(v10 제거 예정) — @stylistic 쪽을 쓴다.
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'multiline-expression', next: 'return' },
        { blankLine: 'always', prev: 'multiline-block-like', next: 'return' },
        { blankLine: 'always', prev: 'block-like', next: 'return' },
        { blankLine: 'always', prev: 'const', next: 'return' },
        { blankLine: 'always', prev: 'let', next: 'return' },
        { blankLine: 'always', prev: 'var', next: 'return' },
        { blankLine: 'always', prev: 'if', next: 'return' },
        { blankLine: 'always', prev: 'for', next: 'return' },
        { blankLine: 'always', prev: 'while', next: 'return' },
        { blankLine: 'always', prev: 'do', next: 'return' },
        { blankLine: 'always', prev: 'switch', next: 'return' },
        { blankLine: 'always', prev: 'try', next: 'return' },
      ],

      // love는 multi-line. 한 줄짜리 if도 중괄호를 강제해 나중에 문장을 추가할 때 생기는 사고를 막는다.
      curly: ['error', 'all'],
    },
  },
  {
    // 스펙은 시나리오 수치를 리터럴로 검증하는 게 본질 — 테스트 코드에서는 off.
    // 턴 시퀀스는 이전 결과가 다음 입력이라 직렬 실행이 본질이므로 await-in-loop도 off.
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'no-await-in-loop': 'off',
    },
  },
];
