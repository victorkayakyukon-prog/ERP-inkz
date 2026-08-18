import type { Role } from '@prisma/client';
import { forbidden } from './errors.js';

/**
 * Permissions are coarse-grained on purpose: a sign shop has a handful of
 * distinct jobs to do, and the roles map onto them almost one-to-one.
 */
export const PERMISSIONS = [
  'crm:read',
  'crm:write',
  'quote:read',
  'quote:write',
  'job:read',
  'job:write',
  'job:stage', // move a job through the production pipeline
  'production:read',
  'production:write',
  'install:read',
  'install:write',
  'inventory:read',
  'inventory:write',
  'invoice:read',
  'invoice:write',
  'report:read',
  'pricing:read', // see money on jobs — shop floor does not need it
  'settings:write',
  'user:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  MANAGER: ALL.filter((p) => p !== 'user:manage'),
  SALES: [
    'crm:read',
    'crm:write',
    'quote:read',
    'quote:write',
    'job:read',
    'job:write',
    'job:stage',
    'production:read',
    'install:read',
    'install:write',
    'inventory:read',
    'invoice:read',
    'invoice:write',
    'report:read',
    'pricing:read',
  ],
  PRODUCTION: [
    'crm:read',
    'job:read',
    'job:stage',
    'production:read',
    'production:write',
    'install:read',
    'inventory:read',
    'inventory:write',
  ],
  INSTALLER: ['job:read', 'install:read', 'install:write', 'production:read'],
};

export function roleHas(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!roleHas(role, permission)) {
    throw forbidden(`Role ${role} is missing permission "${permission}"`);
  }
}

/** Fields stripped from API responses for roles without pricing visibility. */
const PRICE_FIELDS = new Set([
  'contractTotal',
  'quotedMaterialCost',
  'lineTotal',
  'materialCost',
  'unitCost',
  'pricePerSqFt',
  'materialCostPerSqFt',
  'minimumCharge',
  'laborRate',
  'installRate',
  'markupPct',
  'subtotal',
  'discount',
  'rushFee',
  'taxAmount',
  'total',
  'amountPaid',
  'balance',
  'unitPrice',
  'amount',
  'estimatedValue',
  'lineTotal',
]);

/**
 * Recursively removes money fields so the shop-floor and install views never
 * carry pricing over the wire in the first place.
 */
export function stripPricing<T>(payload: T): T {
  if (Array.isArray(payload)) return payload.map((entry) => stripPricing(entry)) as unknown as T;
  if (payload && typeof payload === 'object' && !(payload instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (PRICE_FIELDS.has(key)) continue;
      out[key] = stripPricing(value);
    }
    return out as T;
  }
  return payload;
}

export function visibleTo<T>(role: Role, payload: T): T {
  return roleHas(role, 'pricing:read') ? payload : stripPricing(payload);
}
