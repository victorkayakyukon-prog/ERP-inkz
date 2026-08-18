import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';
import type { Role } from '@prisma/client';

export async function resetDatabase(): Promise<void> {
  // Truncate everything but leave the schema in place; RESTART IDENTITY keeps
  // the document counters from carrying over between tests.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface TestContext {
  app: FastifyInstance;
  tokens: Record<string, string>;
}

export async function createTestApp(): Promise<TestContext> {
  const app = await buildApp();
  await app.ready();

  const roles: Array<[string, Role]> = [
    ['admin', 'ADMIN'],
    ['manager', 'MANAGER'],
    ['sales', 'SALES'],
    ['production', 'PRODUCTION'],
    ['installer', 'INSTALLER'],
  ];
  const passwordHash = await hashPassword('password123');
  const tokens: Record<string, string> = {};

  for (const [key, role] of roles) {
    const user = await prisma.user.create({
      data: { email: `${key}@test.local`, name: `${key} user`, role, passwordHash },
    });
    tokens[key] = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role });
  }
  return { app, tokens };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Minimal customer + material fixture used by most of the flow tests. */
export async function seedBasics() {
  const company = await prisma.company.create({
    data: {
      name: 'Test Signs Customer',
      billingStreet: '100 Main St',
      billingCity: 'Austin',
      billingState: 'TX',
      billingZip: '78701',
    },
  });
  const contact = await prisma.contact.create({
    data: { companyId: company.id, firstName: 'Pat', lastName: 'Buyer', isPrimary: true },
  });
  const material = await prisma.material.create({
    data: {
      sku: 'TEST-ACM',
      name: 'Test ACM 48x96',
      category: 'SUBSTRATE',
      unit: 'SHEET',
      unitCost: 64, // 32 sq ft per sheet -> $2/sq ft
      pricePerSqFt: 10,
      sheetWidthIn: 48,
      sheetHeightIn: 96,
      stockQty: 20,
      reorderPoint: 5,
      reorderQty: 10,
    },
  });
  await prisma.setting.create({
    data: { id: 1, defaultTaxRatePct: 10, defaultMarkupPct: 0, defaultMinimumCharge: 0, depositPct: 50 },
  });
  return { company, contact, material };
}
