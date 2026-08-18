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
import { getSettings } from '../../lib/settings.js';
import { recalculateQuote, resolveLineDefaults } from './service.js';
import { createJobFromQuote } from '../jobs/service.js';

const SIGN_TYPES = [
  'BANNER', 'VEHICLE_WRAP', 'CHANNEL_LETTERS', 'MONUMENT', 'ADA', 'DECAL',
  'TRADE_SHOW', 'YARD_SIGN', 'WINDOW_GRAPHIC', 'DIMENSIONAL_LETTERS', 'WAYFINDING', 'OTHER',
] as const;

const quoteSchema = z.object({
  title: z.string().min(1),
  companyId: z.string().min(1),
  contactId: optionalString,
  opportunityId: optionalString,
  discountPct: z.coerce.number().min(0).max(100).optional(),
  rushFeePct: z.coerce.number().min(0).optional(),
  taxRatePct: z.coerce.number().min(0).optional(),
  notes: optionalString,
  terms: optionalString,
  validUntil: optionalDate,
});

const itemSchema = z.object({
  signType: z.enum(SIGN_TYPES).default('OTHER'),
  description: z.string().min(1),
  widthIn: z.coerce.number().min(0).default(0),
  heightIn: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().int().min(1).default(1),
  materialId: optionalString,
  pricePerSqFt: z.coerce.number().min(0).nullish(),
  materialCostPerSqFt: z.coerce.number().min(0).nullish(),
  minimumCharge: z.coerce.number().min(0).nullish(),
  laminate: z.boolean().default(false),
  mounting: z.boolean().default(false),
  contourCut: z.boolean().default(false),
  grommets: z.boolean().default(false),
  hemmed: z.boolean().default(false),
  laborHours: z.coerce.number().min(0).default(0),
  laborRate: z.coerce.number().min(0).nullish(),
  markupPct: z.coerce.number().min(0).nullish(),
  installRequired: z.boolean().default(false),
  installHours: z.coerce.number().min(0).default(0),
  installRate: z.coerce.number().min(0).nullish(),
  notes: optionalString,
  sortOrder: z.coerce.number().int().optional(),
});

const quoteInclude = {
  items: { orderBy: { sortOrder: 'asc' }, include: { material: true } },
  company: true,
  contact: true,
  opportunity: { select: { id: true, title: true, stage: true } },
  createdBy: { select: { id: true, name: true } },
  jobs: { select: { id: true, jobNumber: true, status: true } },
  files: true,
} satisfies Prisma.QuoteInclude;

