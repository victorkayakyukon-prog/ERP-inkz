import { Prisma } from '@prisma/client';
import { D, money, pct, round, sum, type Numeric } from '../../lib/money.js';

/**
 * The pricing engine is deliberately pure: no database, no clock, no IDs.
 * Everything the calculation needs is passed in, which makes the shop's
 * pricing rules testable in isolation and safe to re-run on stored quotes.
 */

export interface PricingDefaults {
  laminateCostPerSqFt: Numeric;
  mountingCostPerSqFt: Numeric;
  contourCutFee: Numeric;
  grommetFee: Numeric;
  hemFeePerLinearFt: Numeric;
}

export interface LineInput {
  widthIn: Numeric;
  heightIn: Numeric;
  quantity: number;
  /** Sell price per square foot, snapshotted from the material catalog. */
  pricePerSqFt: Numeric;
  /** Our cost per square foot, used for the margin report. */
  materialCostPerSqFt?: Numeric;
  /** Floor for this line — a 6"x6" decal still costs the shop a setup. */
  minimumCharge?: Numeric;

  laminate?: boolean;
  mounting?: boolean;
  contourCut?: boolean;
  grommets?: boolean;
  hemmed?: boolean;

  laborHours?: Numeric;
  laborRate?: Numeric;
  markupPct?: Numeric;

  installRequired?: boolean;
  installHours?: Numeric;
  installRate?: Numeric;
}

export interface LinePricing {
  areaSqFt: Prisma.Decimal;
  perimeterFt: Prisma.Decimal;
  materialSell: Prisma.Decimal;
  finishing: Prisma.Decimal;
  labor: Prisma.Decimal;
  install: Prisma.Decimal;
  markup: Prisma.Decimal;
  /** What the shop pays for the substrate on this line. */
  materialCost: Prisma.Decimal;
  /** Price before the per-line minimum charge is applied. */
  computedTotal: Prisma.Decimal;
  minimumApplied: boolean;
  lineTotal: Prisma.Decimal;
}

/** Grommets are placed roughly every 24 inches around the perimeter. */
const GROMMET_SPACING_IN = 24;

export function priceLine(input: LineInput, defaults: PricingDefaults): LinePricing {
  const quantity = Math.max(0, Math.trunc(input.quantity ?? 1));
  const widthIn = D(input.widthIn);
  const heightIn = D(input.heightIn);

  const unitAreaSqFt = widthIn.times(heightIn).dividedBy(144);
  const areaSqFt = round(unitAreaSqFt.times(quantity), 4);
  const unitPerimeterFt = widthIn.plus(heightIn).times(2).dividedBy(12);
  const perimeterFt = round(unitPerimeterFt.times(quantity), 4);

  const materialSell = areaSqFt.times(D(input.pricePerSqFt));
  const materialCost = money(areaSqFt.times(D(input.materialCostPerSqFt)));

  const finishingParts: Prisma.Decimal[] = [];
  if (input.laminate) finishingParts.push(areaSqFt.times(D(defaults.laminateCostPerSqFt)));
  if (input.mounting) finishingParts.push(areaSqFt.times(D(defaults.mountingCostPerSqFt)));
  if (input.contourCut) finishingParts.push(D(defaults.contourCutFee).times(quantity));
  if (input.grommets) {
    const grommetsPerPiece = Math.max(
      4,
      Math.ceil(unitPerimeterFt.times(12).dividedBy(GROMMET_SPACING_IN).toNumber() || 0),
    );
    finishingParts.push(D(defaults.grommetFee).times(grommetsPerPiece).times(quantity));
  }
  if (input.hemmed) finishingParts.push(perimeterFt.times(D(defaults.hemFeePerLinearFt)));
  const finishing = sum(finishingParts);

  const labor = D(input.laborHours).times(D(input.laborRate));
  const install = input.installRequired
    ? D(input.installHours).times(D(input.installRate))
    : new Prisma.Decimal(0);

  // Markup covers material, finishing and shop labor. Install is billed at an
  // hourly rate that already carries its own margin, so it sits outside.
  const markupBase = materialSell.plus(finishing).plus(labor);
  const markup = pct(markupBase, D(input.markupPct));

  const computedTotal = money(markupBase.plus(markup).plus(install));
  const minimumCharge = money(input.minimumCharge);
  // A zero-size or zero-quantity line is treated as empty rather than billed
  // at the minimum, so a half-built line item never inflates a quote.
  const billable = quantity > 0 && computedTotal.greaterThan(0);
  const minimumApplied = billable && computedTotal.lessThan(minimumCharge);
  const lineTotal = minimumApplied ? minimumCharge : computedTotal;

  return {
    areaSqFt,
    perimeterFt,
    materialSell: money(materialSell),
    finishing: money(finishing),
    labor: money(labor),
    install: money(install),
    markup: money(markup),
    materialCost,
    computedTotal,
    minimumApplied,
    lineTotal,
  };
}

export interface QuoteLevelInput {
  discountPct?: Numeric;
  rushFeePct?: Numeric;
  taxRatePct?: Numeric;
}

export interface QuoteTotals {
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  rushFee: Prisma.Decimal;
  taxableBase: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
  materialCost: Prisma.Decimal;
  /** Gross margin against known material cost — labor is not deducted here. */
  grossMargin: Prisma.Decimal;
  grossMarginPct: Prisma.Decimal;
}

export function totalQuote(lines: LinePricing[], quote: QuoteLevelInput): QuoteTotals {
  const subtotal = money(sum(lines.map((l) => l.lineTotal)));
  const materialCost = money(sum(lines.map((l) => l.materialCost)));

  const discount = money(pct(subtotal, D(quote.discountPct)));
  const afterDiscount = subtotal.minus(discount);
  const rushFee = money(pct(afterDiscount, D(quote.rushFeePct)));
  const taxableBase = money(afterDiscount.plus(rushFee));
  const taxAmount = money(pct(taxableBase, D(quote.taxRatePct)));
  const total = money(taxableBase.plus(taxAmount));

  const grossMargin = money(taxableBase.minus(materialCost));
  const grossMarginPct = taxableBase.isZero()
    ? new Prisma.Decimal(0)
    : round(grossMargin.dividedBy(taxableBase).times(100), 2);

  return {
    subtotal,
    discount,
    rushFee,
    taxableBase,
    taxAmount,
    total,
    materialCost,
    grossMargin,
    grossMarginPct,
  };
}

/** Convenience for callers that hold raw line inputs rather than priced lines. */
export function priceQuote(
  lines: LineInput[],
  quote: QuoteLevelInput,
  defaults: PricingDefaults,
): { lines: LinePricing[]; totals: QuoteTotals } {
  const priced = lines.map((line) => priceLine(line, defaults));
  return { lines: priced, totals: totalQuote(priced, quote) };
}
