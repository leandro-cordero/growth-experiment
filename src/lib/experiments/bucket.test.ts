import { describe, expect, it } from 'vitest';
import { assign, cleanExperiments, EXPERIMENTS, hash, readAssignments } from './bucket';

const ids = Array.from({ length: 10_000 }, () => crypto.randomUUID());

describe('assign', () => {
  it('is deterministic and returns a registered variant', () => {
    for (const { key, variants } of EXPERIMENTS) {
      expect(assign(key, 'abc')).toBe(assign(key, 'abc'));
      expect(variants as readonly string[]).toContain(assign(key, 'abc'));
    }
  });

  it('splits each experiment 50/50 within 2 points', () => {
    for (const { key, variants } of EXPERIMENTS) {
      const share = ids.filter((id) => assign(key, id) === variants[1]).length / ids.length;
      expect(share).toBeGreaterThan(0.48);
      expect(share).toBeLessThan(0.52);
    }
  });

  it('throws for an unregistered key', () => {
    expect(() => assign('nope_v1', 'abc')).toThrow();
  });
});

describe('hash', () => {
  it('returns an unsigned 32-bit integer', () => {
    for (const id of ids.slice(0, 100)) {
      const h = hash(id);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    }
  });

  // Guard for the next experiment: only one is registered now, so this checks the hash itself.
  // Two keys must bucket the same ids independently. Plain FNV-1a fails it (its low bit is a
  // parity of the input, so the two experiments would be perfectly correlated).
  it('buckets two different key prefixes independently (2x2 cells each 25 +/- 2 points)', () => {
    const bucket = (prefix: string, id: string) => (hash(`${prefix}:${id}`) / 2 ** 32 < 0.5 ? 0 : 1);
    const cells = new Map<string, number>();
    for (const id of ids) {
      const cell = `${bucket('a_v1', id)}${bucket('b_v1', id)}`;
      cells.set(cell, (cells.get(cell) ?? 0) + 1);
    }
    expect(cells.size).toBe(4);
    for (const n of cells.values()) {
      expect(n / ids.length).toBeGreaterThan(0.23);
      expect(n / ids.length).toBeLessThan(0.27);
    }
  });
});

describe('readAssignments', () => {
  it('reads each registered experiment off the attributes, null when missing or invalid', () => {
    expect(readAssignments((n) => (n === 'funnel_proof_v1' ? 'counter' : null))).toEqual({ funnel_proof_v1: 'counter' });
    expect(readAssignments(() => null)).toEqual({ funnel_proof_v1: null });
    expect(readAssignments(() => 'bogus')).toEqual({ funnel_proof_v1: null });
  });
});

describe('cleanExperiments', () => {
  it('keeps valid variants, nulls invalid or missing, drops unknown keys', () => {
    expect(cleanExperiments({ funnel_proof_v1: 'counter', evil_v1: 'x' })).toEqual({ funnel_proof_v1: 'counter' });
    expect(cleanExperiments({ funnel_proof_v1: 'bogus' })).toEqual({ funnel_proof_v1: null });
    expect(cleanExperiments({})).toEqual({ funnel_proof_v1: null });
  });

  it('never throws on junk input', () => {
    for (const junk of [null, undefined, 'str', 42, [], { funnel_proof_v1: { a: 1 } }, { __proto__: { funnel_proof_v1: 'counter' } }]) {
      expect(cleanExperiments(junk)).toEqual({ funnel_proof_v1: null });
    }
  });
});
