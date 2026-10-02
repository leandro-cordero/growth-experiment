import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUser, pickAttempt, resetAttempt, updateUser, type Env } from './api';

const user = { id: 'u1', email: 'a@gmail.com' };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function setup(...responses: Array<Response | Error>) {
  const queue = [...responses];
  const fetchFn = vi.fn(async () => {
    const next = queue.shift()!;
    if (next instanceof Error) throw next;
    return next;
  });
  let n = 0;
  const env: Env = {
    fetch: fetchFn as unknown as typeof fetch,
    cookie: () => 'a=1; fxr_aid=anon-abc-123',
    attr: (name) => (name === 'funnel_proof_v1' ? 'counter' : null),
    newKey: () => `key-${++n}`,
  };
  const sent = (i = 0) => {
    const [url, init] = fetchFn.mock.calls[i] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    return { url, init, body: JSON.parse(init.body as string), key: init.headers['Idempotency-Key'] };
  };
  return { env, fetchFn, sent };
}

beforeEach(() => resetAttempt());

describe('createUser', () => {
  it('sends the header and exactly the documented body', async () => {
    const { env, sent } = setup(json(201, { user }));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    const { url, init, body, key } = sent();
    expect(url).toBe('/api/users');
    expect(init.method).toBe('POST');
    expect(key).toBe('key-1');
    expect(body).toEqual({
      email: 'a@gmail.com',
      method: 'email',
      anonymous_id: 'anon-abc-123',
      time_to_submit_ms: 4200,
      experiments: { funnel_proof_v1: 'counter' },
    });
    expect(body).not.toHaveProperty('website');
  });

  it('includes the honeypot only when filled', async () => {
    const { env, sent } = setup(json(201, { user }));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1, website: 'spam.com' }, env);
    expect(sent().body.website).toBe('spam.com');
  });

  it('returns the user on 201 and flags a replay', async () => {
    const a = await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(json(201, { user })).env);
    expect(a).toEqual({ ok: true, user, replayed: false });
    resetAttempt();
    const b = await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(json(201, { user }, { 'Idempotency-Replayed': 'true' })).env);
    expect(b).toMatchObject({ ok: true, replayed: true });
  });

  it('maps a 409 with field errors', async () => {
    const err = { error: { code: 'email_taken', message: 'taken', retryable: false, fields: { email: 'email_taken' } } };
    expect(await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(json(409, err)).env)).toEqual({
      ok: false, status: 409, code: 'email_taken', message: 'taken', retryable: false, fields: { email: 'email_taken' },
    });
  });

  it('maps a 422 validation failure', async () => {
    const err = { error: { code: 'validation_failed', message: 'bad', retryable: false, fields: { email: 'invalid_email' } } };
    expect(await createUser({ email: 'x', timeToSubmitMs: 1 }, setup(json(422, err)).env)).toMatchObject({
      status: 422, code: 'validation_failed', retryable: false, fields: { email: 'invalid_email' },
    });
  });

  it('maps a 503 as retryable', async () => {
    const err = { error: { code: 'store_unavailable', message: 'x', retryable: true } };
    expect(await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(json(503, err)).env)).toMatchObject({
      status: 503, code: 'store_unavailable', retryable: true,
    });
  });

  it('maps a network error to status null, network_error, retryable', async () => {
    expect(await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(new TypeError('offline')).env)).toMatchObject({
      ok: false, status: null, code: 'network_error', retryable: true,
    });
  });

  it('treats an unreadable body as a failure: retryable for 5xx, not for 4xx', async () => {
    const html5 = new Response('<html>', { status: 502 });
    expect(await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(html5).env)).toMatchObject({ status: 502, code: 'server_error', retryable: true });
    resetAttempt();
    const html4 = new Response('<html>', { status: 400 });
    expect(await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, setup(html4).env)).toMatchObject({ status: 400, retryable: false });
  });

  it('reuses the key after a retryable failure with an identical body', async () => {
    const { env, sent } = setup(new TypeError('offline'), json(201, { user }));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    expect(sent(1).key).toBe(sent(0).key);
    expect(sent(1).init.body).toBe(sent(0).init.body);
  });

  it('uses a new key when the body changed after a retryable failure', async () => {
    const { env, sent } = setup(new TypeError('offline'), json(201, { user }));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    await createUser({ email: 'b@gmail.com', timeToSubmitMs: 4200 }, env);
    expect(sent(1).key).not.toBe(sent(0).key);
  });

  it('uses a new key after a non-retryable failure, even with the same body', async () => {
    const err = { error: { code: 'email_taken', message: 'x', retryable: false } };
    const { env, sent } = setup(json(409, err), json(409, err));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 4200 }, env);
    expect(sent(1).key).not.toBe(sent(0).key);
  });

  it('forgets the failed attempt after a success', async () => {
    const { env, sent } = setup(new TypeError('offline'), json(201, { user }), json(201, { user }));
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, env);
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, env);
    await createUser({ email: 'a@gmail.com', timeToSubmitMs: 1 }, env);
    expect(sent(2).key).not.toBe(sent(1).key);
  });
});

describe('pickAttempt', () => {
  it('reuses only for a retryable failure with the same body', () => {
    const prev = { key: 'k1', body: '{"a":1}', retryable: true };
    expect(pickAttempt(prev, '{"a":1}', () => 'new')).toEqual({ key: 'k1', body: '{"a":1}' });
    expect(pickAttempt(prev, '{"a":2}', () => 'new')).toEqual({ key: 'new', body: '{"a":2}' });
    expect(pickAttempt({ ...prev, retryable: false }, '{"a":1}', () => 'new').key).toBe('new');
    expect(pickAttempt(null, '{"a":1}', () => 'new').key).toBe('new');
  });
});

describe('updateUser', () => {
  it('PATCHes only the filled fields', async () => {
    const { env, sent } = setup(json(200, { user }));
    await updateUser('u 1', { display_name: 'Ana', experience_level: undefined }, env);
    const { url, init, body } = sent();
    expect(url).toBe('/api/users/u%201');
    expect(init.method).toBe('PATCH');
    expect(body).toEqual({ display_name: 'Ana' });
  });

  it('drops empty strings and returns the union', async () => {
    const { env, sent } = setup(json(200, { user }));
    expect(await updateUser('u1', { display_name: '', experience_level: 'some' }, env)).toEqual({ ok: true, user });
    expect(sent().body).toEqual({ experience_level: 'some' });
  });

  it('maps errors like createUser', async () => {
    const err = { error: { code: 'validation_failed', message: 'x', retryable: false, fields: { display_name: 'too_long' } } };
    expect(await updateUser('u1', { display_name: 'x' }, setup(json(422, err)).env)).toMatchObject({
      ok: false, status: 422, fields: { display_name: 'too_long' },
    });
    expect(await updateUser('u1', { display_name: 'x' }, setup(new TypeError('offline')).env)).toMatchObject({ code: 'network_error', retryable: true });
  });
});
