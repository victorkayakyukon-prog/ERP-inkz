import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { authenticate, canSeePricing, currentUser, requirePermission } from '../../lib/auth.js';
import { idParam, optionalString, parseBody, parseParams, parseQuery } from '../../lib/http.js';
import { notFound } from '../../lib/errors.js';
import { recordAudit } from '../../lib/audit.js';
import { stripPricing } from '../../lib/rbac.js';
import { changeJobStatus } from '../jobs/service.js';

const RESOURCE_TYPES = ['PRINTER', 'ROUTER', 'LAMINATOR', 'BENCH', 'PAINT', 'INSTALL_CREW'] as const;

const resourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(RESOURCE_TYPES),
  color: z.string().default('#64748b'),
  capacityPerDay: z.coerce.number().int().min(1).default(3),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

const entrySchema = z.object({
  jobId: z.string().min(1),
  resourceId: z.string().min(1),
  stage: z.string().default('PRODUCTION').transform((v) => v as JobStatus),
  scheduledDate: z.coerce.date(),
  durationHours: z.coerce.number().min(0).default(2),
  notes: optionalString,
});

const installSchema = z.object({
  jobId: z.string().min(1),
  crewId: optionalString,
  scheduledDate: z.coerce.date(),
  windowStart: optionalString,
  windowEnd: optionalString,
  street: optionalString,
  city: optionalString,
  state: optionalString,
  zip: optionalString,
  contactName: optionalString,
  contactPhone: optionalString,
  notes: optionalString,
});

/** Postgres `date` columns are compared at midnight UTC. */
const dateOnly = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 86_400_000);

