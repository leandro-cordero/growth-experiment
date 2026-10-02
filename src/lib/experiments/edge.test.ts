import { describe, expect, it } from 'vitest';
import { assign } from './bucket';
import { decideVariant, serializeCookie } from './edge';

const ids = Array.from({ length: 400 }, () => crypto.randomUUID());
const idFor = (variant: string) => ids.find((id) => assign('funnel_proof_v1', id) === variant)!;
const at = (path: string) => new URL(`https://x.test${path}`);
const decide = (path: string, cookie = '', env = 'production') => decideVariant({ url: at(path), cookie, env, mintId: () => 'minted-id-12345' });
const cookieNames = (d: ReturnType<typeof decide>) => Object.fromEntries(d.cookies.map((c) => [c.name, c.value]));

describe('decideVariant', () => {
  it('mints an id when there is no cookie and marks the visitor new', () => {
    const d = decide('/');
    expect(cookieNames(d)).toEqual({ fxr_aid: 'minted-id-12345', fxr_ret: '0' });
    expect(d.cookies.find((c) => c.name === 'fxr_aid')!.maxAge).toBe(31536000);
    expect(d.cookies.find((c) => c.name === 'fxr_ret')!.maxAge).toBeUndefined();
  });

  it('keeps an existing id and marks the visitor returning', () => {
    const id = idFor('control');
    expect(cookieNames(decide('/', `a=1; fxr_aid=${id}`))).toEqual({ fxr_aid: id, fxr_ret: '1' });
  });

  it('replaces a malformed id instead of trusting it', () => {
    expect(cookieNames(decide('/', 'fxr_aid=<script>'))).toMatchObject({ fxr_aid: 'minted-id-12345', fxr_ret: '0' });
  });

  it('serves control as-is', () => {
    expect(decide('/', `fxr_aid=${idFor('control')}`).action).toBe('next');
    expect(decide('/signup', `fxr_aid=${idFor('control')}`).action).toBe('next');
  });

  it('rewrites counter visitors to the counter copy of / and /signup, matching assign()', () => {
    const cookie = `fxr_aid=${idFor('counter')}`;
    expect(decide('/', cookie)).toMatchObject({ action: 'rewrite', path: '/v/counter/' });
    expect(decide('/signup', cookie)).toMatchObject({ action: 'rewrite', path: '/v/counter/signup' });
    expect(decide('/signup/', cookie)).toMatchObject({ action: 'rewrite', path: '/v/counter/signup' });
  });

  it('agrees with assign() for many ids', () => {
    for (const id of ids) {
      const d = decide('/', `fxr_aid=${id}`);
      expect(d.action).toBe(assign('funnel_proof_v1', id) === 'control' ? 'next' : 'rewrite');
    }
  });

  it('redirects direct hits on /v/* to the public path, keeping the query', () => {
    expect(decide('/v/counter/')).toMatchObject({ action: 'redirect', path: '/', cookies: [] });
    expect(decide('/v/counter/signup')).toMatchObject({ action: 'redirect', path: '/signup' });
    expect(decide('/v/counter/signup?entry=hero')).toMatchObject({ action: 'redirect', path: '/signup?entry=hero' });
  });

  it('honours ?fxr_variant outside production', () => {
    const id = idFor('control');
    expect(decide('/?fxr_variant=counter', `fxr_aid=${id}`, 'development')).toMatchObject({ action: 'rewrite', path: '/v/counter/' });
    expect(decide('/?fxr_variant=counter', `fxr_aid=${id}`, 'preview').action).toBe('rewrite');
    const c = idFor('counter');
    expect(decide('/?fxr_variant=control', `fxr_aid=${c}`, 'development').action).toBe('next');
  });

  it('ignores ?fxr_variant in production', () => {
    const id = idFor('control');
    expect(decide('/?fxr_variant=counter', `fxr_aid=${id}`, 'production').action).toBe('next');
  });

  it('ignores an unknown override value', () => {
    const id = idFor('control');
    expect(decide('/?fxr_variant=bogus', `fxr_aid=${id}`, 'development').action).toBe('next');
  });
});

describe('serializeCookie', () => {
  it('sets Path, SameSite and Max-Age, and Secure only when asked', () => {
    expect(serializeCookie({ name: 'fxr_aid', value: 'a', maxAge: 10 }, true)).toBe('fxr_aid=a; Path=/; SameSite=Lax; Max-Age=10; Secure');
    expect(serializeCookie({ name: 'fxr_ret', value: '1' }, false)).toBe('fxr_ret=1; Path=/; SameSite=Lax');
  });

  it('never marks fxr_aid HttpOnly: PostHog bootstrap reads it in the browser', () => {
    expect(serializeCookie({ name: 'fxr_aid', value: 'a', maxAge: 1 }, true)).not.toContain('HttpOnly');
  });
});
