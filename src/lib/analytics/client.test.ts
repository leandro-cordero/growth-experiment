import { describe, expect, it } from 'vitest';
import { findPropertyProblem, readAnonymousId, readHandoff, readSuperProps } from './client';

const attrs: Record<string, string> = { funnel_proof_v1: 'counter', 'data-app-env': 'production' };
const base = { attr: (n: string) => attrs[n] ?? null, cookie: 'fxr_aid=aid-1', search: '', lastTouch: null as string | null };

describe('readSuperProps', () => {
  it('reads identity, env and funnel_proof_v1 as the only $feature (null when missing)', () => {
    const { props } = readSuperProps(base);
    expect(props).toMatchObject({ anonymous_id: 'aid-1', app_env: 'production', '$feature/funnel_proof_v1': 'counter' });
    expect(Object.keys(props).filter((k) => k.startsWith('$feature/'))).toEqual(['$feature/funnel_proof_v1']);
    expect(readSuperProps({ ...base, attr: () => null }).props['$feature/funnel_proof_v1']).toBeNull();
  });

  it('uses this visit\'s UTMs as last touch and writes the first-touch cookie once', () => {
    const r = readSuperProps({ ...base, search: '?utm_source=x&utm_campaign=spring' });
    expect(r.props).toMatchObject({ utm_source: 'x', utm_campaign: 'spring', utm_medium: null, first_touch_utm_source: 'x', first_touch_utm_campaign: 'spring' });
    expect(JSON.parse(decodeURIComponent(r.firstTouchCookie!))).toEqual({ source: 'x', campaign: 'spring' });
  });

  it('keeps an existing first touch and does not rewrite the cookie', () => {
    const ft = encodeURIComponent(JSON.stringify({ source: 'old', campaign: 'first' }));
    const r = readSuperProps({ ...base, cookie: `fxr_aid=aid-1; fxr_ft=${ft}`, search: '?utm_source=new' });
    expect(r.props).toMatchObject({ utm_source: 'new', first_touch_utm_source: 'old', first_touch_utm_campaign: 'first' });
    expect(r.firstTouchCookie).toBeNull();
  });

  it('carries the session\'s last touch when the visit has no UTMs', () => {
    const r = readSuperProps({ ...base, lastTouch: JSON.stringify({ utm_source: 'kept' }) });
    expect(r.props.utm_source).toBe('kept');
  });

  it('writes an all-null first touch for an organic first visit', () => {
    const r = readSuperProps(base);
    expect(JSON.parse(decodeURIComponent(r.firstTouchCookie!))).toEqual({ source: null, campaign: null });
  });

  it('survives corrupt stored values', () => {
    expect(() => readSuperProps({ ...base, cookie: 'fxr_aid=a; fxr_ft=%7Bnope', lastTouch: '{oops' })).not.toThrow();
  });
});

describe('readAnonymousId', () => {
  it('reads fxr_aid from the cookie string, null when absent', () => {
    expect(readAnonymousId('a=1; fxr_aid=abc-123; b=2')).toBe('abc-123');
    expect(readAnonymousId('a=1')).toBeNull();
    expect(readAnonymousId('')).toBeNull();
  });
});

describe('findPropertyProblem', () => {
  it('accepts flat snake_case primitives and null', () => {
    expect(findPropertyProblem({ cta_id: 'hero', attempt_n: 1, retryable: false, entry_point: null })).toBeNull();
  });

  it.each([
    [{ ctaId: 'x' }, 'snake_case'],
    [{ cta_id: undefined }, 'undefined'],
    [{ cta_id: { a: 1 } }, 'primitive'],
    [{ utm_source: 'x' }, 'super property'],
  ])('flags %j', (props, why) => {
    expect(findPropertyProblem(props)).toContain(why);
  });
});

describe('readHandoff', () => {
  const h = { name: 'cta_clicked', props: { cta_id: 'hero_primary' }, uuid: 'u-1', ts: 1_000_000 };

  it('returns a fresh handoff as stored', () => {
    expect(readHandoff(JSON.stringify(h), h.ts + 5_000)).toEqual(h);
  });

  it('drops a handoff older than 30 minutes (a stale tab)', () => {
    expect(readHandoff(JSON.stringify(h), h.ts + 31 * 60 * 1000)).toBeNull();
  });

  it('returns null for missing, corrupt or mis-shaped values', () => {
    expect(readHandoff(null, 0)).toBeNull();
    expect(readHandoff('{oops', 0)).toBeNull();
    expect(readHandoff(JSON.stringify({ ...h, uuid: 1 }), h.ts)).toBeNull();
    expect(readHandoff(JSON.stringify({ ...h, props: null }), h.ts)).toBeNull();
  });
});
