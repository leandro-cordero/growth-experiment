import { PostHog } from 'posthog-node';
import { EXPERIMENTS } from '../experiments/bucket';
import type { AccountCreatedEvent } from '../users/service';

export type CaptureClient = Pick<PostHog, 'captureImmediate' | 'aliasImmediate'>;

export const createPostHogClient = (apiKey: string, host: string): CaptureClient =>
  new PostHog(apiKey, { host, disableGeoip: true });

/** SHA-256(`account_created:<user_id>`) formatted as a v4-style UUID, so a re-send dedupes in PostHog. */
export async function accountCreatedUuid(userId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`account_created:${userId}`)));
  const b = digest.slice(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Options {
  /** `null` when no PostHog key is configured: the sender then does nothing. */
  client: CaptureClient | null;
  appEnv: string;
  timeoutMs?: number;
}

/**
 * Sends `account_created` and then merges the visitor's anonymous id into the user id. One time
 * box covers both calls. It logs failures and never throws, so analytics can't fail a signup.
 */
export function createAccountCreatedSender({ client, appEnv, timeoutMs = 1500 }: Options) {
  return async (e: AccountCreatedEvent): Promise<void> => {
    if (!client) return;
    const work = async () => {
      await client.captureImmediate({
        distinctId: e.user_id,
        event: 'account_created',
        uuid: await accountCreatedUuid(e.user_id),
        timestamp: new Date(e.created_at),
        disableGeoip: true,
        properties: {
          user_id: e.user_id,
          method: e.method,
          email_domain_type: e.email_domain_type,
          is_suspected_bot: e.is_suspected_bot,
          anonymous_id: e.anonymous_id,
          app_env: appEnv,
          ...Object.fromEntries(EXPERIMENTS.map(({ key }) => [`$feature/${key}`, e.experiments[key]])),
        },
      });
      if (e.anonymous_id) await client.aliasImmediate({ distinctId: e.user_id, alias: e.anonymous_id });
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      if ((await Promise.race([work(), timeout])) === 'timeout') console.error('account_created: PostHog timed out');
    } catch (err) {
      console.error('account_created failed', err);
    } finally {
      clearTimeout(timer);
    }
  };
}
