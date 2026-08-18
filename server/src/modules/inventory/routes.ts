import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { authenticate, currentUser, requirePermission } from '../../lib/auth.js';
import {
  idParam, optionalDate, optionalString, paginate, paginationSchema,
  parseBody, parseParams, parseQuery, skipTake,
} from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { nextNumber } from '../../lib/numbering.js';
import { money } from '../../lib/money.js';

const CATEGORIES = ['SUBSTRATE', 'VINYL', 'INK', 'LAMINATE', 'HARDWARE', 'PAINT', 'ELECTRICAL', 'OTHER'] as const;
const UNITS = ['SQFT', 'EACH', 'ROLL', 'SHEET', 'LINEAR_FT', 'LITER', 'GALLON'] as const;

const materialSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(CATEGORIES).default('OTHER'),
  unit: z.enum(UNITS).default('SQFT'),
  unitCost: z.coerce.number().min(0),
  pricePerSqFt: z.coerce.number().min(0).default(0),
  minimumCharge: z.coerce.number().min(0).default(0),
  sheetWidthIn: z.coerce.number().min(0).nullish(),
  sheetHeightIn: z.coerce.number().min(0).nullish(),
  stockQty: z.coerce.number().default(0),
  reorderPoint: z.coerce.number().min(0).default(0),
  reorderQty: z.coerce.number().min(0).default(0),
  vendorId: optionalString,
  active: z.boolean().default(true),
  notes: optionalString,
});

const vendorSchema = z.object({
  name: z.string().min(1),
  contactName: optionalString,
  email: optionalString,
  phone: optionalString,
  website: optionalString,
  street: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  notes: optionalString,
  active: z.boolean().default(true),
});

const poSchema = z.object({
  vendorId: z.string().min(1),
  expectedAt: optionalDate,
  notes: optionalString,
  items: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantityOrdered: z.coerce.number().positive(),
        unitCost: z.coerce.number().min(0).optional(),
      }),
    )
    .default([]),
});

/** Recomputes a PO total and rolls the status forward as receipts land. */
async function refreshPurchaseOrder(tx: Prisma.TransactionClient, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
  if (!po) throw notFound('Purchase order not found');

  const total = po.items.reduce(
    (sum, item) => sum.plus(item.quantityOrdered.times(item.unitCost)),
    new Prisma.Decimal(0),
  );

  let status = po.status;
  if (po.status !== 'DRAFT' && po.status !== 'CANCELLED' && po.items.length) {
    const fullyReceived = po.items.every((item) => item.quantityReceived.greaterThanOrEqualTo(item.quantityOrdered));
    const anyReceived = po.items.some((item) => item.quantityReceived.greaterThan(0));
    status = fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status;
  }

  return tx.purchaseOrder.update({
    where: { id: poId },
    data: {
      total: money(total),
      status,
      ...(status === 'RECEIVED' && !po.receivedAt ? { receivedAt: new Date() } : {}),
    },
    include: { items: { include: { material: true } }, vendor: true },
  });
}

