import type { ZodError } from 'zod';
import { createUserSchema, listQuerySchema, updateUserSchema, type ApiError } from './schema';
import type { Result, createUsersService } from './service';

type Service = ReturnType<typeof createUsersService>;

export interface HandlerDeps {
  service: Service;
  adminToken: string | undefined;
  /** Production with no token configured: the list does not exist. */
  isProd: boolean;
}

const MAX_BODY_CHARS = 8 * 1024;
const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

const send = ({ status, body, replayed }: Result) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(replayed ? { 'Idempotency-Replayed': 'true' } : {}),
    },
  });

const error = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  send({ status, body: { error: { code, message, retryable: false, ...(fields && { fields }) } } satisfies ApiError });

const fieldErrors = (err: ZodError) => {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) fields[String(issue.path[0] ?? '_')] ??= issue.message;
  return fields;
};

async function readJson(request: Request): Promise<{ raw: string; data: unknown } | Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return error(413, 'body_too_large', 'Request body is too large.');
  try {
    return { raw, data: JSON.parse(raw) };
  } catch {
    return error(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

async function sha(s: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Hash both sides so the comparison runs over equal-length strings without short-circuiting.
async function isAdmin(request: Request, token: string) {
  const given = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (given === undefined) return false;
  const [a, b] = await Promise.all([sha(given), sha(token)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createUsersHandlers({ service, adminToken, isProd }: HandlerDeps) {
  return {
    async create(request: Request) {
      const key = request.headers.get('idempotency-key');
      if (!key || !KEY_RE.test(key)) {
        return error(400, 'idempotency_key_required', 'Send an Idempotency-Key header (8-128 URL-safe characters).');
      }
      const body = await readJson(request);
      if (body instanceof Response) return body;
      const parsed = createUserSchema.safeParse(body.data);
      if (!parsed.success) {
        return error(422, 'validation_failed', 'Some fields are invalid.', fieldErrors(parsed.error));
      }
      // The fingerprint is the raw body: retries must resend the exact same bytes.
      return send(await service.create(parsed.data, key, await sha(body.raw)));
    },

    async update(request: Request, id: string | undefined) {
      // The unguessable id returned by create is the capability for the profile step.
      if (!id) return error(404, 'user_not_found', 'User not found.');
      const body = await readJson(request);
      if (body instanceof Response) return body;
      const parsed = updateUserSchema.safeParse(body.data);
      if (!parsed.success) {
        return error(422, 'validation_failed', 'Some fields are invalid.', fieldErrors(parsed.error));
      }
      return send(await service.update(id, parsed.data));
    },

    async list(request: Request) {
      if (adminToken) {
        if (!(await isAdmin(request, adminToken))) return error(401, 'unauthorized', 'Missing or invalid token.');
      } else if (isProd) {
        return error(404, 'not_found', 'Not found.');
      }
      const query = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!query.success) return error(422, 'validation_failed', 'Invalid paging.', fieldErrors(query.error));
      return send(await service.list(query.data.offset, query.data.limit));
    },
  };
}
