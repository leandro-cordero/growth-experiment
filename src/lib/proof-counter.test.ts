import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCount, nextDelayMs, PROOF_BASE, startCounter, startTicking, type VisibilityDoc } from './proof-counter';

function fakeDoc(state = 'visible') {
  let listener: (() => void) | undefined;
  const doc: VisibilityDoc & { set(s: string): void; listening(): boolean } = {
    visibilityState: state,
    addEventListener: (_t, cb) => void (listener = cb),
    removeEventListener: () => void (listener = undefined),
    set(s) {
      doc.visibilityState = s;
      listener?.();
    },
    listening: () => listener !== undefined,
  };
  return doc;
}

afterEach(() => vi.useRealTimers());

describe('formatCount', () => {
  it('formats en-US with a thousands separator', () => {
    expect(formatCount(12480)).toBe('12,480');
    expect(formatCount(1000000)).toBe('1,000,000');
  });
});

describe('nextDelayMs', () => {
  it('stays within 8,000 to 20,000 ms', () => {
    expect(nextDelayMs(() => 0)).toBe(8000);
    expect(nextDelayMs(() => 0.999999)).toBe(20000);
    for (let i = 0; i < 1000; i++) {
      const d = nextDelayMs();
      expect(d).toBeGreaterThanOrEqual(8000);
      expect(d).toBeLessThanOrEqual(20000);
    }
  });
});

describe('startCounter', () => {
  it('shows the base, then ticks up by one on fake timers', () => {
    vi.useFakeTimers();
    const el = { textContent: '' as string | null };
    startCounter(el, { doc: fakeDoc(), rand: () => 0 }); // 8s delay
    expect(el.textContent).toBe(formatCount(PROOF_BASE));
    vi.advanceTimersByTime(7999);
    expect(el.textContent).toBe('12,480');
    vi.advanceTimersByTime(1);
    expect(el.textContent).toBe('12,481');
    vi.advanceTimersByTime(8000);
    expect(el.textContent).toBe('12,482');
  });

  it('rolls each new number in: a fresh .proof-counter__digit element per tick, none on first paint', () => {
    vi.useFakeTimers();
    const made: Array<{ className: string; textContent: string | null }> = [];
    const el = {
      textContent: '' as string | null,
      ownerDocument: { createElement: () => { const n = { className: '', textContent: '' as string | null }; made.push(n); return n; } },
      replaceChildren: vi.fn(),
    };
    startCounter(el, { doc: fakeDoc(), rand: () => 0 });
    expect(el.textContent).toBe('12,480');
    expect(made).toHaveLength(0);
    vi.advanceTimersByTime(8000);
    vi.advanceTimersByTime(8000);
    expect(made.map((n) => [n.className, n.textContent])).toEqual([
      ['proof-counter__digit', '12,481'],
      ['proof-counter__digit', '12,482'],
    ]);
    expect(el.replaceChildren).toHaveBeenCalledTimes(2);
  });

  it('stops ticking and unsubscribes when stopped', () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    const el = { textContent: '' as string | null };
    const stop = startCounter(el, { doc, rand: () => 0 });
    stop();
    vi.advanceTimersByTime(60_000);
    expect(el.textContent).toBe('12,480');
    expect(doc.listening()).toBe(false);
  });
});

describe('startTicking', () => {
  it('does not tick while the tab is hidden and resumes when it is visible again', () => {
    vi.useFakeTimers();
    const doc = fakeDoc('hidden');
    const onTick = vi.fn();
    startTicking(onTick, { doc, rand: () => 0 });
    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();
    doc.set('visible');
    vi.advanceTimersByTime(8000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('pauses when the tab becomes hidden mid-wait', () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    const onTick = vi.fn();
    startTicking(onTick, { doc, rand: () => 0 });
    vi.advanceTimersByTime(4000);
    doc.set('hidden');
    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();
  });
});
