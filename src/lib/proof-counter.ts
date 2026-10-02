// TODO(copy): substantiate — simulated figure; production reads GET /api/users/count.
// This figure is made up. It must not ship (docs/decisions.md > Simulated proof counter).
export const PROOF_BASE = 12480;

export const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** A random delay between ticks, 8,000 to 20,000 ms inclusive. */
export const nextDelayMs = (rand: () => number = Math.random) => 8000 + Math.floor(rand() * 12001);

/** The slice of `document` the ticker needs, so tests don't need a DOM. */
export interface VisibilityDoc {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', cb: () => void): void;
  removeEventListener(type: 'visibilitychange', cb: () => void): void;
}

interface Options {
  doc?: VisibilityDoc;
  rand?: () => number;
}

/** Calls `onTick` at random intervals, only while the tab is visible. Returns a stop function. */
export function startTicking(onTick: () => void, { doc = document, rand = Math.random }: Options = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (timer !== undefined || doc.visibilityState !== 'visible') return;
    timer = setTimeout(() => {
      timer = undefined;
      onTick();
      schedule();
    }, nextDelayMs(rand));
  };
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') schedule();
    else if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  doc.addEventListener('visibilitychange', onVisibility);
  schedule();
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}

/** What `startCounter` needs from an element. A real element also has `ownerDocument`. */
export interface CounterEl {
  textContent: string | null;
  ownerDocument?: { createElement(tag: 'span'): { className: string; textContent: string | null } } | null;
  replaceChildren?(...nodes: unknown[]): void;
}

// Replace the number with a fresh element so the CSS roll-up animation restarts on every tick.
function showCount(el: CounterEl, text: string) {
  const doc = el.ownerDocument;
  if (!doc || !el.replaceChildren) {
    el.textContent = text;
    return;
  }
  const digit = doc.createElement('span');
  digit.className = 'proof-counter__digit';
  digit.textContent = text;
  el.replaceChildren(digit);
}

/** Counts up from PROOF_BASE by one per tick; each new number rolls up into place. */
export function startCounter(el: CounterEl, options?: Options): () => void {
  let count = PROOF_BASE;
  el.textContent = formatCount(count); // First paint: no animation.
  return startTicking(() => {
    count += 1;
    showCount(el, formatCount(count));
  }, options);
}
