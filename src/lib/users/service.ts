import { cleanExperiments, type ExperimentMap } from '../experiments/bucket';
import type { EmailDomainType } from './email';
import { emailDomainType } from './email';
import type { CreateUserInput, UpdateUserInput, User } from './schema';
import type { Store, StoredResponse } from './store';

export interface AccountCreatedEvent {
  user_id: string;
  idempotency_key: string;
  created_at: string;
  method: 'email';
  email_domain_type: EmailDomainType;
  is_suspected_bot: boolean;
  anonymous_id: string | null;
  /** Every registered experiment, `null` when not enrolled or the client sent junk. */
  experiments: ExperimentMap;
}

export interface ServiceDeps {
  store: Store;
  /** Sends `account_created`. Must never be required for a signup to succeed. */
  onAccountCreated: (event: AccountCreatedEvent) => Promise<void>;
  now?: () => Date;
  newId?: () => string;
}

export interface Result extends StoredResponse {
  replayed?: boolean;
}

const BOT_THRESHOLD_MS = 1500;

const fail = (status: number, code: string, message: string, retryable: boolean): Result => ({
  status,
  body: { error: { code, message, retryable } },
});

const unavailable = () => fail(503, 'store_unavailable', 'Please try again in a moment.', true);

function buildUser(id: string, input: CreateUserInput, ts: string, isBot: boolean): User {
  return {
    id,
    email: input.email,
    method: input.method,
    is_suspected_bot: isBot,
    created_at: ts,
    updated_at: ts,
    profile: { display_name: null, experience_level: null },
  };
}

export function createUsersService({
  store,
  onAccountCreated,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
}: ServiceDeps) {
  return {
    async create(input: CreateUserInput, key: string, fingerprint: string): Promise<Result> {
      // Honeypot: pretend it worked, store and count nothing.
      if (input.website) {
        return { status: 201, body: { user: buildUser(newId(), input, now().toISOString(), false) } };
      }

      let begin;
      try {
        begin = await store.begin(key, fingerprint);
      } catch {
        return unavailable();
      }
      if (begin.kind === 'replay') return { ...begin.response, replayed: true };
      if (begin.kind === 'inflight') return fail(409, 'request_in_flight', 'This request is still being processed.', true);
      if (begin.kind === 'mismatch') return fail(422, 'idempotency_key_reuse', 'This key was used with a different request.', false);

      const isBot = input.time_to_submit_ms !== null && input.time_to_submit_ms < BOT_THRESHOLD_MS;
      const user = buildUser(newId(), input, now().toISOString(), isBot);

      let inserted: boolean;
      try {
        inserted = await store.insertUser(user);
      } catch {
        await store.release(key).catch(() => {});
        return unavailable();
      }
      if (!inserted) {
        await store.release(key).catch(() => {});
        return {
          status: 409,
          body: {
            error: {
              code: 'email_taken',
              message: 'An account with this email already exists.',
              retryable: false,
              fields: { email: 'email_taken' },
            },
          },
        };
      }

      const response: StoredResponse = { status: 201, body: { user } };
      // A failure here must not turn a stored user into an error: the user still gets the 201.
      await store.complete(key, fingerprint, response).catch((err) => console.error('idempotency save failed', err));
      await onAccountCreated({
        user_id: user.id,
        idempotency_key: key,
        created_at: user.created_at,
        method: input.method,
        email_domain_type: emailDomainType(user.email),
        is_suspected_bot: isBot,
        anonymous_id: input.anonymous_id,
        // The server trusts the client's assignment after cleaning it against the registry.
        experiments: cleanExperiments(input.experiments),
      }).catch((err) => console.error('account_created failed', err));
      return response;
    },

    async update(id: string, patch: UpdateUserInput): Promise<Result> {
      try {
        const user = await store.getUser(id);
        if (!user) return fail(404, 'user_not_found', 'User not found.', false);
        const next: User = {
          ...user,
          updated_at: now().toISOString(),
          profile: {
            display_name: patch.display_name ?? user.profile.display_name,
            experience_level: patch.experience_level ?? user.profile.experience_level,
          },
        };
        await store.saveUser(next);
        return { status: 200, body: { user: next } };
      } catch {
        return unavailable();
      }
    },

    async list(offset: number, limit: number): Promise<Result> {
      try {
        const { users, total } = await store.list(offset, limit);
        return { status: 200, body: { users, total, limit, offset } };
      } catch {
        return unavailable();
      }
    },
  };
}
