// Typed browser client for /api/users. Imports only *types* from schema.ts: zod is server-only.
import { readAssignments } from '../experiments/bucket';
import { readAnonymousId } from '../analytics/client';
import type { User } from '../users/schema';

export interface ApiFailure {
  ok: false;
  /** `null` = the request never got a response (network or unreadable body). */
  status: number | null;
  code: string;
  message: string;
  retryable: boolean;
  fields?: Record<string, string>;
}
export type CreateResult = { ok: true; user: User; replayed: boolean } | ApiFailure;
export type UpdateResult = { ok: true; user: User } | ApiFailure;

export interface CreateInput {
  email: string;
  timeToSubmitMs: number;
  /** Honeypot. Sent only when non-empty. */
  website?: string;
}
export interface UpdateInput {
  display_name?: string;
  experience_level?: 'new' | 'some' | 'experienced';
}

/** The outside world, injectable so the client is testable without a browser. */
export interface Env {
  fetch: typeof fetch;
  cookie: () => string;
  attr: (name: string) => string | null;
  newKey: () => string;
}
const browserEnv = (): Env => ({
  fetch: (...args) => fetch(...args),
  cookie: () => document.cookie,
  attr: (n) => document.documentElement.getAttribute(n),
  newKey: () => crypto.randomUUID(),
});

// ---------------------------------------------------------------- idempotency

export interface Attempt {
  key: string;
  body: string;
}
export interface FailedAttempt extends Attempt {
  retryable: boolean;
}

/**
 * Reuse the Idempotency-Key only when the last failure was retryable AND the body is byte-identical:
 * then the server can replay the first attempt if it actually went through. Anything else is a new
 * logical attempt with a new key.
 */
export function pickAttempt(prev: FailedAttempt | null, body: string, newKey: () => string = () => crypto.randomUUID()): Attempt {
  if (prev && prev.retryable && prev.body === body) return { key: prev.key, body: prev.body };
  return { key: newKey(), body };
}

let lastFailure: FailedAttempt | null = null;
/** Forget the remembered attempt (tests, or after a fresh page state). */
export const resetAttempt = () => void (lastFailure = null);

// ---------------------------------------------------------------- requests

export async function createUser(input: CreateInput, env: Env = browserEnv()): Promise<CreateResult> {
  const body = JSON.stringify({
    email: input.email,
    method: 'email',
    anonymous_id: readAnonymousId(env.cookie()),
    time_to_submit_ms: input.timeToSubmitMs,
    experiments: readAssignments(env.attr),
    ...(input.website ? { website: input.website } : {}),
  });
  const attempt = pickAttempt(lastFailure, body, env.newKey);

  const res = await send(env, '/api/users', { method: 'POST', headers: { 'Idempotency-Key': attempt.key }, body: attempt.body });
  if (res.ok) {
    lastFailure = null;
    return { ok: true, user: res.data.user as User, replayed: res.replayed };
  }
  lastFailure = { ...attempt, retryable: res.failure.retryable };
  return res.failure;
}

export async function updateUser(id: string, patch: UpdateInput, env: Env = browserEnv()): Promise<UpdateResult> {
  // Only the filled fields.
  const body = JSON.stringify(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')));
  const res = await send(env, `/api/users/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  return res.ok ? { ok: true, user: res.data.user as User } : res.failure;
}

type Sent = { ok: true; data: { user?: unknown }; replayed: boolean } | { ok: false; failure: ApiFailure };

async function send(env: Env, url: string, init: { method: string; headers?: Record<string, string>; body: string }): Promise<Sent> {
  let response: Response;
  try {
    response = await env.fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
  } catch {
    return { ok: false, failure: failure(null, 'network_error', true) };
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    // A 2xx we can't read is as good as no answer; a non-2xx is a server-side failure.
    return { ok: false, failure: failure(response.status, response.ok ? 'network_error' : 'server_error', response.ok || response.status >= 500) };
  }

  if (response.ok) return { ok: true, data, replayed: response.headers.get('Idempotency-Replayed') === 'true' };

  const e = data?.error ?? {};
  return {
    ok: false,
    failure: failure(response.status, typeof e.code === 'string' ? e.code : 'server_error', e.retryable ?? response.status >= 500, e.fields, e.message),
  };
}

// User-facing copy is looked up by the caller (messages.ts); `message` is the server's own text, for debugging.
function failure(status: number | null, code: string, retryable: boolean, fields?: Record<string, string>, message?: string): ApiFailure {
  return { ok: false, status, code, message: message ?? code, retryable, ...(fields ? { fields } : {}) };
}
