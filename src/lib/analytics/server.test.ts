import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXPERIMENTS } from '../experiments/bucket';
import type { AccountCreatedEvent } from '../users/service';
import { accountCreatedUuid, createAccountCreatedSender, type CaptureClient } from './server';

const event = (over: Partial<AccountCreatedEvent> = {}): AccountCreatedEvent => ({
  user_id: 'user-1',
  idempotency_key: 'k',
  created_at: '2026-09-18T20:00:00.000Z',
  method: 'email',
  email_domain_type: 'free',
  is_suspected_bot: false,
  anonymous_id: 'anon-1',
  experiments: { funnel_proof_v1: 'counter' },
  ...over,
});

function mockClient() {
  const calls: string[] = [];
  const client = {
    captureImmediate: vi.fn(async () => void calls.push('capture')),
    aliasImmediate: vi.fn(async () => void calls.push('alias')),
  };
  return { client: client as unknown as CaptureClient & typeof client, calls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('accountCreatedUuid', () => {
  it('is stable, v4-shaped and differs per user', async () => {
    const a = await accountCreatedUuid('user-1');
    expect(a).toBe(await accountCreatedUuid('user-1'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(await accountCreatedUuid('user-2'));
  });
});

describe('createAccountCreatedSender', () => {
  it('captures with the deterministic uuid, created_at and a $feature per registered experiment', async () => {
    const { client } = mockClient();
    await createAccountCreatedSender({ client, appEnv: 'production' })(event());
    const msg = (client.captureImmediate.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(msg).toMatchObject({ distinctId: 'user-1', event: 'account_created', disableGeoip: true });
    expect(msg.uuid).toBe(await accountCreatedUuid('user-1'));
    expect(msg.timestamp).toEqual(new Date('2026-09-18T20:00:00.000Z'));
    expect(msg.properties).toMatchObject({ user_id: 'user-1', app_env: 'production', anonymous_id: 'anon-1' });
    for (const { key } of EXPERIMENTS) expect(msg.properties).toHaveProperty(`$feature/${key}`);
    expect(msg.properties['$feature/funnel_proof_v1']).toBe('counter');
  });

  it('aliases after the capture, user id as the target', async () => {
    const { client, calls } = mockClient();
    await createAccountCreatedSender({ client, appEnv: 'production' })(event());
    expect(calls).toEqual(['capture', 'alias']);
    expect(client.aliasImmediate).toHaveBeenCalledWith({ distinctId: 'user-1', alias: 'anon-1' });
  });

  it('skips the alias when there is no anonymous id', async () => {
    const { client } = mockClient();
    await createAccountCreatedSender({ client, appEnv: 'production' })(event({ anonymous_id: null }));
    expect(client.aliasImmediate).not.toHaveBeenCalled();
  });

  it('does nothing without a client', async () => {
    await expect(createAccountCreatedSender({ client: null, appEnv: 'x' })(event())).resolves.toBeUndefined();
  });

  it('resolves at the time box when PostHog hangs', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = mockClient();
    client.captureImmediate.mockImplementation(() => new Promise(() => {}));
    let done = false;
    const p = createAccountCreatedSender({ client, appEnv: 'x' })(event()).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(done).toBe(true);
  });

  it('resolves and logs when the capture throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = mockClient();
    client.captureImmediate.mockRejectedValue(new Error('boom'));
    await expect(createAccountCreatedSender({ client, appEnv: 'x' })(event())).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    expect(client.aliasImmediate).not.toHaveBeenCalled();
  });
});
