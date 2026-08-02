#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import {
  type PipelineEvent,
  runDecisionPipeline,
  synthesizeDecision,
} from './cli/pipeline.ts';
import { DEFAULT_CHAT_STATE, loadScenario } from './cli/scenarios.ts';
import { normalizeUtterance } from './domain/intent.ts';
import type { ExpressionLLM } from './llm/expression.ts';
import { createOpenRouterLLMs } from './llm/openrouter/index.ts';
import type { PolicyLLM } from './llm/policy.ts';

const HELP = `
Usage: my-pt-ssaem <command> [options]

Commands:
  simulate    Run the decision engine on a scenario
  chat        Classify an utterance and respond as the coach

Options:
  -s, --scenario <name>   Scenario name (default: none; required for simulate)
  -m, --model <model>     LLM model (default: $OPENROUTER_MODEL or anthropic/claude-haiku-4.5)
      --llm               Use Policy + Expression LLM layers (simulate only)
  -j, --json              Output each event as a JSON line
  -q, --quiet             Suppress all output
  -h, --help              Show this help message

Examples:
  my-pt-ssaem simulate --scenario high-rpe-deload
  my-pt-ssaem simulate --scenario high-rpe-deload --llm
  my-pt-ssaem simulate --scenario high-rpe-deload --json
  my-pt-ssaem chat "1세트 끝났어"
`.trim();

const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const CLI_ARG_START = 2;

type OutputMode = 'text' | 'json' | 'quiet';

interface ParsedCliOptions {
  help: boolean;
  json: boolean;
  quiet: boolean;
  llm: boolean;
  scenario?: string;
  model?: string;
}

async function readStdin(): Promise<string> {
  return (await Bun.stdin.text()).trim();
}

function resolveModel(cliModel: string | undefined): string {
  return cliModel ?? Bun.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function requireApiKey(): string {
  const {
    env: { OPENROUTER_API_KEY: apiKey },
  } = Bun;
  if (apiKey === undefined || apiKey === '') {
    throw new Error('OPENROUTER_API_KEY가 필요합니다. .env에 설정해주세요.');
  }
  return apiKey;
}

async function runSimulate(
  options: ParsedCliOptions,
  outputMode: OutputMode,
): Promise<void> {
  const { scenario } = options;
  if (scenario === undefined) {
    throw new Error('simulate에는 --scenario <name>이 필요합니다.');
  }

  const state = await loadScenario(scenario);

  let opts: { policy?: PolicyLLM; expression?: ExpressionLLM } = {};
  if (options.llm) {
    const apiKey = requireApiKey();
    opts = createOpenRouterLLMs({
      apiKey,
      model: resolveModel(options.model),
    });
  }

  const result = await runDecisionPipeline(
    state,
    opts,
    makeEmitter(outputMode),
  );
  outputMessage(outputMode, result.message);
}

async function runChat(
  utterance: string,
  model: string,
  outputMode: OutputMode,
): Promise<void> {
  const apiKey = requireApiKey();

  const llm = createOpenRouterLLMs({ apiKey, model });
  const intent = await llm.intent.classify(normalizeUtterance(utterance));

  const result = await runDecisionPipeline(
    DEFAULT_CHAT_STATE,
    {},
    makeEmitter(outputMode),
  );
  const decision = synthesizeDecision(intent, result.engineAction);
  const message = await llm.expression.express({
    decision,
    persona: DEFAULT_CHAT_STATE.persona,
  });

  outputMessage(outputMode, message);
}

function makeEmitter(outputMode: OutputMode): (event: PipelineEvent) => void {
  return (event: PipelineEvent) => {
    if (outputMode === 'quiet') return;
    if (outputMode === 'json') {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    }
  };
}

function outputMessage(outputMode: OutputMode, message: string): void {
  if (outputMode === 'text') {
    process.stdout.write(`${message}\n`);
  }
}

function outputModeFrom(values: { json: boolean; quiet: boolean }): OutputMode {
  if (values.json) return 'json';
  if (values.quiet) return 'quiet';
  return 'text';
}

async function dispatch(
  values: ParsedCliOptions,
  positionals: string[],
  outputMode: OutputMode,
): Promise<void> {
  const [command, firstArg] = positionals;
  if (command !== 'simulate' && command !== 'chat') {
    process.stderr.write('알 수 없는 명령입니다.\n\n');
    process.stderr.write(`${HELP}\n`);
    process.exit(1);
  }

  if (command === 'simulate') {
    await runSimulate(values, outputMode);
    return;
  }

  let utterance = firstArg;
  if (utterance === undefined && !process.stdin.isTTY) {
    utterance = await readStdin();
  }
  if (utterance === undefined) {
    process.stderr.write(`${HELP}\n`);
    process.exit(1);
  }

  await runChat(utterance, resolveModel(values.model), outputMode);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      json: { type: 'boolean', short: 'j', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
      scenario: { type: 'string', short: 's' },
      llm: { type: 'boolean', default: false },
      model: { type: 'string', short: 'm' },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }

  const outputMode = outputModeFrom(values);

  try {
    await dispatch(values, positionals, outputMode);
    process.exit(0);
  } catch (err) {
    reportError(err, outputMode);
    process.exit(1);
  }
}

function reportError(err: unknown, outputMode: OutputMode): void {
  const message = err instanceof Error ? err.message : String(err);
  if (outputMode === 'quiet') return;
  if (outputMode === 'json') {
    process.stdout.write(`${JSON.stringify({ type: 'error', message })}\n`);
    return;
  }
  process.stderr.write(`Error: ${message}\n`);
}

function fallbackOutputMode(): OutputMode {
  const argv = process.argv.slice(CLI_ARG_START);
  if (argv.includes('--json') || argv.includes('-j')) return 'json';
  if (argv.includes('--quiet') || argv.includes('-q')) return 'quiet';
  return 'text';
}

main().catch((err: unknown) => {
  const mode = fallbackOutputMode();
  const message = err instanceof Error ? err.message : String(err);
  if (mode !== 'quiet') {
    if (mode === 'json') {
      process.stdout.write(`${JSON.stringify({ type: 'error', message })}\n`);
    } else {
      process.stderr.write(`Error: ${message}\n`);
    }
  }
  process.exit(1);
});