export async function productionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // --- resources -----------------------------------------------------------

  app.get('/resources', { preHandler: requirePermission('production:read') }, async (request) => {
    const query = parseQuery(
      z.object({ type: z.enum(RESOURCE_TYPES).optional(), includeInactive: z.coerce.boolean().default(false) }),
      request,
    );
    return prisma.resource.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.includeInactive ? {} : { active: true }),
      },
      include: { crewMembers: { include: { user: { select: { id: true, name: true, phone: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  app.post('/resources', { preHandler: requirePermission('production:write') }, async (request) => {
    const body = parseBody(resourceSchema, request);
    return prisma.resource.create({ data: body });
  });

  app.patch('/resources/:id', { preHandler: requirePermission('production:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(resourceSchema.partial(), request);
    return prisma.resource.update({ where: { id }, data: body });
  });

  app.post('/resources/:id/crew', { preHandler: requirePermission('production:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ userIds: z.array(z.string()) }), request);
    await prisma.$transaction(async (tx) => {
      await tx.installCrewMember.deleteMany({ where: { resourceId: id } });
      if (body.userIds.length) {
        await tx.installCrewMember.createMany({
          data: body.userIds.map((userId) => ({ resourceId: id, userId })),
        });
      }
    });
    return prisma.resource.findUnique({
      where: { id },
      include: { crewMembers: { include: { user: { select: { id: true, name: true } } } } },
    });
  });

  // --- schedule board ------------------------------------------------------

  /**
   * The shop board: one row per resource, one column per day, plus a capacity
   * flag so an overbooked printer is visible at a glance.
   */
  app.get('/schedule', { preHandler: requirePermission('production:read') }, async (request) => {
    const query = parseQuery(
      z.object({ start: z.coerce.date(), days: z.coerce.number().int().min(1).max(31).default(7) }),
      request,
    );
    const start = dateOnly(query.start);
    const end = addDays(start, query.days);

    const [resources, entries, unscheduled] = await Promise.all([
      prisma.resource.findMany({
        where: { active: true, type: { not: 'INSTALL_CREW' } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.scheduleEntry.findMany({
        where: { scheduledDate: { gte: start, lt: end } },
        include: {
          job: {
            include: {
              company: { select: { id: true, name: true } },
            },
          },
          resource: true,
        },
        orderBy: [{ scheduledDate: 'asc' }, { sortOrder: 'asc' }],
      }),
      // Open jobs in a shop stage with nothing on the board yet.
      prisma.job.findMany({
        where: {
          status: { in: [JobStatus.MATERIALS_ORDERED, JobStatus.PRODUCTION, JobStatus.FINISHING, JobStatus.QC] },
          scheduleEntries: { none: {} },
        },
        include: { company: { select: { id: true, name: true } } },
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        take: 50,
      }),
    ]);

    const dates = Array.from({ length: query.days }, (_, index) =>
      addDays(start, index).toISOString().slice(0, 10),
    );

    const board = resources.map((resource) => ({
      resource,
      days: dates.map((date) => {
        const dayEntries = entries.filter(
          (entry) =>
            entry.resourceId === resource.id &&
            entry.scheduledDate.toISOString().slice(0, 10) === date,
        );
        return {
          date,
          entries: dayEntries,
          load: dayEntries.length,
          capacity: resource.capacityPerDay,
          overbooked: dayEntries.length > resource.capacityPerDay,
        };
      }),
    }));

    const payload = { start: start.toISOString().slice(0, 10), dates, board, unscheduled };
    return canSeePricing(request) ? payload : stripPricing(payload);
  });

  app.post('/schedule', { preHandler: requirePermission('production:write') }, async (request) => {
    const body = parseBody(entrySchema, request);
    const actor = currentUser(request);
    const entry = await prisma.scheduleEntry.create({
      data: { ...body, scheduledDate: dateOnly(body.scheduledDate) },
      include: { job: { include: { company: { select: { id: true, name: true } } } }, resource: true },
    });
    await recordAudit({
      entity: 'Job', entityId: body.jobId, action: 'update', userId: actor.id,
      summary: `Scheduled on ${entry.resource.name} for ${entry.scheduledDate.toISOString().slice(0, 10)}`,
    });
    return entry;
  });

  /** Drag-and-drop target: move an entry to another resource and/or day. */
  app.patch('/schedule/:id', { preHandler: requirePermission('production:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      entrySchema.partial().extend({ sortOrder: z.coerce.number().int().optional() }),
      request,
    );
    const existing = await prisma.scheduleEntry.findUnique({ where: { id } });
    if (!existing) throw notFound('Schedule entry not found');
    return prisma.scheduleEntry.update({
      where: { id },
      data: {
        ...body,
        ...(body.scheduledDate ? { scheduledDate: dateOnly(body.scheduledDate) } : {}),
      },
      include: { job: { include: { company: { select: { id: true, name: true } } } }, resource: true },
    });
  });

  app.post('/schedule/:id/complete', { preHandler: requirePermission('production:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    return prisma.scheduleEntry.update({ where: { id }, data: { completedAt: new Date() } });
  });

  app.delete('/schedule/:id', { preHandler: requirePermission('production:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.scheduleEntry.delete({ where: { id } });
    return { ok: true };
  });

  /** Jobs-per-day rollup across the shop, for the capacity strip. */
  app.get('/capacity', { preHandler: requirePermission('production:read') }, async (request) => {
    const query = parseQuery(
      z.object({ start: z.coerce.date(), days: z.coerce.number().int().min(1).max(90).default(14) }),
      request,
    );
    const start = dateOnly(query.start);
    const end = addDays(start, query.days);
    const [entries, resources] = await Promise.all([
      prisma.scheduleEntry.groupBy({
        by: ['scheduledDate'],
        where: { scheduledDate: { gte: start, lt: end } },
        _count: { _all: true },
        _sum: { durationHours: true },
      }),
      prisma.resource.findMany({ where: { active: true, type: { not: 'INSTALL_CREW' } } }),
    ]);
    const shopCapacity = resources.reduce((sum, r) => sum + r.capacityPerDay, 0);

    return Array.from({ length: query.days }, (_, index) => {
      const date = addDays(start, index).toISOString().slice(0, 10);
      const match = entries.find((e) => e.scheduledDate.toISOString().slice(0, 10) === date);
      const scheduled = match?._count._all ?? 0;
      return {
        date,
        scheduled,
        hours: Number(match?._sum.durationHours ?? 0),
        capacity: shopCapacity,
        overbooked: scheduled > shopCapacity,
      };
    });
  });

  // --- installs ------------------------------------------------------------

  app.get('/installs', { preHandler: requirePermission('install:read') }, async (request) => {
    const query = parseQuery(
      z.object({
        start: z.coerce.date().optional(),
        days: z.coerce.number().int().min(1).max(60).default(7),
        crewId: z.string().optional(),
        mine: z.coerce.boolean().default(false),
        status: z.enum(['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'CANCELLED']).optional(),
      }),
      request,
    );
    const actor = currentUser(request);
    const start = dateOnly(query.start ?? new Date());
    const end = addDays(start, query.days);

    // "Mine" resolves the crews this installer belongs to.
    let crewFilter: Prisma.InstallWhereInput = {};
    if (query.mine) {
      const memberships = await prisma.installCrewMember.findMany({
        where: { userId: actor.id },
        select: { resourceId: true },
      });
      crewFilter = { crewId: { in: memberships.map((m) => m.resourceId) } };
    } else if (query.crewId) {
      crewFilter = { crewId: query.crewId };
    }

    const installs = await prisma.install.findMany({
      where: {
        scheduledDate: { gte: start, lt: end },
        ...(query.status ? { status: query.status } : {}),
        ...crewFilter,
      },
      include: {
        crew: { include: { crewMembers: { include: { user: { select: { id: true, name: true } } } } } },
        job: {
          include: {
            company: { select: { id: true, name: true, phone: true } },
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, mobile: true } },
            items: { select: { id: true, description: true, quantity: true, widthIn: true, heightIn: true } },
          },
        },
        photos: true,
      },
      orderBy: [{ scheduledDate: 'asc' }, { sortOrder: 'asc' }, { windowStart: 'asc' }],
    });
    return canSeePricing(request) ? installs : stripPricing(installs);
  });

  app.get('/installs/:id', { preHandler: requirePermission('install:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const install = await prisma.install.findUnique({
      where: { id },
      include: {
        crew: { include: { crewMembers: { include: { user: { select: { id: true, name: true } } } } } },
        job: { include: { company: true, contact: true, items: true, proofs: { include: { file: true } } } },
        photos: true,
      },
    });
    if (!install) throw notFound('Install not found');
    return canSeePricing(request) ? install : stripPricing(install);
  });

  app.post('/installs', { preHandler: requirePermission('install:write') }, async (request) => {
    const body = parseBody(installSchema, request);
    const actor = currentUser(request);
    const job = await prisma.job.findUnique({
      where: { id: body.jobId },
      include: { company: true, contact: true },
    });
    if (!job) throw notFound('Job not found');

    const install = await prisma.install.create({
      data: {
        ...body,
        scheduledDate: dateOnly(body.scheduledDate),
        // Dispatch should never retype an address: prefer the job's install
        // site, then fall back to the customer's billing address.
        street: body.street ?? job.installStreet ?? job.company.billingStreet,
        city: body.city ?? job.installCity ?? job.company.billingCity,
        state: body.state ?? job.installState ?? job.company.billingState,
        zip: body.zip ?? job.installZip ?? job.company.billingZip,
        contactName:
          body.contactName ??
          (job.contact ? `${job.contact.firstName} ${job.contact.lastName}` : null),
        contactPhone: body.contactPhone ?? job.contact?.mobile ?? job.contact?.phone ?? job.company.phone,
      },
      include: { job: { include: { company: true } }, crew: true },
    });
    await recordAudit({
      entity: 'Job', entityId: body.jobId, action: 'update', userId: actor.id,
      summary: `Install scheduled for ${install.scheduledDate.toISOString().slice(0, 10)}`,
    });
    return install;
  });

  app.patch('/installs/:id', { preHandler: requirePermission('install:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      installSchema.partial().extend({
        status: z.enum(['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'CANCELLED']).optional(),
        sortOrder: z.coerce.number().int().optional(),
      }),
      request,
    );
    return prisma.install.update({
      where: { id },
      data: {
        ...body,
        ...(body.scheduledDate ? { scheduledDate: dateOnly(body.scheduledDate) } : {}),
      },
      include: { job: { include: { company: true } }, crew: true, photos: true },
    });
  });

  /** Crew marks the install done from the field; the job follows along. */
  app.post('/installs/:id/complete', { preHandler: requirePermission('install:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ completionNotes: optionalString }), request);
    const actor = currentUser(request);

    const install = await prisma.install.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completionNotes: body.completionNotes ?? null,
      },
      include: { job: true },
    });

    const remaining = await prisma.install.count({
      where: { jobId: install.jobId, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    });
    if (remaining === 0 && install.job.status === JobStatus.READY) {
      await prisma.$transaction((tx) =>
        changeJobStatus(tx, {
          jobId: install.jobId,
          toStatus: JobStatus.INSTALLED,
          userId: actor.id,
          note: 'All installs completed',
        }),
      );
    }
    return install;
  });

  app.delete('/installs/:id', { preHandler: requirePermission('install:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    await prisma.install.delete({ where: { id } });
    return { ok: true };
  });
}
