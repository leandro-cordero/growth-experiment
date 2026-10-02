// Vercel Routing Middleware (edge). Chooses the funnel_proof_v1 variant and rewrites counter
// visitors to their prerendered copy, so a visitor only ever receives their own variant's HTML.
// The logic lives in src/lib/experiments/edge.ts. `astro dev` doesn't run this file: see
// src/middleware.ts for the dev wrapper.
import { next, rewrite } from '@vercel/functions/middleware';
import { decideVariant, serializeCookie } from './src/lib/experiments/edge.js';

// The edge runtime provides `process.env`; @types/node isn't installed.
declare const process: { env: Record<string, string | undefined> };

// /rly (the PostHog proxy) and everything else is deliberately not matched.
export const config = { matcher: ['/', '/signup', '/v/:path*'] };

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  const decision = decideVariant({
    url,
    cookie: request.headers.get('cookie') ?? '',
    env: process.env.VERCEL_ENV ?? 'development',
  });

  const headers = new Headers();
  for (const c of decision.cookies) headers.append('set-cookie', serializeCookie(c, url.protocol === 'https:'));

  if (decision.action === 'redirect') {
    headers.set('location', new URL(decision.path, url).toString());
    return new Response(null, { status: 307, headers });
  }
  if (decision.action === 'rewrite') return rewrite(new URL(decision.path + url.search, url), { headers });
  return next({ headers });
}
