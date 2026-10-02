import { EXPERIMENTS } from '../experiments/bucket';
import { SUPER_PROPERTY_KEYS, type ClientEventName, type EventProps } from './events';

type Prim = string | number | boolean | null;

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const FIRST_TOUCH_COOKIE = 'fxr_ft';
const LAST_TOUCH_KEY = 'fxr_lt';
const HANDOFF_KEY = 'fxr_handoff';

// ---------------------------------------------------------------- super properties (pure)

interface SuperPropsInput {
  /** Reads an attribute off <html>: the served HTML was built with the variant on <html>. */
  attr: (name: string) => string | null;
  cookie: string;
  search: string;
  /** Last touch from sessionStorage. */
  lastTouch: string | null;
}

/** The visitor id the edge middleware set (`fxr_aid`), or null. */
export const readAnonymousId = (cookie: string): string | null => cookie.match(/(?:^|; )fxr_aid=([^;]+)/)?.[1] ?? null;

export function readSuperProps({ attr, cookie, search, lastTouch }: SuperPropsInput) {
  const params = new URLSearchParams(search);
  const fromUrl = Object.fromEntries(UTM_KEYS.map((k) => [k, params.get(k)]));
  const hasUtm = UTM_KEYS.some((k) => fromUrl[k]);

  // Last touch: this visit's UTMs when it has any, else what the session already had.
  const stored = safeJson(lastTouch);
  const last: Record<string, string | null> = hasUtm ? fromUrl : Object.fromEntries(UTM_KEYS.map((k) => [k, stored[k] ?? null]));

  // First touch: write-once cookie (90 days). Written on the first visit even with no UTMs, so a
  // later campaign click on a returning visitor never becomes their "first" touch.
  const existing = cookie.match(new RegExp(`(?:^|; )${FIRST_TOUCH_COOKIE}=([^;]+)`))?.[1];
  const first = existing ? safeJson(decodeURIComponent(existing)) : { source: fromUrl.utm_source, campaign: fromUrl.utm_campaign };

  const props: Record<string, Prim> = {
    anonymous_id: readAnonymousId(cookie),
    app_env: attr('data-app-env') ?? 'development',
    ...last,
    first_touch_utm_source: first.source ?? null,
    first_touch_utm_campaign: first.campaign ?? null,
    ...Object.fromEntries(EXPERIMENTS.map(({ key }) => [`$feature/${key}`, attr(key)])),
  };
  return {
    props,
    lastTouch: JSON.stringify(last),
    firstTouchCookie: existing ? null : encodeURIComponent(JSON.stringify({ source: first.source ?? null, campaign: first.campaign ?? null })),
  };
}

function safeJson(raw: string | null | undefined): Record<string, string | null> {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- dev-only property check

const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const SUPER = new Set<string>(SUPER_PROPERTY_KEYS);

/** Returns a description of the first problem, or null. Called in dev only. */
export function findPropertyProblem(props: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(props)) {
    if (!SNAKE.test(k)) return `"${k}" is not snake_case`;
    if (SUPER.has(k)) return `"${k}" is a super property and must not be repeated`;
    if (v === undefined) return `"${k}" is undefined (use null)`;
    if (v !== null && !['string', 'number', 'boolean'].includes(typeof v)) return `"${k}" is not a flat primitive`;
  }
  return null;
}

// ---------------------------------------------------------------- navigation handoff (pure)

/** An event from a click that left the page before posthog-js loaded, stored for the next page. */
export interface Handoff {
  name: ClientEventName;
  props: Record<string, Prim>;
  uuid: string;
  /** Click time, epoch ms. */
  ts: number;
}

const HANDOFF_MAX_AGE_MS = 30 * 60 * 1000;

