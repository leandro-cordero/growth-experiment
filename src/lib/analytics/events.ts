// THE event map: the only place event names exist. Property types are declared once, as
// strings, and both the runtime checks and the TypeScript types derive from them.
type PropType = 'string' | 'number' | 'boolean' | 'string?' | 'number?';
type Side = 'client' | 'server';

type TsOf<T> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'string?'
        ? string | null
        : number | null;

export const EVENTS = {
  landing_page_viewed: { side: 'client', props: { is_returning: 'boolean' } },
  cta_clicked: { side: 'client', props: { cta_id: 'string', cta_label: 'string', cta_position: 'string' } },
  signup_viewed: { side: 'client', props: { entry_point: 'string?' } },
  signup_started: { side: 'client', props: { method: 'string', field_first_touched: 'string?' } },
  signup_field_errored: {
    side: 'client',
    props: { field: 'string', error_code: 'string', error_source: 'string', attempt_n: 'number' },
  },
  signup_submitted: { side: 'client', props: { method: 'string', time_to_submit_ms: 'number', attempt_n: 'number' } },
  signup_failed: { side: 'client', props: { error_code: 'string', http_status: 'number?', retryable: 'boolean' } },
  // Server side: it does not inherit the browser's super properties, so it carries its own
  // (`anonymous_id`, `app_env`) plus one `$feature/<key>` per registered experiment.
  account_created: {
    side: 'server',
    props: {
      user_id: 'string',
      method: 'string',
      email_domain_type: 'string',
      is_suspected_bot: 'boolean',
      anonymous_id: 'string?',
      app_env: 'string',
    },
  },
  profile_updated: { side: 'client', props: {} },
  profile_skipped: { side: 'client', props: {} },
} as const satisfies Record<string, { side: Side; props: Record<string, PropType> }>;

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = { -readonly [K in keyof (typeof EVENTS)[N]['props']]: TsOf<(typeof EVENTS)[N]['props'][K]> };
export type ClientEventName = { [N in EventName]: (typeof EVENTS)[N]['side'] extends 'client' ? N : never }[EventName];

// Registered once by client.ts on every browser event; never repeated inside an event's props.
export const SUPER_PROPERTY_KEYS = [
  'anonymous_id',
  'app_env',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'first_touch_utm_source',
  'first_touch_utm_campaign',
] as const;
