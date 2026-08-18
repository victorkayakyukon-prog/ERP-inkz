import { prisma } from './db.js';
import type { Setting } from '@prisma/client';
import type { PricingDefaults } from '../modules/quotes/pricing.js';

/** Single-row shop configuration; created on first read. */
export async function getSettings(): Promise<Setting> {
  const existing = await prisma.setting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.setting.create({ data: { id: 1 } });
}

export function pricingDefaultsFrom(settings: Setting): PricingDefaults {
  return {
    laminateCostPerSqFt: settings.laminateCostPerSqFt,
    mountingCostPerSqFt: settings.mountingCostPerSqFt,
    contourCutFee: settings.contourCutFee,
    grommetFee: settings.grommetFee,
    hemFeePerLinearFt: settings.hemFeePerLinearFt,
  };
}
