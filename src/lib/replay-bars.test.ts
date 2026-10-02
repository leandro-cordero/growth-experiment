import { describe, expect, it } from 'vitest';
import { generateBars, layoutCandles, priceRange } from './replay-bars';

const box = { left: 0, top: 10, width: 640, height: 300, slots: 64 };

describe('generateBars', () => {
  it('is deterministic for a seed', () => {
    expect(generateBars(20, 7)).toEqual(generateBars(20, 7));
  });

  it('produces valid OHLC and chains open to previous close', () => {
    const bars = generateBars(50);
    bars.forEach((b, i) => {
      expect(b.high).toBeGreaterThanOrEqual(Math.max(b.open, b.close));
      expect(b.low).toBeLessThanOrEqual(Math.min(b.open, b.close));
      if (i > 0) expect(b.open).toBe(bars[i - 1]!.close);
    });
  });
});

describe('layoutCandles', () => {
  it('keeps every candle inside the chart box', () => {
    const bars = generateBars(48);
    for (const c of layoutCandles(bars, box)) {
      expect(c.wickTop).toBeGreaterThanOrEqual(box.top);
      expect(c.wickBottom).toBeLessThanOrEqual(box.top + box.height);
      expect(c.x).toBeLessThan(box.left + box.width);
      expect(c.bodyHeight).toBeGreaterThanOrEqual(1);
    }
  });

  it('maps the highest high to the top edge', () => {
    const bars = generateBars(30);
    const { max } = priceRange(bars);
    const top = layoutCandles(bars, box).find((_, i) => bars[i]!.high === max);
    expect(top?.wickTop).toBeCloseTo(box.top);
  });
});