export async function quoteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', { preHandler: requirePermission('quote:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        q: z.string().optional(),
        status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']).optional(),
        companyId: z.string().optional(),
        opportunityId: z.string().optional(),
      }),
      request,
    );
    const where: Prisma.QuoteWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { title: { contains: query.q, mode: 'insensitive' } },
              { company: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.quote.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  app.get('/:id', { preHandler: requirePermission('quote:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
    if (!quote) throw notFound('Quote not found');

    // Sibling versions, so the UI can offer a version switcher.
    const rootId = quote.parentQuoteId ?? quote.id;
    const versions = await prisma.quote.findMany({
      where: { OR: [{ id: rootId }, { parentQuoteId: rootId }] },
      select: { id: true, number: true, version: true, status: true, total: true, createdAt: true },
      orderBy: { version: 'asc' },
    });
    return { ...quote, versions };
  });

  app.post('/', { preHandler: requirePermission('quote:write') }, async (request) => {
    const body = parseBody(quoteSchema.extend({ items: z.array(itemSchema).default([]) }), request);
    const actor = currentUser(request);
    const settings = await getSettings();
    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company) throw notFound('Company not found');

    const quote = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'quote');
      const validUntil =
        body.validUntil ??
        new Date(Date.now() + settings.quoteValidDays * 24 * 60 * 60 * 1000);

      const taxRatePct = body.taxRatePct
        ?? (company.taxExempt ? 0 : Number(company.taxRatePct ?? settings.defaultTaxRatePct));

      const created = await tx.quote.create({
        data: {
          number,
          title: body.title,
          companyId: body.companyId,
          contactId: body.contactId ?? null,
          opportunityId: body.opportunityId ?? null,
          createdById: actor.id,
          discountPct: body.discountPct ?? 0,
          rushFeePct: body.rushFeePct ?? 0,
          taxRatePct,
          notes: body.notes ?? null,
          terms: body.terms ?? settings.paymentTerms,
          validUntil,
        },
      });

      for (const [index, item] of body.items.entries()) {
        const defaults = await resolveLineDefaults(tx, item);
        await tx.quoteItem.create({
          data: {
            quoteId: created.id,
            sortOrder: item.sortOrder ?? index,
            signType: item.signType,
            description: item.description,
            widthIn: item.widthIn,
            heightIn: item.heightIn,
            quantity: item.quantity,
            materialId: item.materialId ?? null,
            laminate: item.laminate,
            mounting: item.mounting,
            contourCut: item.contourCut,
            grommets: item.grommets,
            hemmed: item.hemmed,
            laborHours: item.laborHours,
            installRequired: item.installRequired,
            installHours: item.installHours,
            notes: item.notes ?? null,
            ...defaults,
          },
        });
      }

      // Reaching the quoting stage is the point of the pipeline; nudge it along.
      if (body.opportunityId) {
        await tx.opportunity.updateMany({
          where: { id: body.opportunityId, stage: { in: ['NEW', 'CONTACTED'] } },
          data: { stage: 'QUOTED' },
        });
      }

      return recalculateQuote(tx, created.id);
    });

    await recordAudit({
      entity: 'Quote', entityId: quote.id, action: 'create', userId: actor.id,
      summary: `Created quote ${quote.number} for ${quote.company.name}`,
    });
    return quote;
  });

  app.patch('/:id', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(quoteSchema.partial(), request);
    const actor = currentUser(request);
    const existing = await prisma.quote.findUnique({ where: { id } });
    if (!existing) throw notFound('Quote not found');
    if (existing.status === 'ACCEPTED') {
      throw badRequest('An accepted quote is locked — create a new version to change it');
    }

    return prisma.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          title: body.title,
          contactId: body.contactId,
          opportunityId: body.opportunityId,
          discountPct: body.discountPct,
          rushFeePct: body.rushFeePct,
          taxRatePct: body.taxRatePct,
          notes: body.notes,
          terms: body.terms,
          validUntil: body.validUntil,
        },
      });
      const updated = await recalculateQuote(tx, id);
      await recordAudit(
        {
          entity: 'Quote', entityId: id, action: 'update', userId: actor.id,
          summary: `Updated quote ${updated.number}`,
        },
        tx,
      );
      return updated;
    });
  });

  app.delete('/:id', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const quote = await prisma.quote.findUnique({ where: { id }, include: { jobs: true } });
    if (!quote) throw notFound('Quote not found');
    if (quote.jobs.length) throw badRequest('This quote already has a job and cannot be deleted');
    await prisma.quote.delete({ where: { id } });
    return { ok: true };
  });

  // --- line items ----------------------------------------------------------

  app.post('/:id/items', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const item = parseBody(itemSchema, request);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw notFound('Quote not found');
    if (quote.status === 'ACCEPTED') throw badRequest('An accepted quote is locked');

    return prisma.$transaction(async (tx) => {
      const last = await tx.quoteItem.findFirst({
        where: { quoteId: id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const defaults = await resolveLineDefaults(tx, item);
      await tx.quoteItem.create({
        data: {
          quoteId: id,
          sortOrder: item.sortOrder ?? (last?.sortOrder ?? -1) + 1,
          signType: item.signType,
          description: item.description,
          widthIn: item.widthIn,
          heightIn: item.heightIn,
          quantity: item.quantity,
          materialId: item.materialId ?? null,
          laminate: item.laminate,
          mounting: item.mounting,
          contourCut: item.contourCut,
          grommets: item.grommets,
          hemmed: item.hemmed,
          laborHours: item.laborHours,
          installRequired: item.installRequired,
          installHours: item.installHours,
          notes: item.notes ?? null,
          ...defaults,
        },
      });
      return recalculateQuote(tx, id);
    });
  });

  app.patch('/:id/items/:itemId', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id, itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    const patch = parseBody(itemSchema.partial(), request);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw notFound('Quote not found');
    if (quote.status === 'ACCEPTED') throw badRequest('An accepted quote is locked');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.quoteItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.quoteId !== id) throw notFound('Line item not found');

      // Switching material re-snapshots its pricing unless the caller overrides.
      const materialChanged =
        patch.materialId !== undefined && patch.materialId !== existing.materialId;
      const defaults = materialChanged
        ? await resolveLineDefaults(tx, {
            materialId: patch.materialId,
            pricePerSqFt: patch.pricePerSqFt,
            materialCostPerSqFt: patch.materialCostPerSqFt,
            minimumCharge: patch.minimumCharge,
            markupPct: patch.markupPct ?? Number(existing.markupPct),
            laborRate: patch.laborRate ?? Number(existing.laborRate),
            installRate: patch.installRate ?? Number(existing.installRate),
          })
        : {
            ...(patch.pricePerSqFt != null ? { pricePerSqFt: patch.pricePerSqFt } : {}),
            ...(patch.materialCostPerSqFt != null
              ? { materialCostPerSqFt: patch.materialCostPerSqFt }
              : {}),
            ...(patch.minimumCharge != null ? { minimumCharge: patch.minimumCharge } : {}),
            ...(patch.markupPct != null ? { markupPct: patch.markupPct } : {}),
            ...(patch.laborRate != null ? { laborRate: patch.laborRate } : {}),
            ...(patch.installRate != null ? { installRate: patch.installRate } : {}),
          };

      await tx.quoteItem.update({
        where: { id: itemId },
        data: {
          signType: patch.signType,
          description: patch.description,
          widthIn: patch.widthIn,
          heightIn: patch.heightIn,
          quantity: patch.quantity,
          materialId: patch.materialId,
          laminate: patch.laminate,
          mounting: patch.mounting,
          contourCut: patch.contourCut,
          grommets: patch.grommets,
          hemmed: patch.hemmed,
          laborHours: patch.laborHours,
          installRequired: patch.installRequired,
          installHours: patch.installHours,
          notes: patch.notes,
          sortOrder: patch.sortOrder,
          ...defaults,
        },
      });
      return recalculateQuote(tx, id);
    });
  });

  app.delete('/:id/items/:itemId', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id, itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.quoteItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.quoteId !== id) throw notFound('Line item not found');
      await tx.quoteItem.delete({ where: { id: itemId } });
      return recalculateQuote(tx, id);
    });
  });

  // --- lifecycle -----------------------------------------------------------

  app.post('/:id/send', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw notFound('Quote not found');
    if (quote.status !== 'DRAFT') throw badRequest(`Quote is already ${quote.status.toLowerCase()}`);

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (quote.opportunityId) {
      await prisma.opportunity.updateMany({
        where: { id: quote.opportunityId, stage: { in: ['NEW', 'CONTACTED'] } },
        data: { stage: 'QUOTED' },
      });
    }
    await recordAudit({
      entity: 'Quote', entityId: id, action: 'status_change', userId: actor.id,
      summary: `Sent quote ${quote.number}`,
    });
    // TODO: deliver the quote by email once an email provider is chosen.
    return updated;
  });

  /**
   * Records acceptance. `signedName` is a typed-name signature — good enough
   * for an internal record, not a legally binding e-signature. Swapping in
   * DocuSign/Dropbox Sign means calling their API here and storing the
   * envelope id. See docs/INTEGRATIONS.md.
   */
  app.post('/:id/accept', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({ signedName: z.string().min(1), createJob: z.boolean().default(true) }),
      request,
    );
    const actor = currentUser(request);

    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findUnique({ where: { id } });
      if (!quote) throw notFound('Quote not found');
      if (quote.status === 'ACCEPTED') throw badRequest('Quote is already accepted');
      if (quote.status === 'REJECTED') throw badRequest('A rejected quote cannot be accepted');

      await tx.quote.update({
        where: { id },
        data: {
          status: 'ACCEPTED',
          decidedAt: new Date(),
          signedName: body.signedName,
          signedIp: request.ip,
        },
      });

      if (quote.opportunityId) {
        await tx.opportunity.update({
          where: { id: quote.opportunityId },
          data: { stage: 'WON', closedAt: new Date() },
        });
      }

      const job = body.createJob ? await createJobFromQuote(tx, id, actor.id) : null;
      const updated = await tx.quote.findUniqueOrThrow({ where: { id }, include: quoteInclude });
      return { quote: updated, job };
    });

    await recordAudit({
      entity: 'Quote', entityId: id, action: 'status_change', userId: actor.id,
      summary: `Quote ${result.quote.number} accepted by ${body.signedName}`,
    });
    return result;
  });

  app.post('/:id/reject', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ reason: optionalString }), request);
    const actor = currentUser(request);
    const quote = await prisma.quote.findUnique({ where: { id } });
    if (!quote) throw notFound('Quote not found');
    if (quote.status === 'ACCEPTED') throw badRequest('An accepted quote cannot be rejected');

    const updated = await prisma.quote.update({
      where: { id },
      data: { status: 'REJECTED', decidedAt: new Date(), rejectedReason: body.reason ?? null },
    });
    if (quote.opportunityId) {
      await prisma.opportunity.update({
        where: { id: quote.opportunityId },
        data: { stage: 'LOST', closedAt: new Date(), lostReason: body.reason ?? null },
      });
    }
    await recordAudit({
      entity: 'Quote', entityId: id, action: 'status_change', userId: actor.id,
      summary: `Quote ${quote.number} rejected${body.reason ? `: ${body.reason}` : ''}`,
    });
    return updated;
  });

  /** Clones a quote as the next version in the chain, leaving the original intact. */
  app.post('/:id/new-version', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);

    return prisma.$transaction(async (tx) => {
      const source = await tx.quote.findUnique({
        where: { id },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!source) throw notFound('Quote not found');

      const rootId = source.parentQuoteId ?? source.id;
      const latest = await tx.quote.aggregate({
        where: { OR: [{ id: rootId }, { parentQuoteId: rootId }] },
        _max: { version: true },
      });
      const version = (latest._max.version ?? source.version) + 1;
      const number = await nextNumber(tx, 'quote');

      const clone = await tx.quote.create({
        data: {
          number,
          version,
          parentQuoteId: rootId,
          title: source.title,
          companyId: source.companyId,
          contactId: source.contactId,
          opportunityId: source.opportunityId,
          createdById: actor.id,
          discountPct: source.discountPct,
          rushFeePct: source.rushFeePct,
          taxRatePct: source.taxRatePct,
          notes: source.notes,
          terms: source.terms,
          validUntil: source.validUntil,
          items: {
            create: source.items.map((item, index) => ({
              sortOrder: index,
              signType: item.signType,
              description: item.description,
              widthIn: item.widthIn,
              heightIn: item.heightIn,
              quantity: item.quantity,
              materialId: item.materialId,
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
              notes: item.notes,
            })),
          },
        },
      });

      // Superseded drafts should not linger in the "waiting on customer" list.
      if (source.status === 'SENT' || source.status === 'DRAFT') {
        await tx.quote.update({ where: { id: source.id }, data: { status: 'EXPIRED' } });
      }

      await recordAudit(
        {
          entity: 'Quote', entityId: clone.id, action: 'create', userId: actor.id,
          summary: `Created ${clone.number} as version ${version} of ${source.number}`,
        },
        tx,
      );
      return recalculateQuote(tx, clone.id);
    });
  });

  /** Converts an already-accepted quote that was accepted without a job. */
  app.post('/:id/convert', { preHandler: requirePermission('quote:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    return prisma.$transaction((tx) => createJobFromQuote(tx, id, actor.id));
  });
}
