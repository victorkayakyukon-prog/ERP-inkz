import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ROLE_PERMISSIONS, roleHas, stripPricing, visibleTo } from '../src/lib/rbac.js';

describe('stripPricing', () => {
  it('removes money fields at every depth', () => {
    const job = {
      jobNumber: 'J-2026-0001',
      contractTotal: 5000,
      items: [{ description: 'Panel', lineTotal: 250, materialCost: 60, quantity: 2 }],
      company: { name: 'Acme', estimatedValue: 100 },
    };
    const stripped = stripPricing(job) as Record<string, never>;

    expect(stripped.jobNumber).toBe('J-2026-0001');
    expect(stripped.contractTotal).toBeUndefined();
    expect(stripped.items[0].description).toBe('Panel');
    expect(stripped.items[0].quantity).toBe(2);
    expect(stripped.items[0].lineTotal).toBeUndefined();
    expect(stripped.items[0].materialCost).toBeUndefined();
    expect(stripped.company.name).toBe('Acme');
    expect(stripped.company.estimatedValue).toBeUndefined();
  });

  it('leaves Decimal and Date instances intact', () => {
    // Rebuilding these as plain objects would serialize them as
    // "[object Object]" on the shop-floor and install-crew screens.
    const payload = {
      widthIn: new Prisma.Decimal('48.5'),
      areaSqFt: new Prisma.Decimal('32'),
      dueDate: new Date('2026-06-01T00:00:00Z'),
      lineTotal: new Prisma.Decimal('999'),
    };
    const stripped = stripPricing(payload);

    expect(stripped.widthIn).toBeInstanceOf(Prisma.Decimal);
    expect(stripped.widthIn.toString()).toBe('48.5');
    expect(stripped.areaSqFt.toNumber()).toBe(32);
    expect(stripped.dueDate).toBeInstanceOf(Date);
    expect((stripped as Record<string, unknown>).lineTotal).toBeUndefined();
  });

  it('handles nulls and primitives without throwing', () => {
    expect(stripPricing(null)).toBeNull();
    expect(stripPricing(undefined)).toBeUndefined();
    expect(stripPricing('text')).toBe('text');
    expect(stripPricing({ a: null, total: 5 })).toEqual({ a: null });
  });
});

describe('visibleTo', () => {
  const job = { jobNumber: 'J-1', contractTotal: 1000 };

  it('keeps pricing for roles that can see it', () => {
    for (const role of ['ADMIN', 'MANAGER', 'SALES'] as const) {
      expect(visibleTo(role, job).contractTotal).toBe(1000);
    }
  });

  it('hides pricing from the shop floor and install crew', () => {
    for (const role of ['PRODUCTION', 'INSTALLER'] as const) {
      expect(visibleTo(role, job).contractTotal).toBeUndefined();
      expect(visibleTo(role, job).jobNumber).toBe('J-1');
    }
  });
});

describe('role permissions', () => {
  it('gives admin every permission', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain('user:manage');
    expect(ROLE_PERMISSIONS.ADMIN).toContain('settings:write');
  });

  it('reserves user management for admins', () => {
    for (const role of ['MANAGER', 'SALES', 'PRODUCTION', 'INSTALLER'] as const) {
      expect(roleHas(role, 'user:manage')).toBe(false);
    }
  });

  it('lets a sales rep run their own jobs and installs end to end', () => {
    for (const permission of ['quote:write', 'job:stage', 'install:write', 'invoice:write'] as const) {
      expect(roleHas('SALES', permission)).toBe(true);
    }
  });

  it('keeps the shop floor out of quoting and invoicing', () => {
    for (const permission of ['quote:read', 'invoice:read', 'pricing:read'] as const) {
      expect(roleHas('PRODUCTION', permission)).toBe(false);
    }
    expect(roleHas('PRODUCTION', 'job:stage')).toBe(true);
    expect(roleHas('PRODUCTION', 'inventory:write')).toBe(true);
  });

  it('limits the install crew to install work', () => {
    expect(roleHas('INSTALLER', 'install:write')).toBe(true);
    expect(roleHas('INSTALLER', 'job:read')).toBe(true);
    for (const permission of ['inventory:read', 'crm:read', 'job:write'] as const) {
      expect(roleHas('INSTALLER', permission)).toBe(false);
    }
  });
});
