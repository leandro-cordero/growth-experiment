// Framework-free: the one place that decides which variant a request gets. Two thin wrappers call
// it: the root middleware.ts (Vercel Routing Middleware, production) and src/middleware.ts
// (Astro, dev only, because `astro dev` doesn't run Vercel middleware).
import { assign, EXPERIMENTS } from './bucket.js';

const KEY = 'funnel_proof_v1';
const VARIANTS = EXPERIMENTS.find((e) => e.key === KEY)!.variants as readonly string[];
const AID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** Pages that have a per-variant prerendered copy under /v/<variant>/. */
export const VARIANT_PATHS = ['/', '/signup'] as const;

export interface EdgeCookie {
  name: string;
  value: string;
  /** Seconds. Omitted = session cookie. */
  maxAge?: number;
}

export type EdgeDecision =
  | { action: 'next'; cookies: EdgeCookie[] }
  | { action: 'rewrite'; path: string; cookies: EdgeCookie[] }
  | { action: 'redirect'; path: string; cookies: EdgeCookie[] };

interface Input {
  url: URL;
  /** The raw `Cookie` request header. */
  cookie: string;
  /** VERCEL_ENV, or 'development' locally. */
  env: string;
  mintId?: () => string;
}

const readCookie = (cookie: string, name: string) => cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
const trimSlash = (p: string) => p.replace(/\/+$/, '') || '/';

export function decideVariant({ url, cookie, env, mintId = () => crypto.randomUUID() }: Input): EdgeDecision {
  const path = trimSlash(url.pathname);

  // Nobody picks a variant by URL: that would skew the sample ratio.
  const direct = path.match(/^\/v\/[^/]+(\/.*)?$/);
  if (direct) return { action: 'redirect', path: (direct[1] ?? '/') + url.search, cookies: [] };

  const existing = readCookie(cookie, 'fxr_aid');
  const known = existing !== undefined && AID_RE.test(existing);
  const aid = known ? existing : mintId();

  // QA override: only outside production, so it can never contaminate real traffic.
  const forced = env !== 'production' ? url.searchParams.get('fxr_variant') : null;
  const variant = forced && VARIANTS.includes(forced) ? forced : assign(KEY, aid);

  const cookies: EdgeCookie[] = [
    { name: 'fxr_aid', value: aid, maxAge: ONE_YEAR_S },
    // 1 = this browser had an id before this request (feeds `is_returning`).
    { name: 'fxr_ret', value: known ? '1' : '0' },
  ];

  if (variant === 'control' || !(VARIANT_PATHS as readonly string[]).includes(path)) return { action: 'next', cookies };
  return { action: 'rewrite', path: `/v/${variant}${path}`, cookies };
}

/** `Set-Cookie` header value. `fxr_aid` stays readable by JS: PostHog's bootstrap reads it. */
export function serializeCookie(c: EdgeCookie, secure: boolean): string {
  return [
    `${c.name}=${c.value}`,
    'Path=/',
    'SameSite=Lax',
    ...(c.maxAge !== undefined ? [`Max-Age=${c.maxAge}`] : []),
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
