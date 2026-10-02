import type { Redis } from '@upstash/redis';
import type { User } from './schema';

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type BeginResult =
  | { kind: 'new' }
  | { kind: 'inflight' }
  | { kind: 'mismatch' }
  | { kind: 'replay'; response: StoredResponse };

export interface Store {
  /** Claims an idempotency key, or says what already holds it. */
  begin(key: string, fingerprint: string): Promise<BeginResult>;
  complete(key: string, fingerprint: string, response: StoredResponse): Promise<void>;
  release(key: string): Promise<void>;
  /** Atomic on email. Returns false when the email is taken. */
  insertUser(user: User): Promise<boolean>;
  getUser(id: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  /** Newest first. */
  list(offset: number, limit: number): Promise<{ users: User[]; total: number }>;
}

const IDEM_TTL_S = 60 * 60 * 24;

type Slot = { fp: string; response: StoredResponse | null };

export function memoryStore(): Store {
  const users = new Map<string, User>();
  const emails = new Set<string>();
  const keys = new Map<string, Slot>();
  return {
    async begin(key, fp) {
      const hit = keys.get(key);
      if (!hit) {
        keys.set(key, { fp, response: null });
        return { kind: 'new' };
      }
      if (hit.fp !== fp) return { kind: 'mismatch' };
      return hit.response ? { kind: 'replay', response: hit.response } : { kind: 'inflight' };
    },
    async complete(key, fp, response) {
      keys.set(key, { fp, response });
    },
    async release(key) {
      keys.delete(key);
    },
    async insertUser(user) {
      if (emails.has(user.email)) return false;
      emails.add(user.email);
      users.set(user.id, user);
      return true;
    },
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async saveUser(user) {
      users.set(user.id, user);
    },
    async list(offset, limit) {
      const all = [...users.values()].reverse(); // Map keeps insertion order
      return { users: all.slice(offset, offset + limit), total: all.length };
    },
  };
}

export function redisStore(redis: Redis, prefix: string): Store {
  const k = {
    user: (id: string) => `${prefix}:user:${id}`,
    email: (e: string) => `${prefix}:email:${e}`,
    idem: (key: string) => `${prefix}:idem:${key}`,
    index: `${prefix}:users`,
  };
  return {
    async begin(key, fp) {
      const claimed = await redis.set(k.idem(key), { fp, response: null } satisfies Slot, { nx: true, ex: IDEM_TTL_S });
      if (claimed) return { kind: 'new' };
      const hit = await redis.get<Slot>(k.idem(key));
      if (!hit) return { kind: 'inflight' }; // expired between the two calls: let the client retry
      if (hit.fp !== fp) return { kind: 'mismatch' };
      return hit.response ? { kind: 'replay', response: hit.response } : { kind: 'inflight' };
    },
    async complete(key, fp, response) {
      await redis.set(k.idem(key), { fp, response } satisfies Slot, { ex: IDEM_TTL_S });
    },
    async release(key) {
      await redis.del(k.idem(key));
    },
    async insertUser(user) {
      const locked = await redis.set(k.email(user.email), user.id, { nx: true });
      if (!locked) return false;
      try {
        const tx = redis.multi();
        tx.set(k.user(user.id), user);
        tx.zadd(k.index, { score: Date.parse(user.created_at), member: user.id });
        await tx.exec();
      } catch (err) {
        await redis.del(k.email(user.email)).catch(() => {});
        throw err;
      }
      return true;
    },
    getUser: (id) => redis.get<User>(k.user(id)),
    async saveUser(user) {
      await redis.set(k.user(user.id), user);
    },
    async list(offset, limit) {
      const [ids, total] = await Promise.all([
        redis.zrange<string[]>(k.index, offset, offset + limit - 1, { rev: true }),
        redis.zcard(k.index),
      ]);
      if (ids.length === 0) return { users: [], total };
      const rows = await redis.mget<(User | null)[]>(...ids.map(k.user));
      return { users: rows.filter((u): u is User => u !== null), total };
    },
  };
}