export async function inventoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // --- materials -----------------------------------------------------------

  app.get('/materials', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        q: z.string().optional(),
        category: z.enum(CATEGORIES).optional(),
        lowStock: z.coerce.boolean().optional(),
        includeInactive: z.coerce.boolean().default(false),
      }),
      request,
    );
    const where: Prisma.MaterialWhereInput = {
      ...(query.includeInactive ? {} : { active: true }),
      ...(query.category ? { category: query.category } : {}),
      ...(query.q
        ? {
            OR: [
              { sku: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.material.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.material.count({ where }),
    ]);

    // Low stock is a comparison between two columns, which Prisma cannot
    // express in a filter, so it is applied after the query.
    const data = rows
      .map((row) => ({ ...row, lowStock: row.stockQty.lessThanOrEqualTo(row.reorderPoint) }))
      .filter((row) => (query.lowStock ? row.lowStock : true));

    return paginate(data, query.lowStock ? data.length : total, query.page, query.pageSize);
  });

  app.get('/materials/low-stock', { preHandler: requirePermission('inventory:read') }, async () => {
    const materials = await prisma.material.findMany({
      where: { active: true },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return materials
      .filter((m) => m.stockQty.lessThanOrEqualTo(m.reorderPoint))
      .map((m) => ({
        ...m,
        shortfall: m.reorderPoint.minus(m.stockQty),
        suggestedOrderQty: m.reorderQty.greaterThan(0)
          ? m.reorderQty
          : m.reorderPoint.minus(m.stockQty),
      }));
  });

  app.get('/materials/:id', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const material = await prisma.material.findUnique({
      where: { id },
      include: {
        vendor: true,
        stockMovements: {
          include: {
            user: { select: { id: true, name: true } },
            job: { select: { id: true, jobNumber: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!material) throw notFound('Material not found');
    return { ...material, lowStock: material.stockQty.lessThanOrEqualTo(material.reorderPoint) };
  });

  app.post('/materials', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const body = parseBody(materialSchema, request);
    const actor = currentUser(request);
    const material = await prisma.material.create({ data: body as Prisma.MaterialUncheckedCreateInput });
    await recordAudit({
      entity: 'Material', entityId: material.id, action: 'create', userId: actor.id,
      summary: `Created material ${material.sku} — ${material.name}`,
    });
    return material;
  });

  app.patch('/materials/:id', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    // Stock only moves through movements, so it is never patched directly.
    const body = parseBody(materialSchema.partial().omit({ stockQty: true }), request);
    return prisma.material.update({ where: { id }, data: body as Prisma.MaterialUncheckedUpdateInput });
  });

  app.delete('/materials/:id', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    // Materials are referenced by historical quotes, so retire rather than delete.
    return prisma.material.update({ where: { id }, data: { active: false } });
  });

  // --- stock movements -----------------------------------------------------

  app.get('/stock-movements', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({ materialId: z.string().optional(), jobId: z.string().optional() }),
      request,
    );
    const where: Prisma.StockMovementWhereInput = {
      ...(query.materialId ? { materialId: query.materialId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          material: { select: { id: true, sku: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
          job: { select: { id: true, jobNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.stockMovement.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  /** Manual adjustment — cycle counts, waste, returns to the shelf. */
  app.post('/stock-movements', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const body = parseBody(
      z.object({
        materialId: z.string().min(1),
        type: z.enum(['RECEIPT', 'USAGE', 'ADJUSTMENT', 'RETURN', 'WASTE']),
        quantity: z.coerce.number(),
        jobId: optionalString,
        note: optionalString,
      }),
      request,
    );
    const actor = currentUser(request);
    if (body.quantity === 0) throw badRequest('Quantity cannot be zero');

    return prisma.$transaction(async (tx) => {
      const material = await tx.material.findUnique({ where: { id: body.materialId } });
      if (!material) throw notFound('Material not found');

      // USAGE and WASTE always reduce stock regardless of the sign submitted.
      const signed =
        body.type === 'USAGE' || body.type === 'WASTE'
          ? new Prisma.Decimal(Math.abs(body.quantity)).negated()
          : new Prisma.Decimal(body.quantity);

      const balanceAfter = material.stockQty.plus(signed);
      await tx.material.update({ where: { id: material.id }, data: { stockQty: balanceAfter } });
      return tx.stockMovement.create({
        data: {
          materialId: material.id,
          type: body.type,
          quantity: signed,
          balanceAfter,
          unitCost: material.unitCost,
          jobId: body.jobId ?? null,
          userId: actor.id,
          note: body.note ?? null,
        },
        include: { material: { select: { id: true, sku: true, name: true, unit: true } } },
      });
    });
  });

  // --- vendors -------------------------------------------------------------

  app.get('/vendors', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const query = parseQuery(z.object({ q: z.string().optional() }), request);
    return prisma.vendor.findMany({
      where: {
        active: true,
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { materials: true, purchaseOrders: true } } },
      orderBy: { name: 'asc' },
    });
  });

  app.get('/vendors/:id', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        materials: { where: { active: true }, orderBy: { name: 'asc' } },
        purchaseOrders: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!vendor) throw notFound('Vendor not found');
    return vendor;
  });

  app.post('/vendors', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const body = parseBody(vendorSchema, request);
    return prisma.vendor.create({ data: body as Prisma.VendorUncheckedCreateInput });
  });

  app.patch('/vendors/:id', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(vendorSchema.partial(), request);
    return prisma.vendor.update({ where: { id }, data: body as Prisma.VendorUncheckedUpdateInput });
  });

  // --- purchase orders -----------------------------------------------------

  app.get('/purchase-orders', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        status: z.enum(['DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED']).optional(),
        vendorId: z.string().optional(),
      }),
      request,
    );
    const where: Prisma.PurchaseOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } }, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  app.get('/purchase-orders/:id', { preHandler: requirePermission('inventory:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { vendor: true, items: { include: { material: true } } },
    });
    if (!po) throw notFound('Purchase order not found');
    return po;
  });

  app.post('/purchase-orders', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const body = parseBody(poSchema, request);
    const actor = currentUser(request);

    const po = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'po');
      const created = await tx.purchaseOrder.create({
        data: {
          number,
          vendorId: body.vendorId,
          expectedAt: body.expectedAt ?? null,
          notes: body.notes ?? null,
        },
      });
      for (const item of body.items) {
        const material = await tx.material.findUnique({ where: { id: item.materialId } });
        if (!material) throw notFound(`Material ${item.materialId} not found`);
        const unitCost = new Prisma.Decimal(item.unitCost ?? material.unitCost);
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: created.id,
            materialId: item.materialId,
            quantityOrdered: item.quantityOrdered,
            unitCost,
            lineTotal: money(unitCost.times(item.quantityOrdered)),
          },
        });
      }
      return refreshPurchaseOrder(tx, created.id);
    });

    await recordAudit({
      entity: 'PurchaseOrder', entityId: po.id, action: 'create', userId: actor.id,
      summary: `Created ${po.number} for ${po.vendor.name}`,
    });
    return po;
  });

  /** Builds a draft PO per vendor for everything at or under its reorder point. */
  app.post('/purchase-orders/suggest', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const actor = currentUser(request);
    const materials = await prisma.material.findMany({
      where: { active: true, vendorId: { not: null } },
      include: { vendor: true },
    });
    const short = materials.filter((m) => m.stockQty.lessThanOrEqualTo(m.reorderPoint));
    if (!short.length) return { created: [], message: 'Nothing is below its reorder point' };

    const byVendor = new Map<string, typeof short>();
    for (const material of short) {
      const list = byVendor.get(material.vendorId!) ?? [];
      list.push(material);
      byVendor.set(material.vendorId!, list);
    }

    const created = await prisma.$transaction(async (tx) => {
      const orders = [];
      for (const [vendorId, items] of byVendor) {
        const number = await nextNumber(tx, 'po');
        const po = await tx.purchaseOrder.create({
          data: { number, vendorId, notes: 'Auto-generated from low stock levels' },
        });
        for (const material of items) {
          const quantity = material.reorderQty.greaterThan(0)
            ? material.reorderQty
            : material.reorderPoint.minus(material.stockQty);
          await tx.purchaseOrderItem.create({
            data: {
              purchaseOrderId: po.id,
              materialId: material.id,
              quantityOrdered: quantity,
              unitCost: material.unitCost,
              lineTotal: money(material.unitCost.times(quantity)),
            },
          });
        }
        orders.push(await refreshPurchaseOrder(tx, po.id));
      }
      return orders;
    });

    await recordAudit({
      entity: 'PurchaseOrder', entityId: created[0]?.id ?? 'bulk', action: 'create', userId: actor.id,
      summary: `Generated ${created.length} draft PO(s) from low stock`,
    });
    return { created, message: `Created ${created.length} draft purchase order(s)` };
  });

  app.post('/purchase-orders/:id/send', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
    if (!po) throw notFound('Purchase order not found');
    if (!po.items.length) throw badRequest('Add at least one line before sending this PO');
    // TODO: email the PO to the vendor once an email provider is configured.
    return prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', orderedAt: new Date() },
      include: { vendor: true, items: { include: { material: true } } },
    });
  });

  /** Receiving: increments stock and records a RECEIPT movement per line. */
  app.post('/purchase-orders/:id/receive', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({
        lines: z.array(z.object({ itemId: z.string(), quantity: z.coerce.number().positive() })).min(1),
      }),
      request,
    );
    const actor = currentUser(request);

    return prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!po) throw notFound('Purchase order not found');
      if (po.status === 'CANCELLED') throw badRequest('This purchase order was cancelled');

      for (const line of body.lines) {
        const item = po.items.find((i) => i.id === line.itemId);
        if (!item) throw notFound(`Line ${line.itemId} is not on this purchase order`);

        const material = await tx.material.findUniqueOrThrow({ where: { id: item.materialId } });
        const balanceAfter = material.stockQty.plus(line.quantity);

        await tx.material.update({
          where: { id: material.id },
          // Receiving at a new price updates the standard cost going forward.
          data: { stockQty: balanceAfter, unitCost: item.unitCost },
        });
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: { increment: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            materialId: material.id,
            type: 'RECEIPT',
            quantity: new Prisma.Decimal(line.quantity),
            balanceAfter,
            unitCost: item.unitCost,
            purchaseOrderId: po.id,
            userId: actor.id,
            note: `Received on ${po.number}`,
          },
        });
      }
      return refreshPurchaseOrder(tx, id);
    });
  });

  app.post('/purchase-orders/:id/cancel', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    return prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  });

  app.delete('/purchase-orders/:id', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const po = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw notFound('Purchase order not found');
    if (po.status !== 'DRAFT') throw badRequest('Only a draft purchase order can be deleted');
    await prisma.purchaseOrder.delete({ where: { id } });
    return { ok: true };
  });
}
