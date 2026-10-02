// Dev-only wrapper around decideVariant(): `astro dev` doesn't run Vercel Routing Middleware (the
// root middleware.ts). In a build, Astro middleware only runs at prerender time, so the DEV guard
// makes this a no-op there.
import { defineMiddleware } from 'astro:middleware';
import { decideVariant } from './lib/experiments/edge';

export const onRequest = defineMiddleware((context, next) => {
  if (!import.meta.env.DEV) return next();

  // `context.rewrite()` re-runs the middleware for the rewritten request: don't decide twice.
  const locals = context.locals as { variantDecided?: boolean };
  if (locals.variantDecided) return next();

  const url = new URL(context.request.url);
  const decision = decideVariant({
    url,
    cookie: context.request.headers.get('cookie') ?? '',
    env: 'development',
  });

  const setCookies = () => {
    for (const c of decision.cookies) {
      context.cookies.set(c.name, c.value, { path: '/', sameSite: 'lax', maxAge: c.maxAge, httpOnly: false });
    }
  };

  if (decision.action === 'redirect') return context.redirect(decision.path, 307);
  setCookies();
  if (decision.action === 'rewrite') {
    locals.variantDecided = true;
    return context.rewrite(decision.path + url.search);
  }
  locals.variantDecided = true;
  return next();
});
