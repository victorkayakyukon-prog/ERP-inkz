import { Prisma } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
import { getSettings, pricingDefaultsFrom } from '../../lib/settings.js';
import { priceLine, totalQuote, type LineInput } from './pricing.js';
import { notFound } from '../../lib/errors.js';

/**
 * Re-prices every line on a quote and writes the totals back. Called after any
 * write that could affect price, so stored totals always match the engine.
 */
export async function recalculateQuote(tx: Tx, quoteId: string) {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!quote) throw notFound('Quote not found');

  const settings = await getSettings();
  const defaults = pricingDefaultsFrom(settings);

  const priced = quote.items.map((item) => {
    const input: LineInput = {
      widthIn: item.widthIn,
      heightIn: item.heightIn,
      quantity: item.quantity,
      pricePerSqFt: item.pricePerSqFt,
      materialCostPerSqFt: item.materialCostPerSqFt,
      minimumCharge: item.minimumCharge,
      laminate: item.laminate,
      mounting: item.mounting,
      contourCut: item.contourCut,
      grommets: item.grommets,
      hemmed: item.hemmed,
      laborHours: item.laborHours,
      laborRate: item.laborRate,
      markupPct: item.markupPct,
      installRequired: item.installRequired,
      installHours: item.installHours,
      installRate: item.installRate,
    };
    return { item, pricing: priceLine(input, defaults) };
  });

  const totals = totalQuote(
    priced.map((p) => p.pricing),
    {
      discountPct: quote.discountPct,
      rushFeePct: quote.rushFeePct,
      taxRatePct: quote.taxRatePct,
    },
  );

  for (const { item, pricing } of priced) {
    await tx.quoteItem.update({
      where: { id: item.id },
      data: {
        areaSqFt: pricing.areaSqFt,
        materialCost: pricing.materialCost,
        lineTotal: pricing.lineTotal,
      },
    });
  }

  return tx.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      rushFee: totals.rushFee,
      taxAmount: totals.taxAmount,
      total: totals.total,
      materialCost: totals.materialCost,
    },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, include: { material: true } },
      company: true,
      contact: true,
      opportunity: { select: { id: true, title: true, stage: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/**
 * Fills in pricing defaults for a new line: material snapshot first, then
 * shop-wide defaults. Snapshotting means a later catalog price change does
 * not silently rewrite an old quote.
 */
export async function resolveLineDefaults(
  tx: Tx,
  input: {
    materialId?: string | null;
    pricePerSqFt?: number | null;
    materialCostPerSqFt?: number | null;
    minimumCharge?: number | null;
    markupPct?: number | null;
    laborRate?: number | null;
    installRate?: number | null;
  },
) {
  const settings = await getSettings();
  const material = input.materialId
    ? await tx.material.findUnique({ where: { id: input.materialId } })
    : null;

  const materialSqFtCost = material ? costPerSqFt(material) : new Prisma.Decimal(0);

  return {
    pricePerSqFt: input.pricePerSqFt ?? material?.pricePerSqFt ?? new Prisma.Decimal(0),
    materialCostPerSqFt: input.materialCostPerSqFt ?? materialSqFtCost,
    minimumCharge:
      input.minimumCharge ??
      (material && !material.minimumCharge.isZero()
        ? material.minimumCharge
        : settings.defaultMinimumCharge),
    markupPct: input.markupPct ?? settings.defaultMarkupPct,
    laborRate: input.laborRate ?? settings.laborRate,
    installRate: input.installRate ?? settings.installRate,
  };
}

/** Converts a material's purchase cost into a per-square-foot cost. */
export function costPerSqFt(material: {
  unit: string;
  unitCost: Prisma.Decimal;
  sheetWidthIn: Prisma.Decimal | null;
  sheetHeightIn: Prisma.Decimal | null;
}): Prisma.Decimal {
  if (material.unit === 'SQFT') return material.unitCost;
  if (material.sheetWidthIn && material.sheetHeightIn) {
    const sheetSqFt = new Prisma.Decimal(material.sheetWidthIn)
      .times(material.sheetHeightIn)
      .dividedBy(144);
    if (!sheetSqFt.isZero()) {
      return material.unitCost.dividedBy(sheetSqFt).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    }
  }
  return new Prisma.Decimal(0);
}
