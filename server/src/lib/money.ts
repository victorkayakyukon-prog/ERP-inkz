import { Prisma } from '@prisma/client';

/**
 * All money and quantity math runs through Prisma.Decimal so that repeated
 * rounding in the pricing engine never drifts the way binary floats do.
 */
export type Numeric = Prisma.Decimal | number | string | null | undefined;

export const D = (value: Numeric): Prisma.Decimal =>
  value === null || value === undefined ? new Prisma.Decimal(0) : new Prisma.Decimal(value as never);

/** Round to cents, half-up — what an invoice line is expected to do. */
export const money = (value: Numeric): Prisma.Decimal =>
  D(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/** Round to a given precision for areas/quantities. */
export const round = (value: Numeric, dp = 4): Prisma.Decimal =>
  D(value).toDecimalPlaces(dp, Prisma.Decimal.ROUND_HALF_UP);

export const sum = (values: Numeric[]): Prisma.Decimal =>
  values.reduce<Prisma.Decimal>((acc, v) => acc.plus(D(v)), new Prisma.Decimal(0));

export const pct = (value: Numeric, percent: Numeric): Prisma.Decimal =>
  D(value).times(D(percent)).dividedBy(100);

export const toNumber = (value: Numeric): number => D(value).toNumber();

export const isZero = (value: Numeric): boolean => D(value).isZero();
