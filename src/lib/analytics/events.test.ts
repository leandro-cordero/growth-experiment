import { describe, expect, it } from 'vitest';
import { EVENTS, SUPER_PROPERTY_KEYS } from './events';

const entries = Object.entries(EVENTS);
const snake = /^[a-z]+(_[a-z]+)+$/;

describe('event map', () => {
  it('names are snake_case object_action, past tense', () => {
    for (const [name] of entries) {
      expect(name, name).toMatch(snake);
      expect(name, name).toMatch(/_[a-z]+ed$/);
    }
  });

  it('property names are snake_case', () => {
    for (const [name, e] of entries) for (const p of Object.keys(e.props)) expect(p, `${name}.${p}`).toMatch(/^[a-z]+(_[a-z0-9]+)*$/);
  });

  it('account_created is the only server event', () => {
    expect(entries.filter(([, e]) => e.side === 'server').map(([n]) => n)).toEqual(['account_created']);
  });

  it('no client event property shadows a super property', () => {
    const supers = new Set<string>(SUPER_PROPERTY_KEYS);
    for (const [name, e] of entries) {
      if (e.side !== 'client') continue;
      for (const p of Object.keys(e.props)) expect(supers.has(p), `${name}.${p}`).toBe(false);
    }
  });
});

describe('SDK isolation', () => {
  const files = import.meta.glob('/src/**/*.{ts,tsx,astro,js}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const importers = (pkg: string) =>
    Object.entries(files)
      .filter(([path, src]) => !path.endsWith('.test.ts') && new RegExp(`(from\\s+|import\\()\\s*['"]${pkg}['"]`).test(src))
      .map(([path]) => path);

  it('posthog-js is imported only by analytics/client.ts', () => {
    expect(importers('posthog-js')).toEqual(['/src/lib/analytics/client.ts']);
  });

  it('posthog-node is imported only by analytics/server.ts', () => {
    expect(importers('posthog-node')).toEqual(['/src/lib/analytics/server.ts']);
  });
});
