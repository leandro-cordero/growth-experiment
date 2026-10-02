import { Redis } from '@upstash/redis';
import { PUBLIC_POSTHOG_KEY } from 'astro:env/client';
import { POSTHOG_HOST, UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL, USERS_ADMIN_TOKEN, VERCEL_ENV } from 'astro:env/server';
import { createAccountCreatedSender, createPostHogClient } from '../analytics/server';
import { createUsersHandlers } from './handlers';
import { createUsersService } from './service';
import { memoryStore, redisStore } from './store';

const isProd = import.meta.env.PROD;

// Upstash when configured. Only dev may fall back to memory: in production a missing
// Upstash config must fail loudly, not silently lose users on every cold start.
function chooseStore() {
  if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
    return redisStore(redis, `fxr:${VERCEL_ENV ?? 'development'}`);
  }
  if (isProd) throw new Error('[users] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are required in production.');
  console.warn('[users] Upstash env missing: using the in-memory store (per instance, resets on restart).');
  return memoryStore();
}

// Built on first request, so importing this module (build, type check) never throws.
// The PostHog client is a module-level singleton: no shutdown() per request.
let handlers: ReturnType<typeof createUsersHandlers> | undefined;
const get = () =>
  (handlers ??= createUsersHandlers({
    service: createUsersService({
      store: chooseStore(),
      onAccountCreated: createAccountCreatedSender({
        client: PUBLIC_POSTHOG_KEY ? createPostHogClient(PUBLIC_POSTHOG_KEY, POSTHOG_HOST ?? 'https://us.i.posthog.com') : null,
        appEnv: VERCEL_ENV ?? 'development',
      }),
    }),
    adminToken: USERS_ADMIN_TOKEN,
    isProd,
  }));

export const usersHandlers = {
  create: (request: Request) => get().create(request),
  update: (request: Request, id: string | undefined) => get().update(request, id),
  list: (request: Request) => get().list(request),
};