/** Parses the stored handoff. Null for missing, corrupt, or older than 30 minutes (a stale tab). */
export function readHandoff(raw: string | null, now: number): Handoff | null {
  try {
    const h = raw ? JSON.parse(raw) : null;
    const valid =
      h && typeof h.name === 'string' && typeof h.uuid === 'string' && typeof h.ts === 'number' && h.props && typeof h.props === 'object';
    return valid && now - h.ts <= HANDOFF_MAX_AGE_MS ? (h as Handoff) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- loader + track

type PostHogLike = typeof import('posthog-js').default;
type Job = (ph: PostHogLike) => void;

let queue: Job[] = [];
let ready: PostHogLike | null = null;
let started = false;
let enabled = false;

const run = (job: Job) => {
  try {
    if (ready) job(ready);
    else if (enabled || !started) queue.push(job);
  } catch (err) {
    console.warn('analytics job failed', err);
  }
};

function devCheck(name: string, props: object): void {
  if (!import.meta.env.DEV) return;
  const problem = findPropertyProblem(props as Record<string, unknown>);
  if (problem) console.warn(`[analytics] ${name}: ${problem}`);
}

/** Never throws. Calls before PostHog has loaded are queued and flushed after `init`. */
export function track<N extends ClientEventName>(name: N, props: EventProps<N>): void {
  devCheck(name, props);
  run((ph) => ph.capture(name, props as Record<string, unknown>));
}

// Beacon: survives the page unloading. The fixed uuid makes a double send count once.
const beacon = (ph: PostHogLike, h: Handoff) =>
  ph.capture(h.name, h.props, { uuid: h.uuid, timestamp: new Date(h.ts), send_instantly: true, transport: 'sendBeacon' });

/**
 * For a click that navigates away. `track()` would queue or batch the event and lose it on unload.
 * With posthog-js loaded, it goes out now by beacon; otherwise it's handed to the next page through
 * sessionStorage and sent there with the click's own time. Never throws.
 */
export function trackNavigation<N extends ClientEventName>(name: N, props: EventProps<N>): void {
  devCheck(name, props);
  if (started && !enabled) return; // analytics off
  const h: Handoff = { name, props: props as Record<string, Prim>, uuid: crypto.randomUUID(), ts: Date.now() };
  try {
    if (ready) beacon(ready, h);
    else sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(h));
  } catch (err) {
    console.warn('analytics navigation event failed', err);
  }
}

/** Backup merge after the server's alias: ties this browser to the new user id. */
export function identify(userId: string): void {
  run((ph) => ph.identify(userId));
}

/**
 * Loads posthog-js on idle, or on the first pointerdown/keydown, whichever comes first, so a fast
 * CTA click isn't lost. Without a key, analytics is off and queued calls are dropped.
 */
export function initAnalytics({ key, host }: { key?: string; host: string }): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (!key) {
    queue = [];
    return;
  }
  enabled = true;

  const load = () => {
    window.removeEventListener('pointerdown', load);
    window.removeEventListener('keydown', load);
    if (ready) return;
    import('posthog-js')
      .then(({ default: posthog }) => {
        const html = document.documentElement;
        const sp = readSuperProps({
          attr: (n) => html.getAttribute(n),
          cookie: document.cookie,
          search: location.search,
          lastTouch: safeGet(() => sessionStorage.getItem(LAST_TOUCH_KEY)),
        });
        if (sp.firstTouchCookie) document.cookie = `${FIRST_TOUCH_COOKIE}=${sp.firstTouchCookie};max-age=7776000;path=/;SameSite=Lax`;
        safeGet(() => sessionStorage.setItem(LAST_TOUCH_KEY, sp.lastTouch));

        posthog.init(key, {
          api_host: host,
          ui_host: 'https://us.posthog.com',
          bootstrap: sp.props.anonymous_id ? { distinctID: String(sp.props.anonymous_id) } : undefined,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          advanced_disable_flags: true,
          person_profiles: 'always',
        });
        posthog.register(sp.props);
        if (new URLSearchParams(location.search).get('internal') === '1') posthog.opt_out_capturing();

        ready = posthog;
        // A navigation event handed over by the previous page (or by this one, if it's unloading).
        const handoff = readHandoff(safeGet(() => sessionStorage.getItem(HANDOFF_KEY)), Date.now());
        safeGet(() => sessionStorage.removeItem(HANDOFF_KEY));
        if (handoff) safeGet(() => beacon(posthog, handoff));
        const jobs = queue;
        queue = [];
        for (const job of jobs) run(job);
      })
      .catch((err) => console.warn('posthog-js failed to load', err));
  };

  window.addEventListener('pointerdown', load, { once: true, passive: true });
  window.addEventListener('keydown', load, { once: true });
  (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 2000)))(load);
}

function safeGet<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
