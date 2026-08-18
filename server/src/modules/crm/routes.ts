import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { authenticate, currentUser, requirePermission } from '../../lib/auth.js';
import {
  idParam, optionalDate, optionalString, paginate, paginationSchema,
  parseBody, parseParams, parseQuery, skipTake,
} from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { diffFields, recordAudit } from '../../lib/audit.js';

const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'] as const;

const companySchema = z.object({
  name: z.string().min(1),
  industry: optionalString,
  website: optionalString,
  phone: optionalString,
  email: optionalString,
  tags: z.array(z.string()).default([]),
  notes: optionalString,
  taxExempt: z.boolean().default(false),
  taxRatePct: z.coerce.number().nullish(),
  billingStreet: optionalString,
  billingCity: optionalString,
  billingState: optionalString,
  billingZip: optionalString,
  ownerId: optionalString,
});

const contactSchema = z.object({
  companyId: optionalString,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  title: optionalString,
  email: optionalString,
  phone: optionalString,
  mobile: optionalString,
  isPrimary: z.boolean().default(false),
  notes: optionalString,
});

const opportunitySchema = z.object({
  title: z.string().min(1),
  companyId: z.string().min(1),
  contactId: optionalString,
  ownerId: optionalString,
  stage: z.enum(PIPELINE_STAGES).default('NEW'),
  estimatedValue: z.coerce.number().default(0),
  source: optionalString,
  description: optionalString,
  expectedCloseDate: optionalDate,
  lostReason: optionalString,
});

const activitySchema = z.object({
  type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'SITE_VISIT']),
  subject: z.string().min(1),
  body: optionalString,
  occurredAt: z.coerce.date().default(() => new Date()),
  companyId: optionalString,
  contactId: optionalString,
  opportunityId: optionalString,
  jobId: optionalString,
});

const taskSchema = z.object({
  title: z.string().min(1),
  notes: optionalString,
  dueAt: optionalDate,
  assigneeId: optionalString,
  companyId: optionalString,
  contactId: optionalString,
  opportunityId: optionalString,
  jobId: optionalString,
});

