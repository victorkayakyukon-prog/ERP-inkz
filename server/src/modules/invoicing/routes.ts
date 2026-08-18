import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
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
import { money, pct } from '../../lib/money.js';
import { changeJobStatus } from '../jobs/service.js';
import { isOverdue, recalculateInvoice } from './service.js';

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().default(1),
  unitPrice: z.coerce.number().default(0),
  taxable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().optional(),
});

const invoiceSchema = z.object({
  companyId: z.string().min(1),
  jobId: optionalString,
  type: z.enum(['DEPOSIT', 'MILESTONE', 'FINAL', 'FULL']).default('FULL'),
  issueDate: optionalDate,
  dueDate: optionalDate,
  taxRatePct: z.coerce.number().min(0).optional(),
  terms: optionalString,
  notes: optionalString,
  items: z.array(itemSchema).default([]),
});

const netDays = (terms: string): number => {
  const match = /net\s*(\d+)/i.exec(terms);
  return match ? Number(match[1]) : 30;
};

export async function invoicingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/invoices', { preHandler: requirePermission('invoice:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        q: z.string().optional(),
        status: z.enum(['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID']).optional(),
        companyId: z.string().optional(),
        jobId: z.string().optional(),
        overdue: z.coerce.boolean().optional(),
      }),
      request,
    );
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
      ...(query.overdue
        ? { dueDate: { lt: new Date() }, status: { in: ['SENT', 'PARTIAL'] }, balance: { gt: 0 } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { company: { name: { contains: query.q, mode: 'insensitive' } } },
              { job: { jobNumber: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          job: { select: { id: true, jobNumber: true, title: true } },
        },
        orderBy: { issueDate: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.invoice.count({ where }),
    ]);
    const data = rows.map((row) => ({ ...row, overdue: isOverdue(row) }));
    return paginate(data, total, query.page, query.pageSize);
  });

  app.get('/invoices/:id', { preHandler: requirePermission('invoice:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { receivedAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
        company: true,
        job: { select: { id: true, jobNumber: true, title: true, status: true } },
      },
    });
    if (!invoice) throw notFound('Invoice not found');
    return { ...invoice, overdue: isOverdue(invoice) };
  });

  app.post('/invoices', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const body = parseBody(invoiceSchema, request);
    const actor = currentUser(request);
    const settings = await getSettings();
    const company = await prisma.company.findUnique({ where: { id: body.companyId } });
    if (!company) throw notFound('Company not found');

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'invoice');
      const terms = body.terms ?? settings.paymentTerms;
      const issueDate = body.issueDate ?? new Date();
      const created = await tx.invoice.create({
        data: {
          number,
          type: body.type,
          companyId: body.companyId,
          jobId: body.jobId ?? null,
          issueDate,
          dueDate: body.dueDate ?? new Date(issueDate.getTime() + netDays(terms) * 86_400_000),
          taxRatePct:
            body.taxRatePct ??
            (company.taxExempt ? 0 : Number(company.taxRatePct ?? settings.defaultTaxRatePct)),
          terms,
          notes: body.notes ?? null,
          items: {
            create: body.items.map((item, index) => ({
              sortOrder: item.sortOrder ?? index,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: money(new Prisma.Decimal(item.quantity).times(item.unitPrice)),
              taxable: item.taxable,
            })),
          },
        },
      });
      return recalculateInvoice(tx, created.id);
    });

    await recordAudit({
      entity: 'Invoice', entityId: invoice.id, action: 'create', userId: actor.id,
      summary: `Created invoice ${invoice.number}`,
    });
    return invoice;
  });

  /**
   * Bills a job. A DEPOSIT invoice uses the configured deposit percentage of
   * the contract; a FINAL invoice bills the contract less whatever has already
   * been invoiced, so deposit + final always lands on the contract total.
   */
  app.post('/jobs/:id/invoice', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({
        type: z.enum(['DEPOSIT', 'MILESTONE', 'FINAL', 'FULL']).default('FULL'),
        /** Milestone billing: an explicit amount or percentage of the contract. */
        amount: z.coerce.number().min(0).optional(),
        percentage: z.coerce.number().min(0).max(100).optional(),
        dueDate: optionalDate,
        notes: optionalString,
      }),
      request,
    );
    const actor = currentUser(request);
    const settings = await getSettings();

    const job = await prisma.job.findUnique({
      where: { id },
      include: { company: true, items: { orderBy: { sortOrder: 'asc' } }, invoices: true },
    });
    if (!job) throw notFound('Job not found');

    const alreadyInvoiced = job.invoices
      .filter((inv) => inv.status !== 'VOID')
      .reduce((sum, inv) => sum.plus(inv.subtotal), new Prisma.Decimal(0));

    // Line items are built from the job for a full bill, and rolled into a
    // single line for deposits and milestones.
    let lines: Array<{ description: string; quantity: number; unitPrice: Prisma.Decimal; taxable: boolean }>;
    if (body.type === 'FULL') {
      lines = job.items.map((item) => ({
        description: `${item.description}${
          Number(item.widthIn) > 0 ? ` (${item.widthIn}" x ${item.heightIn}")` : ''
        }`,
        quantity: item.quantity,
        unitPrice: money(item.lineTotal.dividedBy(Math.max(1, item.quantity))),
        taxable: true,
      }));
      if (!lines.length) {
        lines = [{ description: job.title, quantity: 1, unitPrice: job.contractTotal, taxable: true }];
      }
    } else {
      const amount =
        body.amount !== undefined
          ? new Prisma.Decimal(body.amount)
          : body.percentage !== undefined
            ? money(pct(job.contractTotal, body.percentage))
            : body.type === 'DEPOSIT'
              ? money(pct(job.contractTotal, settings.depositPct))
              : money(job.contractTotal.minus(alreadyInvoiced));

      if (amount.lessThanOrEqualTo(0)) {
        throw badRequest('Nothing left to bill on this job');
      }
      const label =
        body.type === 'DEPOSIT'
          ? `Deposit — ${job.jobNumber} ${job.title}`
          : body.type === 'FINAL'
            ? `Balance due — ${job.jobNumber} ${job.title}`
            : `Progress billing — ${job.jobNumber} ${job.title}`;
      lines = [{ description: label, quantity: 1, unitPrice: amount, taxable: true }];
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, 'invoice');
      const terms = settings.paymentTerms;
      const issueDate = new Date();
      const created = await tx.invoice.create({
        data: {
          number,
          type: body.type,
          companyId: job.companyId,
          jobId: job.id,
          issueDate,
          dueDate: body.dueDate ?? new Date(issueDate.getTime() + netDays(terms) * 86_400_000),
          taxRatePct: job.company.taxExempt
            ? 0
            : Number(job.company.taxRatePct ?? settings.defaultTaxRatePct),
          terms,
          notes: body.notes ?? null,
          items: {
            create: lines.map((line, index) => ({
              sortOrder: index,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              amount: money(new Prisma.Decimal(line.quantity).times(line.unitPrice)),
              taxable: line.taxable,
            })),
          },
        },
      });

      // Billing a completed job advances it; a deposit taken up front does not.
      if (body.type !== 'DEPOSIT' && job.status === JobStatus.INSTALLED) {
        await changeJobStatus(tx, {
          jobId: job.id,
          toStatus: JobStatus.INVOICED,
          userId: actor.id,
          note: `Invoiced on ${number}`,
        });
      }
      return recalculateInvoice(tx, created.id);
    });

    await recordAudit({
      entity: 'Invoice', entityId: invoice.id, action: 'create', userId: actor.id,
      summary: `Created ${body.type.toLowerCase()} invoice ${invoice.number} for ${job.jobNumber}`,
    });
    return invoice;
  });

  app.patch('/invoices/:id', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(invoiceSchema.partial().omit({ items: true }), request);
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      throw badRequest(`A ${invoice.status.toLowerCase()} invoice cannot be edited`);
    }
    return prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          type: body.type,
          issueDate: body.issueDate ?? undefined,
          dueDate: body.dueDate,
          taxRatePct: body.taxRatePct,
          terms: body.terms,
          notes: body.notes,
        },
      });
      return recalculateInvoice(tx, id);
    });
  });

  app.post('/invoices/:id/items', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const item = parseBody(itemSchema, request);
    return prisma.$transaction(async (tx) => {
      const last = await tx.invoiceItem.findFirst({
        where: { invoiceId: id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      await tx.invoiceItem.create({
        data: {
          invoiceId: id,
          sortOrder: item.sortOrder ?? (last?.sortOrder ?? -1) + 1,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: money(new Prisma.Decimal(item.quantity).times(item.unitPrice)),
          taxable: item.taxable,
        },
      });
      return recalculateInvoice(tx, id);
    });
  });

  app.patch('/invoices/:id/items/:itemId', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id, itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    const patch = parseBody(itemSchema.partial(), request);
    return prisma.$transaction(async (tx) => {
      const existing = await tx.invoiceItem.findUnique({ where: { id: itemId } });
      if (!existing || existing.invoiceId !== id) throw notFound('Line item not found');
      const quantity = patch.quantity ?? existing.quantity;
      const unitPrice = patch.unitPrice ?? existing.unitPrice;
      await tx.invoiceItem.update({
        where: { id: itemId },
        data: {
          description: patch.description,
          quantity,
          unitPrice,
          taxable: patch.taxable,
          sortOrder: patch.sortOrder,
          amount: money(new Prisma.Decimal(quantity).times(unitPrice)),
        },
      });
      return recalculateInvoice(tx, id);
    });
  });

  app.delete('/invoices/:id/items/:itemId', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id, itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    return prisma.$transaction(async (tx) => {
      await tx.invoiceItem.delete({ where: { id: itemId } });
      return recalculateInvoice(tx, id);
    });
  });

  app.post('/invoices/:id/send', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!invoice) throw notFound('Invoice not found');
    if (!invoice.items.length) throw badRequest('Add at least one line before sending');
    if (invoice.status !== 'DRAFT') throw badRequest('This invoice has already been sent');

    // TODO: email delivery and Stripe hosted payment link — docs/INTEGRATIONS.md
    return prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
      const updated = await recalculateInvoice(tx, id);
      await recordAudit(
        {
          entity: 'Invoice', entityId: id, action: 'status_change', userId: actor.id,
          summary: `Sent invoice ${updated.number}`,
        },
        tx,
      );
      return updated;
    });
  });

  app.post('/invoices/:id/void', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.payments.length) throw badRequest('Refund the payments before voiding this invoice');
    const updated = await prisma.invoice.update({ where: { id }, data: { status: 'VOID' } });
    await recordAudit({
      entity: 'Invoice', entityId: id, action: 'status_change', userId: actor.id,
      summary: `Voided invoice ${invoice.number}`,
    });
    return updated;
  });

  // --- payments ------------------------------------------------------------

  app.post('/invoices/:id/payments', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({
        amount: z.coerce.number().positive(),
        method: z.enum(['CASH', 'CHECK', 'CARD', 'ACH', 'OTHER']).default('CHECK'),
        reference: optionalString,
        receivedAt: optionalDate,
        note: optionalString,
      }),
      request,
    );
    const actor = currentUser(request);

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id } });
      if (!invoice) throw notFound('Invoice not found');
      if (invoice.status === 'VOID') throw badRequest('This invoice was voided');
      if (invoice.status === 'DRAFT') throw badRequest('Send the invoice before recording a payment');

      await tx.payment.create({
        data: {
          invoiceId: id,
          amount: body.amount,
          method: body.method,
          reference: body.reference ?? null,
          receivedAt: body.receivedAt ?? new Date(),
          userId: actor.id,
          note: body.note ?? null,
        },
      });
      const updated = await recalculateInvoice(tx, id);

      // A fully paid final invoice closes the job out.
      if (updated.status === 'PAID' && updated.jobId) {
        const job = await tx.job.findUnique({ where: { id: updated.jobId }, include: { invoices: true } });
        const allSettled = job?.invoices.every(
          (inv) => inv.id === id || inv.status === 'PAID' || inv.status === 'VOID',
        );
        if (job && allSettled && job.status === JobStatus.INVOICED) {
          await changeJobStatus(tx, {
            jobId: job.id,
            toStatus: JobStatus.CLOSED,
            userId: actor.id,
            note: 'Paid in full',
          });
        }
      }
      return updated;
    });

    await recordAudit({
      entity: 'Invoice', entityId: id, action: 'update', userId: actor.id,
      summary: `Recorded ${body.method.toLowerCase()} payment of ${body.amount} on ${result.number}`,
    });
    return result;
  });

  app.delete('/invoices/:id/payments/:paymentId', { preHandler: requirePermission('invoice:write') }, async (request) => {
    const { id, paymentId } = parseParams(idParam.extend({ paymentId: z.string() }), request);
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.invoiceId !== id) throw notFound('Payment not found');
      await tx.payment.delete({ where: { id: paymentId } });
      return recalculateInvoice(tx, id);
    });
  });

  app.get('/payments', { preHandler: requirePermission('invoice:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }),
      request,
    );
    const where: Prisma.PaymentWhereInput = {
      ...(query.from || query.to
        ? { receivedAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: { include: { company: { select: { id: true, name: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { receivedAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.payment.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });
}
