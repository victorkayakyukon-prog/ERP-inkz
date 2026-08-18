import { Prisma } from '@prisma/client';

/**
 * Prisma.Decimal serializes to an object by default, which is useless to the
 * client. Convert every Decimal to a number on the way out so the frontend
 * gets plain JSON. Money stays within a safe integer range at shop scale.
 */
export function serialize<T>(value: T): T {
  if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value as unknown as T;
  if (Array.isArray(value)) return value.map((entry) => serialize(entry)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = serialize(entry);
    }
    return out as T;
  }
  return value;
}
