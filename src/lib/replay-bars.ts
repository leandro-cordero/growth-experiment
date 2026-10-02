// Synthetic OHLC bars for the hero chart. Illustrative only, not market data.

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
}

// Deterministic PRNG so every build renders the same chart
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateBars(count: number, seed = 42, start = 64000): Bar[] {
  const rand = mulberry32(seed);
  const bars: Bar[] = [];
  let open = start;

  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 9) * 40;
    const close = Math.round(open + drift + (rand() - 0.5) * 520);
    const high = Math.round(Math.max(open, close) + rand() * 180);
    const low = Math.round(Math.min(open, close) - rand() * 180);
    bars.push({ open, high, low, close });
    open = close;
  }

  return bars;
}

export interface CandleGeometry {
  x: number;
  width: number;
  wickTop: number;
  wickBottom: number;
  bodyTop: number;
  bodyHeight: number;
  up: boolean;
}

export interface ChartBox {
  left: number;
  top: number;
  width: number;
  height: number;
  slots: number;
}

export function priceRange(bars: Bar[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const b of bars) {
    min = Math.min(min, b.low);
    max = Math.max(max, b.high);
  }
  return { min, max };
}

export function priceToY(price: number, min: number, max: number, box: ChartBox): number {
  const span = max - min || 1;
  return box.top + ((max - price) / span) * box.height;
}

export function layoutCandles(bars: Bar[], box: ChartBox): CandleGeometry[] {
  const { min, max } = priceRange(bars);
  const slot = box.width / box.slots;
  const width = Math.max(1, slot * 0.6);

  return bars.map((b, i) => {
    const up = b.close >= b.open;
    const openY = priceToY(b.open, min, max, box);
    const closeY = priceToY(b.close, min, max, box);
    return {
      x: box.left + slot * i + slot / 2,
      width,
      wickTop: priceToY(b.high, min, max, box),
      wickBottom: priceToY(b.low, min, max, box),
      bodyTop: Math.min(openY, closeY),
      bodyHeight: Math.max(1, Math.abs(closeY - openY)),
      up,
    };
  });
}
