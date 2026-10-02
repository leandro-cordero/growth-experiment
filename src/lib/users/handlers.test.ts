import { describe, expect, it, vi } from 'vitest';
import { createUsersHandlers } from './handlers';
import { createUsersService, type AccountCreatedEvent } from './service';
import { memoryStore } from './store';

function setup(
  over: { adminToken?: string; isProd?: boolean; onAccountCreated?: (e: AccountCreatedEvent) => Promise<void> } = {},
) {
  const onAccountCreated = vi.fn<(e: AccountCreatedEvent) => Promise<void>>(over.onAccountCreated ?? (async () => {}));
  const handlers = createUsersHandlers({
    service: createUsersService({ store: memoryStore(), onAccountCreated }),
    adminToken: over.adminToken,
    isProd: over.isProd ?? false,
  });
  return { handlers, onAccountCreated };
}

const post = (body: unknown, key = 'key-12345678') =>
  new Request('http://x/api/users', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });

describe('POST /api/users', () => {
  it('creates a user and emits account_created once', async () => {
    const { handlers, onAccountCreated } = setup();
    const res = await handlers.create(post({ email: ' Ana@Gmail.com ' }));
    expect(res.status).toBe(201);
    expect((await res.json()).user.email).toBe('ana@gmail.com');
    expect(onAccountCreated).toHaveBeenCalledOnce();
  });

  it('replays the same key + body without a second event', async () => {
    const { handlers, onAccountCreated } = setup();
    await handlers.create(post({ email: 'a@gmail.com' }));
    const res = await handlers.create(post({ email: 'a@gmail.com' }));
    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotency-Replayed')).toBe('true');
    expect(onAccountCreated).toHaveBeenCalledOnce();
  });

  it('422s the same key with a different body', async () => {
    const { handlers } = setup();
    await handlers.create(post({ email: 'a@gmail.com' }));
    expect((await handlers.create(post({ email: 'b@gmail.com' }))).status).toBe(422);
  });

  it('409s a duplicate email under a new key', async () => {
    const { handlers } = setup();
    await handlers.create(post({ email: 'a@gmail.com' }, 'key-aaaaaaaa'));
    const res = await handlers.create(post({ email: 'a@gmail.com' }, 'key-bbbbbbbb'));
    expect(res.status).toBe(409);
    expect((await res.json()).error.fields.email).toBe('email_taken');
  });

  it('rejects bad input with field codes', async () => {
    const { handlers } = setup();
    const bad = await handlers.create(post({ email: 'nope' }));
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.fields.email).toBe('invalid_email');
    const corp = await handlers.create(post({ email: 'a@acme.io' }));
    expect((await corp.json()).error.fields.email).toBe('email_not_allowed');
  });

  it('requires an Idempotency-Key and valid JSON', async () => {
    const { handlers } = setup();
    expect((await handlers.create(new Request('http://x', { method: 'POST', body: '{}' }))).status).toBe(400);
    const res = await handlers.create(
      new Request('http://x', { method: 'POST', headers: { 'Idempotency-Key': 'key-12345678' }, body: '{' }),
    );
    expect(res.status).toBe(400);
  });

  it('fakes a 201 for the honeypot and stores nothing', async () => {
    const { handlers, onAccountCreated } = setup();
    const res = await handlers.create(post({ email: 'bot@gmail.com', website: 'spam.com' }));
    expect(res.status).toBe(201);
    expect(onAccountCreated).not.toHaveBeenCalled();
    expect((await (await handlers.list(new Request('http://x/api/users'))).json()).total).toBe(0);
  });

  it('flags fast submits as suspected bots but stores them', async () => {
    const { handlers, onAccountCreated } = setup();
    const res = await handlers.create(post({ email: 'a@gmail.com', time_to_submit_ms: 300 }));
    expect((await res.json()).user.is_suspected_bot).toBe(true);
    expect(onAccountCreated.mock.calls[0]?.[0]).toMatchObject({ is_suspected_bot: true });
  });

  it('passes created_at and the cleaned experiments map to account_created', async () => {
    const { handlers, onAccountCreated } = setup();
    const res = await handlers.create(
      post({ email: 'a@gmail.com', anonymous_id: 'anon-1', experiments: { funnel_proof_v1: 'bogus', evil_v1: 'x' } }),
    );
    const { user } = await res.json();
    expect(onAccountCreated.mock.calls[0]?.[0]).toMatchObject({
      user_id: user.id,
      created_at: user.created_at,
      anonymous_id: 'anon-1',
      experiments: { funnel_proof_v1: null },
    });
  });

  it('keeps a valid funnel_proof_v1 variant', async () => {
    const { handlers, onAccountCreated } = setup();
    await handlers.create(post({ email: 'b@gmail.com', experiments: { funnel_proof_v1: 'counter' } }));
    expect(onAccountCreated.mock.calls[0]?.[0].experiments).toEqual({ funnel_proof_v1: 'counter' });
  });

  it('still returns 201 when analytics throws', async () => {
    const { handlers } = setup({
      onAccountCreated: async () => {
        throw new Error('posthog down');
      },
    });
    expect((await handlers.create(post({ email: 'a@gmail.com' }))).status).toBe(201);
  });
});

describe('PATCH /api/users/:id', () => {
  it('updates the profile and 404s unknown ids', async () => {
    const { handlers } = setup();
    const { user } = await (await handlers.create(post({ email: 'a@gmail.com' }))).json();
    const patch = (id: string, body: unknown) =>
      handlers.update(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), id);
    const ok = await patch(user.id, { display_name: 'Ana', experience_level: 'new' });
    expect((await ok.json()).user.profile).toEqual({ display_name: 'Ana', experience_level: 'new' });
    expect((await patch(user.id, {})).status).toBe(422);
    expect((await patch('nope', { display_name: 'x' })).status).toBe(404);
  });
});

describe('GET /api/users', () => {
  const get = (token?: string, qs = '') =>
    new Request(`http://x/api/users${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

  it('is open in dev without a token and 404 in production', async () => {
    expect((await setup().handlers.list(get())).status).toBe(200);
    expect((await setup({ isProd: true }).handlers.list(get())).status).toBe(404);
  });

  it('requires the bearer token when configured and pages newest first', async () => {
    const { handlers } = setup({ adminToken: 'secret' });
    for (const n of ['a', 'b', 'c']) await handlers.create(post({ email: `${n}@gmail.com` }, `key-0000000${n}`));
    expect((await handlers.list(get('wrong'))).status).toBe(401);
    const page = await (await handlers.list(get('secret', '?limit=2&offset=0'))).json();
    expect(page.total).toBe(3);
    expect(page.users.map((u: { email: string }) => u.email)).toEqual(['c@gmail.com', 'b@gmail.com']);
    expect((await handlers.list(get('secret', '?limit=0'))).status).toBe(422);
  });
});
