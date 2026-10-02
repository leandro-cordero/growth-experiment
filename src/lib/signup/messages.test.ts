import { describe, expect, it } from 'vitest';
import { FALLBACK_MESSAGE, MESSAGES, messageFor } from './messages';

// Every code the API can return, read from its source so a new code can't ship without copy.
const sources = import.meta.glob('/src/lib/users/{service,handlers,schema}.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const serverCodes = new Set<string>();
for (const src of Object.values(sources)) {
  for (const re of [/\b(?:fail|error)\(\s*\d+,\s*'([a-z_]+)'/g, /\bcode:\s*'([a-z_]+)'/g, /error:\s*'([a-z_]+)'/g, /fields:\s*\{\s*\w+:\s*'([a-z_]+)'/g]) {
    for (const m of src.matchAll(re)) serverCodes.add(m[1]!);
  }
}

describe('messages', () => {
  it('found the API codes to check', () => {
    expect(serverCodes.size).toBeGreaterThan(10);
    for (const known of ['email_taken', 'email_not_allowed', 'invalid_email', 'request_in_flight', 'store_unavailable']) {
      expect(serverCodes.has(known), known).toBe(true);
    }
  });

  it('has an entry for every code the API returns', () => {
    for (const code of serverCodes) expect(MESSAGES, code).toHaveProperty(code);
  });

  it('covers the client-only network_error', () => {
    expect(messageFor('network_error')).toContain("couldn't reach the server");
  });

  it('shows the "unavailable" copy for any 5xx and the fallback for unknown codes', () => {
    expect(messageFor('anything', 503)).toBe(MESSAGES.store_unavailable);
    expect(messageFor('anything', 500)).toBe(MESSAGES.store_unavailable);
    expect(messageFor('never_seen', 400)).toBe(FALLBACK_MESSAGE);
  });

  it('never blames the user with raw server text', () => {
    for (const text of Object.values(MESSAGES)) expect(text).not.toMatch(/zod|expected|undefined|Idempotency/i);
  });
});
