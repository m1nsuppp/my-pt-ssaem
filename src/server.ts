/**
 * HTTP 서버 엔트리 — Bun.serve + SSE 실시간 코칭 엔드포인트.
 *
 * 세션 시작/발화 수신/SSE 스트림을 노출하고, 발화 처리는 기존 3계층
 * (의도 분류 → 결정 → 표현)을 재사용한다. 결과는 SSE `data:` 이벤트로 chunk 단위 흘린다.
 */
import { z } from 'zod';
import { DEFAULT_CHAT_STATE } from './cli/scenarios.ts';
import {
  createFakeExpressionLLM,
  createFakeIntentClassifier,
} from './llm/fake.ts';
import { createOpenRouterLLMs } from './llm/openrouter/index.ts';
import type { ServerBrain } from './server/process.ts';
import { createServerBrain } from './server/process.ts';
import { createInMemorySessionStore } from './server/session-store.ts';

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash-0731';
const DEFAULT_PORT = 3000;
const KIB = 1024;
const MAX_BODY = KIB * KIB;
const ALLOWED_ORIGIN = '*';
const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_NO_CONTENT = 204;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNAUTHORIZED = 401;
const STATUS_CONTENT_TOO_LARGE = 413;
const STATUS_INTERNAL_ERROR = 500;
const STATUS_NOT_FOUND = 404;

const UTTERANCE_RE = /^\/api\/sessions\/(?<sessionId>[^\/]+)\/utterance$/v;
const STREAM_RE = /^\/api\/sessions\/(?<sessionId>[^\/]+)\/stream$/v;

const utteranceBodySchema = z.object({ text: z.string() });

const {
  env: {
    PORT: portEnv,
    OPENROUTER_MODEL: modelEnv,
    OPENROUTER_API_KEY: apiKeyEnv,
    AGENT_API_SECRET: agentApiSecret,
    FAKE_LLM: fakeLlm,
  },
} = Bun;

const PORT = Number(portEnv ?? DEFAULT_PORT);
const MODEL = modelEnv ?? DEFAULT_MODEL;
const FAKE = fakeLlm === '1';
const API_SECRET = agentApiSecret;

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status = STATUS_OK): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, STATUS_UNAUTHORIZED);
}

function checkAuth(req: Request): boolean {
  if (API_SECRET === undefined || API_SECRET === '') return true;
  return req.headers.get('Authorization') === `Bearer ${API_SECRET}`;
}

const store = createInMemorySessionStore(DEFAULT_CHAT_STATE);

const brain: ServerBrain = FAKE
  ? createServerBrain(
      {
        intent: createFakeIntentClassifier(),
        expression: createFakeExpressionLLM(),
      },
      store,
    )
  : (() => {
      if (apiKeyEnv === undefined || apiKeyEnv === '') {
        throw new Error(
          'API 키가 필요합니다. OPENROUTER_API_KEY를 설정하거나 FAKE_LLM=1로 실행하세요',
        );
      }
      const { expression, intent } = createOpenRouterLLMs({
        apiKey: apiKeyEnv,
        model: MODEL,
      });
      return createServerBrain({ intent, expression }, store);
    })();

type UtteranceBody =
  | { ok: true; text: string }
  | { ok: false; error: 'invalidJson' | 'textRequired' };

type JsonReadResult = { ok: true; value: unknown } | { ok: false };

async function tryReadJson(req: Request): Promise<JsonReadResult> {
  try {
    return { ok: true, value: await req.json() };
  } catch {
    return { ok: false };
  }
}

async function readUtteranceBody(req: Request): Promise<UtteranceBody> {
  const read = await tryReadJson(req);
  if (!read.ok) {
    return { ok: false, error: 'invalidJson' };
  }
  const parsed = utteranceBodySchema.safeParse(read.value);
  if (!parsed.success || parsed.data.text.trim() === '') {
    return { ok: false, error: 'textRequired' };
  }
  return { ok: true, text: parsed.data.text };
}

async function handleUtterance(id: string, req: Request): Promise<Response> {
  const contentLength = parseInt(req.headers.get('Content-Length') ?? '0', 10);
  if (contentLength > MAX_BODY) {
    return json({ error: 'Request body too large' }, STATUS_CONTENT_TOO_LARGE);
  }

  const body = await readUtteranceBody(req);
  if (!body.ok) {
    const message =
      body.error === 'invalidJson' ? 'Invalid JSON' : 'text is required';
    return json({ error: message }, STATUS_BAD_REQUEST);
  }

  try {
    const result = await brain.processUtterance(id, body.text);
    return json({
      sessionId: result.sessionId,
      intent: result.intent,
      engineAction: result.engineAction,
      decision: result.decision,
      message: result.message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, STATUS_INTERNAL_ERROR);
  }
}

function handleStream(id: string): Response {
  const encoder = new TextEncoder();
  let unsub: (() => void) | undefined = undefined;
  const readable = new ReadableStream({
    start(controller) {
      unsub = store.subscribe(id, (event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          unsub?.();
        }
      });
    },
    cancel() {
      unsub?.();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders(),
    },
  });
}

function handleCreateSession(req: Request): Response {
  if (!checkAuth(req)) return unauthorized();
  const sessionId = store.createSession();
  return json({ sessionId }, STATUS_CREATED);
}

type ServerRoute =
  | { kind: 'utterance'; sessionId: string }
  | { kind: 'stream'; sessionId: string };

function matchRoute(pathname: string): ServerRoute | null {
  const utterance = UTTERANCE_RE.exec(pathname);
  if (utterance !== null) {
    return {
      kind: 'utterance',
      sessionId: decodeURIComponent(utterance.groups?.sessionId ?? ''),
    };
  }
  const stream = STREAM_RE.exec(pathname);
  if (stream !== null) {
    return {
      kind: 'stream',
      sessionId: decodeURIComponent(stream.groups?.sessionId ?? ''),
    };
  }
  return null;
}

async function dispatchRoute(
  route: ServerRoute,
  req: Request,
): Promise<Response> {
  if (!checkAuth(req)) return unauthorized();
  if (route.kind === 'utterance') {
    return await handleUtterance(route.sessionId, req);
  }
  return handleStream(route.sessionId);
}

Bun.serve({
  port: PORT,
  maxRequestBodySize: MAX_BODY,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: STATUS_NO_CONTENT,
        headers: corsHeaders(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      return handleCreateSession(req);
    }

    const route = matchRoute(url.pathname);
    if (route === null) {
      return json({ error: 'Not found' }, STATUS_NOT_FOUND);
    }
    return await dispatchRoute(route, req);
  },
});

if (API_SECRET === undefined || API_SECRET === '') {
  process.stderr.write(
    'WARNING: AGENT_API_SECRET not set — dev mode, all requests allowed.\n',
  );
}
process.stdout.write(`Server listening on http://localhost:${PORT}\n`);