export async function crmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // --- companies -----------------------------------------------------------

  app.get('/companies', { preHandler: requirePermission('crm:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        q: z.string().optional(),
        tag: z.string().optional(),
        ownerId: z.string().optional(),
      }),
      request,
    );
    const where: Prisma.CompanyWhereInput = {
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
              { contacts: { some: { lastName: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { name: 'asc' },
        ...skipTake(query.page, query.pageSize),
        include: {
          owner: { select: { id: true, name: true } },
          _count: { select: { contacts: true, jobs: true, opportunities: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  app.get('/companies/:id', { preHandler: requirePermission('crm:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
        opportunities: { orderBy: { createdAt: 'desc' } },
        quotes: { orderBy: { createdAt: 'desc' }, take: 20 },
        jobs: { orderBy: { createdAt: 'desc' }, take: 20 },
        invoices: { orderBy: { issueDate: 'desc' }, take: 20 },
        files: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!company) throw notFound('Company not found');
    return company;
  });

  /** Merged, reverse-chronological feed of everything touching this company. */
  app.get('/companies/:id/timeline', { preHandler: requirePermission('crm:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const [activities, quotes, jobs, invoices, tasks] = await Promise.all([
      prisma.activity.findMany({
        where: { companyId: id },
        include: { user: { select: { id: true, name: true } }, contact: true },
        orderBy: { occurredAt: 'desc' },
        take: 100,
      }),
      prisma.quote.findMany({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.job.findMany({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.invoice.findMany({ where: { companyId: id }, orderBy: { issueDate: 'desc' }, take: 50 }),
      prisma.task.findMany({
        where: { companyId: id },
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const entries = [
      ...activities.map((a) => ({
        id: a.id, kind: 'activity' as const, at: a.occurredAt,
        title: a.subject, subtitle: a.type, body: a.body, user: a.user?.name ?? null,
      })),
      ...quotes.map((q) => ({
        id: q.id, kind: 'quote' as const, at: q.createdAt,
        title: `${q.number} — ${q.title}`, subtitle: q.status, body: null, user: null,
      })),
      ...jobs.map((j) => ({
        id: j.id, kind: 'job' as const, at: j.createdAt,
        title: `${j.jobNumber} — ${j.title}`, subtitle: j.status, body: null, user: null,
      })),
      ...invoices.map((i) => ({
        id: i.id, kind: 'invoice' as const, at: i.issueDate,
        title: `${i.number}`, subtitle: i.status, body: null, user: null,
      })),
      ...tasks.map((t) => ({
        id: t.id, kind: 'task' as const, at: t.createdAt,
        title: t.title, subtitle: t.status, body: t.notes, user: t.assignee?.name ?? null,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return entries;
  });

  app.post('/companies', { preHandler: requirePermission('crm:write') }, async (request) => {
    const body = parseBody(companySchema, request);
    const actor = currentUser(request);
    const company = await prisma.company.create({ data: body as Prisma.CompanyUncheckedCreateInput });
    await recordAudit({
      entity: 'Company', entityId: company.id, action: 'create', userId: actor.id,
      summary: `Created company ${company.name}`,
    });
    return company;
  });

  app.patch('/companies/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(companySchema.partial(), request);
    const actor = currentUser(request);
    const before = await prisma.company.findUnique({ where: { id } });
    if (!before) throw notFound('Company not found');
    const company = await prisma.company.update({
      where: { id },
      data: body as Prisma.CompanyUncheckedUpdateInput,
    });
    await recordAudit({
      entity: 'Company', entityId: id, action: 'update', userId: actor.id,
      summary: `Updated company ${company.name}`,
      changes: diffFields(before as never, body as never),
    });
    return company;
  });

  app.delete('/companies/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const actor = currentUser(request);
    const company = await prisma.company.delete({ where: { id } });
    await recordAudit({
      entity: 'Company', entityId: id, action: 'delete', userId: actor.id,
      summary: `Deleted company ${company.name}`,
    });
    return { ok: true };
  });

  // --- contacts ------------------------------------------------------------

  app.get('/contacts', { preHandler: requirePermission('crm:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({ q: z.string().optional(), companyId: z.string().optional() }),
      request,
    );
    const where: Prisma.ContactWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.q
        ? {
            OR: [
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        ...skipTake(query.page, query.pageSize),
        include: { company: { select: { id: true, name: true } } },
      }),
      prisma.contact.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  app.get('/contacts/:id', { preHandler: requirePermission('crm:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        company: true,
        activities: { orderBy: { occurredAt: 'desc' }, take: 50 },
        opportunities: true,
      },
    });
    if (!contact) throw notFound('Contact not found');
    return contact;
  });

  app.post('/contacts', { preHandler: requirePermission('crm:write') }, async (request) => {
    const body = parseBody(contactSchema, request);
    const actor = currentUser(request);
    const contact = await prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({ data: body as Prisma.ContactUncheckedCreateInput });
      if (created.isPrimary && created.companyId) {
        await tx.contact.updateMany({
          where: { companyId: created.companyId, id: { not: created.id } },
          data: { isPrimary: false },
        });
      }
      return created;
    });
    await recordAudit({
      entity: 'Contact', entityId: contact.id, action: 'create', userId: actor.id,
      summary: `Created contact ${contact.firstName} ${contact.lastName}`,
    });
    return contact;
  });

  app.patch('/contacts/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(contactSchema.partial(), request);
    const actor = currentUser(request);
    const contact = await prisma.$transaction(async (tx) => {
      const updated = await tx.contact.update({
        where: { id },
        data: body as Prisma.ContactUncheckedUpdateInput,
      });
      if (updated.isPrimary && updated.companyId) {
        await tx.contact.updateMany({
          where: { companyId: updated.companyId, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      return updated;
    });
    await recordAudit({
      entity: 'Contact', entityId: id, action: 'update', userId: actor.id,
      summary: `Updated contact ${contact.firstName} ${contact.lastName}`,
    });
    return contact;
  });

  app.delete('/contacts/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.contact.delete({ where: { id } });
    return { ok: true };
  });

  // --- pipeline ------------------------------------------------------------

  app.get('/opportunities', { preHandler: requirePermission('crm:read') }, async (request) => {
    const query = parseQuery(
      z.object({
        stage: z.enum(PIPELINE_STAGES).optional(),
        ownerId: z.string().optional(),
        q: z.string().optional(),
      }),
      request,
    );
    return prisma.opportunity.findMany({
      where: {
        ...(query.stage ? { stage: query.stage } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { quotes: true } },
      },
      orderBy: [{ stage: 'asc' }, { position: 'asc' }, { createdAt: 'desc' }],
    });
  });

  app.get('/opportunities/:id', { preHandler: requirePermission('crm:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        company: true,
        contact: true,
        owner: { select: { id: true, name: true } },
        quotes: { orderBy: { version: 'desc' } },
        jobs: true,
        activities: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { occurredAt: 'desc' },
        },
        tasks: { include: { assignee: { select: { id: true, name: true } } } },
      },
    });
    if (!opportunity) throw notFound('Opportunity not found');
    return opportunity;
  });

  app.post('/opportunities', { preHandler: requirePermission('crm:write') }, async (request) => {
    const body = parseBody(opportunitySchema, request);
    const actor = currentUser(request);
    const last = await prisma.opportunity.findFirst({
      where: { stage: body.stage },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const opportunity = await prisma.opportunity.create({
      data: {
        ...(body as Prisma.OpportunityUncheckedCreateInput),
        ownerId: body.ownerId ?? actor.id,
        position: (last?.position ?? 0) + 1,
      },
    });
    await recordAudit({
      entity: 'Opportunity', entityId: opportunity.id, action: 'create', userId: actor.id,
      summary: `Created opportunity ${opportunity.title}`,
    });
    return opportunity;
  });

  app.patch('/opportunities/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(opportunitySchema.partial(), request);
    const actor = currentUser(request);
    const before = await prisma.opportunity.findUnique({ where: { id } });
    if (!before) throw notFound('Opportunity not found');

    const closing = body.stage === 'WON' || body.stage === 'LOST';
    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: {
        ...(body as Prisma.OpportunityUncheckedUpdateInput),
        ...(body.stage && body.stage !== before.stage
          ? { closedAt: closing ? new Date() : null }
          : {}),
      },
    });
    if (body.stage && body.stage !== before.stage) {
      await recordAudit({
        entity: 'Opportunity', entityId: id, action: 'status_change', userId: actor.id,
        summary: `Moved ${opportunity.title} from ${before.stage} to ${opportunity.stage}`,
        changes: { stage: { from: before.stage, to: opportunity.stage } },
      });
    }
    return opportunity;
  });

  /** Kanban drop: set the stage and the ordering within the destination column. */
  app.post('/opportunities/:id/move', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({ stage: z.enum(PIPELINE_STAGES), position: z.number().int().min(0) }),
      request,
    );
    const actor = currentUser(request);
    const before = await prisma.opportunity.findUnique({ where: { id } });
    if (!before) throw notFound('Opportunity not found');

    const updated = await prisma.$transaction(async (tx) => {
      // Make room at the target index, then drop the card in.
      await tx.opportunity.updateMany({
        where: { stage: body.stage, position: { gte: body.position }, id: { not: id } },
        data: { position: { increment: 1 } },
      });
      const closing = body.stage === 'WON' || body.stage === 'LOST';
      return tx.opportunity.update({
        where: { id },
        data: {
          stage: body.stage,
          position: body.position,
          closedAt: closing ? before.closedAt ?? new Date() : null,
        },
      });
    });

    if (before.stage !== body.stage) {
      await recordAudit({
        entity: 'Opportunity', entityId: id, action: 'status_change', userId: actor.id,
        summary: `Moved ${updated.title} from ${before.stage} to ${body.stage}`,
        changes: { stage: { from: before.stage, to: body.stage } },
      });
    }
    return updated;
  });

  app.delete('/opportunities/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.opportunity.delete({ where: { id } });
    return { ok: true };
  });

  // --- activities ----------------------------------------------------------

  app.get('/activities', { preHandler: requirePermission('crm:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        companyId: z.string().optional(),
        contactId: z.string().optional(),
        opportunityId: z.string().optional(),
        jobId: z.string().optional(),
      }),
      request,
    );
    const where: Prisma.ActivityWhereInput = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.contactId ? { contactId: query.contactId } : {}),
      ...(query.opportunityId ? { opportunityId: query.opportunityId } : {}),
      ...(query.jobId ? { jobId: query.jobId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.activity.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });

  app.post('/activities', { preHandler: requirePermission('crm:write') }, async (request) => {
    const body = parseBody(activitySchema, request);
    const actor = currentUser(request);
    return prisma.activity.create({
      data: { ...(body as Prisma.ActivityUncheckedCreateInput), userId: actor.id },
      include: { user: { select: { id: true, name: true } } },
    });
  });

  app.delete('/activities/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.activity.delete({ where: { id } });
    return { ok: true };
  });

  // --- tasks / follow-up reminders ----------------------------------------

  app.get('/tasks', { preHandler: requirePermission('crm:read') }, async (request) => {
    const query = parseQuery(
      z.object({
        assigneeId: z.string().optional(),
        status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional(),
        mine: z.coerce.boolean().optional(),
        overdue: z.coerce.boolean().optional(),
        companyId: z.string().optional(),
        jobId: z.string().optional(),
      }),
      request,
    );
    const actor = currentUser(request);
    return prisma.task.findMany({
      where: {
        ...(query.mine ? { assigneeId: actor.id } : query.assigneeId ? { assigneeId: query.assigneeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.overdue ? { status: 'OPEN', dueAt: { lt: new Date() } } : {}),
        ...(query.companyId ? { companyId: query.companyId } : {}),
        ...(query.jobId ? { jobId: query.jobId } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
        job: { select: { id: true, jobNumber: true, title: true } },
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    });
  });

  app.post('/tasks', { preHandler: requirePermission('crm:write') }, async (request) => {
    const body = parseBody(taskSchema, request);
    const actor = currentUser(request);
    return prisma.task.create({
      data: {
        ...(body as Prisma.TaskUncheckedCreateInput),
        assigneeId: body.assigneeId ?? actor.id,
        createdById: actor.id,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  app.patch('/tasks/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      taskSchema.partial().extend({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional() }),
      request,
    );
    return prisma.task.update({
      where: { id },
      data: {
        ...(body as Prisma.TaskUncheckedUpdateInput),
        ...(body.status === 'DONE' ? { completedAt: new Date() } : {}),
        ...(body.status === 'OPEN' ? { completedAt: null } : {}),
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
  });

  app.delete('/tasks/:id', { preHandler: requirePermission('crm:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.task.delete({ where: { id } });
    return { ok: true };
  });
}
