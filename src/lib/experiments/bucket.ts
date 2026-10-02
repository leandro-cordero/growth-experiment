// Framework-free and browser-safe (no zod). Mirrored by head-script.js, which the parity test
// keeps in sync.
export const EXPERIMENTS = [
  { key: 'funnel_proof_v1', variants: ['control', 'counter'] },
] as const;

export type Experiment = (typeof EXPERIMENTS)[number];
export type ExperimentKey = Experiment['key'];
export type ExperimentMap = Record<ExperimentKey, string | null>;

/**
 * FNV-1a 32-bit plus murmur3's fmix32 finaliser. Plain FNV-1a has a weak low bit (bit 0 is a
 * parity of the input), so `% 2` would correlate the two experiments; the finaliser avalanches
 * every input bit into the high bits that `assign` buckets on.
 */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function assign(key: string, anonymousId: string): string {
  const exp = EXPERIMENTS.find((e) => e.key === key);
  if (!exp) throw new Error(`Unknown experiment: ${key}`);
  const bucket = hash(`${key}:${anonymousId}`) / 2 ** 32;
  return exp.variants[Math.floor(bucket * exp.variants.length)]!;
}

/** The served variant of every registered experiment, read off `<html>` (`attr` = getAttribute). */
export function readAssignments(attr: (name: string) => string | null): ExperimentMap {
  return cleanExperiments(Object.fromEntries(EXPERIMENTS.map(({ key }) => [key, attr(key)])));
}

/** Keeps registered keys with a valid variant, nulls the rest, drops unknown keys. Never throws. */
export function cleanExperiments(input: unknown): ExperimentMap {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const out = {} as ExperimentMap;
  for (const { key, variants } of EXPERIMENTS) {
    const v = Object.prototype.hasOwnProperty.call(src, key) ? src[key] : null;
    out[key] = typeof v === 'string' && (variants as readonly string[]).includes(v) ? v : null;
  }
  return out;
}
