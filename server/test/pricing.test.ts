import { describe, expect, it } from 'vitest';
import { priceLine, priceQuote, totalQuote } from '../src/modules/quotes/pricing.js';

const defaults = {
  laminateCostPerSqFt: 1.25,
  mountingCostPerSqFt: 2.5,
  contourCutFee: 25,
  grommetFee: 0.75,
  hemFeePerLinearFt: 1.5,
};

describe('priceLine', () => {
  it('prices by area with markup', () => {
    // 48" x 96" = 32 sq ft at $9/sqft = $288, +35% markup = $388.80
    const line = priceLine(
      { widthIn: 48, heightIn: 96, quantity: 1, pricePerSqFt: 9, markupPct: 35 },
      defaults,
    );
    expect(line.areaSqFt.toString()).toBe('32');
    expect(line.materialSell.toString()).toBe('288');
    expect(line.markup.toString()).toBe('100.8');
    expect(line.lineTotal.toString()).toBe('388.8');
  });

  it('multiplies area by quantity', () => {
    const line = priceLine(
      { widthIn: 24, heightIn: 18, quantity: 10, pricePerSqFt: 4 },
      defaults,
    );
    expect(line.areaSqFt.toString()).toBe('30'); // 3 sq ft x 10
    expect(line.lineTotal.toString()).toBe('120');
  });

  it('applies the minimum charge to small pieces', () => {
    const line = priceLine(
      { widthIn: 6, heightIn: 6, quantity: 1, pricePerSqFt: 8, minimumCharge: 75 },
      defaults,
    );
    expect(line.computedTotal.toString()).toBe('2');
    expect(line.minimumApplied).toBe(true);
    expect(line.lineTotal.toString()).toBe('75');
  });

  it('does not bill a minimum on an empty line', () => {
    const line = priceLine(
      { widthIn: 0, heightIn: 0, quantity: 1, pricePerSqFt: 8, minimumCharge: 75 },
      defaults,
    );
    expect(line.minimumApplied).toBe(false);
    expect(line.lineTotal.toString()).toBe('0');
  });

  it('adds laminate and mounting per square foot', () => {
    const line = priceLine(
      {
        widthIn: 24,
        heightIn: 24,
        quantity: 1,
        pricePerSqFt: 10,
        laminate: true,
        mounting: true,
      },
      defaults,
    );
    // 4 sq ft: material 40, laminate 5, mounting 10
    expect(line.finishing.toString()).toBe('15');
    expect(line.lineTotal.toString()).toBe('55');
  });

  it('charges grommets around the perimeter with a 4-grommet floor', () => {
    // 36x24 banner: perimeter 120in -> 5 grommets at $0.75
    const banner = priceLine(
      { widthIn: 36, heightIn: 24, quantity: 1, pricePerSqFt: 0, grommets: true },
      defaults,
    );
    expect(banner.finishing.toString()).toBe('3.75');

    // A tiny piece still gets the 4-grommet minimum
    const small = priceLine(
      { widthIn: 6, heightIn: 6, quantity: 1, pricePerSqFt: 0, grommets: true },
      defaults,
    );
    expect(small.finishing.toString()).toBe('3');
  });

  it('bills install hours outside the markup', () => {
    const line = priceLine(
      {
        widthIn: 12,
        heightIn: 12,
        quantity: 1,
        pricePerSqFt: 100,
        markupPct: 50,
        installRequired: true,
        installHours: 2,
        installRate: 95,
      },
      defaults,
    );
    // 1 sq ft * 100 = 100, +50% = 150, + (2 * 95) = 340
    expect(line.install.toString()).toBe('190');
    expect(line.lineTotal.toString()).toBe('340');
  });

  it('ignores install hours when install is not required', () => {
    const line = priceLine(
      {
        widthIn: 12, heightIn: 12, quantity: 1, pricePerSqFt: 100,
        installRequired: false, installHours: 2, installRate: 95,
      },
      defaults,
    );
    expect(line.install.toString()).toBe('0');
    expect(line.lineTotal.toString()).toBe('100');
  });

  it('tracks material cost separately from sell price', () => {
    const line = priceLine(
      { widthIn: 48, heightIn: 48, quantity: 1, pricePerSqFt: 12, materialCostPerSqFt: 3.5 },
      defaults,
    );
    expect(line.areaSqFt.toString()).toBe('16');
    expect(line.materialCost.toString()).toBe('56');
    expect(line.lineTotal.toString()).toBe('192');
  });
});

describe('totalQuote', () => {
  it('applies discount, then rush fee, then tax in order', () => {
    const lines = [
      priceLine({ widthIn: 12, heightIn: 12, quantity: 1, pricePerSqFt: 1000 }, defaults),
    ];
    const totals = totalQuote(lines, { discountPct: 10, rushFeePct: 25, taxRatePct: 8.25 });
    expect(totals.subtotal.toString()).toBe('1000');
    expect(totals.discount.toString()).toBe('100');
    expect(totals.rushFee.toString()).toBe('225'); // 25% of 900
    expect(totals.taxableBase.toString()).toBe('1125');
    expect(totals.taxAmount.toString()).toBe('92.81');
    expect(totals.total.toString()).toBe('1217.81');
  });

  it('reports gross margin against material cost', () => {
    const { totals } = priceQuote(
      [{ widthIn: 144, heightIn: 48, quantity: 1, pricePerSqFt: 10, materialCostPerSqFt: 2.5 }],
      { taxRatePct: 0 },
      defaults,
    );
    // 48 sq ft: sell 480, cost 120
    expect(totals.subtotal.toString()).toBe('480');
    expect(totals.materialCost.toString()).toBe('120');
    expect(totals.grossMargin.toString()).toBe('360');
    expect(totals.grossMarginPct.toString()).toBe('75');
  });

  it('handles an empty quote without dividing by zero', () => {
    const totals = totalQuote([], { discountPct: 10, taxRatePct: 8.25 });
    expect(totals.total.toString()).toBe('0');
    expect(totals.grossMarginPct.toString()).toBe('0');
  });

  it('does not drift on repeated cent rounding', () => {
    const lines = Array.from({ length: 100 }, () =>
      priceLine({ widthIn: 10, heightIn: 10, quantity: 1, pricePerSqFt: 1.115 }, defaults),
    );
    const totals = totalQuote(lines, {});
    // 100 sq in = 0.6944 sq ft -> 0.77 per line, exactly 77.00 across 100 lines
    expect(totals.subtotal.toString()).toBe('77');
  });
});
