import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { authenticate, canSeePricing, currentUser, requirePermission } from '../../lib/auth.js';
import {
  idParam, optionalDate, optionalString, paginate, paginationSchema,
  parseBody, parseParams, parseQuery, skipTake,
} from '../../lib/http.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { diffFields, recordAudit } from '../../lib/audit.js';
import { nextNumber } from '../../lib/numbering.js';
import { stripPricing } from '../../lib/rbac.js';
import {
  JOB_PIPELINE, JOB_SIDE_STATES, JOB_STATUS_LABELS,
  canTransition, changeJobStatus, defaultChecklist, stockUnitsForArea,
} from './service.js';

const JOB_STATUSES = [...JOB_PIPELINE, ...JOB_SIDE_STATES] as [JobStatus, ...JobStatus[]];
const statusEnum = z.enum(
  JOB_STATUSES.map(String) as [string, ...string[]],
).transform((value) => value as JobStatus);

const jobSchema = z.object({
  title: z.string().min(1),
  companyId: z.string().min(1),
  contactId: optionalString,
  quoteId: optionalString,
  opportunityId: optionalString,
  ownerId: optionalString,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'RUSH']).default('NORMAL'),
  dueDate: optionalDate,
  description: optionalString,
  contractTotal: z.coerce.number().min(0).optional(),
  installRequired: z.boolean().default(false),
  installStreet: optionalString,
  installCity: optionalString,
  installState: optionalString,
  installZip: optionalString,
  installNotes: optionalString,
});

const jobInclude = {
  company: true,
  contact: true,
  owner: { select: { id: true, name: true } },
  quote: { select: { id: true, number: true, status: true, total: true } },
  items: { orderBy: { sortOrder: 'asc' }, include: { material: true } },
  checklist: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }], include: { completedBy: { select: { id: true, name: true } } } },
  comments: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
  proofs: { orderBy: { version: 'desc' }, include: { file: true } },
  files: { orderBy: { createdAt: 'desc' } },
  statusEvents: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
  scheduleEntries: { include: { resource: true }, orderBy: { scheduledDate: 'asc' } },
  installs: { include: { crew: true, photos: true }, orderBy: { scheduledDate: 'asc' } },
  invoices: { orderBy: { issueDate: 'desc' } },
  stockMovements: { include: { material: { select: { id: true, sku: true, name: true, unit: true } } }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.JobInclude;

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  /** Stage metadata drives the board columns and the status dropdown. */
  app.get('/meta/pipeline', async () => ({
    pipeline: JOB_PIPELINE.map((status) => ({ status, label: JOB_STATUS_LABELS[status] })),
    sideStates: JOB_SIDE_STATES.map((status) => ({ status, label: JOB_STATUS_LABELS[status] })),
  }));

  app.get('/', { preHandler: requirePermission('job:read') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({
        q: z.string().optional(),
        status: z.string().optional(),
        companyId: z.string().optional(),
        ownerId: z.string().optional(),
        priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'RUSH']).optional(),
        open: z.coerce.boolean().optional(),
        dueBefore: z.coerce.date().optional(),
      }),
      request,
    );
    const statuses = query.status
      ? (query.status.split(',').filter((s) => JOB_STATUSES.includes(s as JobStatus)) as JobStatus[])
      : undefined;

    const where: Prisma.JobWhereInput = {
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(query.open ? { status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] } } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.dueBefore ? { dueDate: { lte: query.dueBefore } } : {}),
      ...(query.q
        ? {
            OR: [
              { jobNumber: { contains: query.q, mode: 'insensitive' } },
              { title: { contains: query.q, mode: 'insensitive' } },
              { company: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          _count: { select: { items: true, proofs: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.job.count({ where }),
    ]);
    const page = paginate(data, total, query.page, query.pageSize);
    return canSeePricing(request) ? page : stripPricing(page);
  });

  /** Board view: open jobs grouped by stage, with a stuck-time indicator. */
  app.get('/board', { preHandler: requirePermission('job:read') }, async (request) => {
    const jobs = await prisma.job.findMany({
      where: { status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] } },
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    });

    const columns = [...JOB_PIPELINE, JobStatus.ON_HOLD].map((status) => ({
      status,
      label: JOB_STATUS_LABELS[status],
      jobs: jobs
        .filter((job) => job.status === status)
        .map((job) => {
          const since = job.statusEvents[0]?.createdAt ?? job.createdAt;
          return {
            ...job,
            statusEvents: undefined,
            enteredStageAt: since,
            daysInStage: Math.floor((Date.now() - since.getTime()) / 86_400_000),
          };
        }),
    }));
    return canSeePricing(request) ? columns : stripPricing(columns);
  });

  app.get('/:id', { preHandler: requirePermission('job:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const job = await prisma.job.findUnique({ where: { id }, include: jobInclude });
    if (!job) throw notFound('Job not found');
    const withMeta = {
      ...job,
      allowedTransitions: JOB_STATUSES.filter((status) => canTransition(job.status, status)).map(
        (status) => ({ status, label: JOB_STATUS_LABELS[status] }),
      ),
    };
    return canSeePricing(request) ? withMeta : stripPricing(withMeta);
  });

  app.post('/', { preHandler: requirePermission('job:write') }, async (request) => {
    const body = parseBody(jobSchema, request);
    const actor = currentUser(request);
    const job = await prisma.$transaction(async (tx) => {
      const jobNumber = await nextNumber(tx, 'job');
      return tx.job.create({
        data: {
          ...(body as Prisma.JobUncheckedCreateInput),
          jobNumber,
          ownerId: body.ownerId ?? actor.id,
          checklist: { create: defaultChecklist() },
          statusEvents: { create: { toStatus: JobStatus.DESIGN_PROOF, userId: actor.id } },
        },
        include: jobInclude,
      });
    });
    await recordAudit({
      entity: 'Job', entityId: job.id, action: 'create', userId: actor.id,
      summary: `Created job ${job.jobNumber}`,
    });
    return job;
  });

  app.patch('/:id', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(jobSchema.partial(), request);
    const actor = currentUser(request);
    const before = await prisma.job.findUnique({ where: { id } });
    if (!before) throw notFound('Job not found');
    const job = await prisma.job.update({
      where: { id },
      data: body as Prisma.JobUncheckedUpdateInput,
      include: jobInclude,
    });
    await recordAudit({
      entity: 'Job', entityId: id, action: 'update', userId: actor.id,
      summary: `Updated job ${job.jobNumber}`,
      changes: diffFields(before as never, body as never),
    });
    return job;
  });

  app.delete('/:id', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const job = await prisma.job.findUnique({ where: { id }, include: { invoices: true } });
    if (!job) throw notFound('Job not found');
    if (job.invoices.length) throw badRequest('Cancel this job instead — it already has invoices');
    await prisma.job.delete({ where: { id } });
    return { ok: true };
  });

  // --- stage pipeline ------------------------------------------------------

  app.post('/:id/status', { preHandler: requirePermission('job:stage') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ status: statusEnum, note: optionalString }), request);
    const actor = currentUser(request);
    await prisma.$transaction((tx) =>
      changeJobStatus(tx, { jobId: id, toStatus: body.status, userId: actor.id, note: body.note }),
    );
    const job = await prisma.job.findUniqueOrThrow({ where: { id }, include: jobInclude });
    return canSeePricing(request) ? job : stripPricing(job);
  });

  app.get('/:id/history', { preHandler: requirePermission('job:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const [events, audits] = await Promise.all([
      prisma.jobStatusEvent.findMany({
        where: { jobId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: { entity: 'Job', entityId: id },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    return { statusEvents: events, audit: audits };
  });

  // --- checklist -----------------------------------------------------------

  app.post('/:id/checklist', { preHandler: requirePermission('job:stage') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ stage: statusEnum, label: z.string().min(1) }), request);
    const last = await prisma.jobChecklistItem.findFirst({
      where: { jobId: id, stage: body.stage },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return prisma.jobChecklistItem.create({
      data: {
        jobId: id,
        stage: body.stage,
        label: body.label,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  });

  app.patch('/:id/checklist/:itemId', { preHandler: requirePermission('job:stage') }, async (request) => {
    const { itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    const body = parseBody(z.object({ done: z.boolean().optional(), label: z.string().optional() }), request);
    const actor = currentUser(request);
    return prisma.jobChecklistItem.update({
      where: { id: itemId },
      data: {
        ...(body.label ? { label: body.label } : {}),
        ...(body.done === undefined
          ? {}
          : body.done
            ? { done: true, completedById: actor.id, completedAt: new Date() }
            : { done: false, completedById: null, completedAt: null }),
      },
      include: { completedBy: { select: { id: true, name: true } } },
    });
  });

  app.delete('/:id/checklist/:itemId', { preHandler: requirePermission('job:stage') }, async (request) => {
    const { itemId } = parseParams(idParam.extend({ itemId: z.string() }), request);
    await prisma.jobChecklistItem.delete({ where: { id: itemId } });
    return { ok: true };
  });

  // --- comments ------------------------------------------------------------

  app.post('/:id/comments', { preHandler: requirePermission('job:read') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({ body: z.string().min(1), internal: z.boolean().default(true) }),
      request,
    );
    const actor = currentUser(request);
    return prisma.jobComment.create({
      data: { jobId: id, userId: actor.id, body: body.body, internal: body.internal },
      include: { user: { select: { id: true, name: true } } },
    });
  });

  app.delete('/:id/comments/:commentId', { preHandler: requirePermission('job:write') }, async (request) => {
    const { commentId } = parseParams(idParam.extend({ commentId: z.string() }), request);
    await prisma.jobComment.delete({ where: { id: commentId } });
    return { ok: true };
  });

  // --- proofs --------------------------------------------------------------

  app.post('/:id/proofs', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(z.object({ fileId: optionalString, notes: optionalString }), request);
    const actor = currentUser(request);
    const latest = await prisma.proof.aggregate({ where: { jobId: id }, _max: { version: true } });
    const proof = await prisma.proof.create({
      data: {
        jobId: id,
        version: (latest._max.version ?? 0) + 1,
        fileId: body.fileId ?? null,
        notes: body.notes ?? null,
      },
      include: { file: true },
    });
    await recordAudit({
      entity: 'Job', entityId: id, action: 'update', userId: actor.id,
      summary: `Added proof v${proof.version}`,
    });
    return proof;
  });

  app.post('/:id/proofs/:proofId/send', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id, proofId } = parseParams(idParam.extend({ proofId: z.string() }), request);
    const actor = currentUser(request);
    const proof = await prisma.proof.update({
      where: { id: proofId },
      data: { sentAt: new Date(), status: 'PENDING' },
    });
    // Sending a proof is exactly the point the job is waiting on the customer.
    const job = await prisma.job.findUnique({ where: { id } });
    if (job && job.status === JobStatus.DESIGN_PROOF) {
      await prisma.$transaction((tx) =>
        changeJobStatus(tx, {
          jobId: id,
          toStatus: JobStatus.CLIENT_APPROVAL,
          userId: actor.id,
          note: `Proof v${proof.version} sent`,
        }),
      );
    }
    return proof;
  });

  /** Records the customer's decision on a proof, with who said so and when. */
  app.post('/:id/proofs/:proofId/decision', { preHandler: requirePermission('job:write') }, async (request) => {
    const { id, proofId } = parseParams(idParam.extend({ proofId: z.string() }), request);
    const body = parseBody(
      z.object({
        status: z.enum(['APPROVED', 'REJECTED']),
        decidedByName: z.string().min(1),
        clientNote: optionalString,
      }),
      request,
    );
    const actor = currentUser(request);

    const proof = await prisma.proof.update({
      where: { id: proofId },
      data: {
        status: body.status,
        decidedAt: new Date(),
        decidedByName: body.decidedByName,
        clientNote: body.clientNote ?? null,
      },
    });

    const job = await prisma.job.findUnique({ where: { id } });
    if (job && body.status === 'APPROVED' && job.status === JobStatus.CLIENT_APPROVAL) {
      await prisma.$transaction((tx) =>
        changeJobStatus(tx, {
          jobId: id,
          toStatus: JobStatus.MATERIALS_ORDERED,
          userId: actor.id,
          note: `Proof v${proof.version} approved by ${body.decidedByName}`,
        }),
      );
    }
    if (job && body.status === 'REJECTED' && job.status === JobStatus.CLIENT_APPROVAL) {
      await prisma.$transaction((tx) =>
        changeJobStatus(tx, {
          jobId: id,
          toStatus: JobStatus.DESIGN_PROOF,
          userId: actor.id,
          note: `Proof v${proof.version} rejected: ${body.clientNote ?? 'no reason given'}`,
        }),
      );
    }
    await recordAudit({
      entity: 'Job', entityId: id, action: 'update', userId: actor.id,
      summary: `Proof v${proof.version} ${body.status.toLowerCase()} by ${body.decidedByName}`,
    });
    return proof;
  });

  // --- material consumption ------------------------------------------------

  /**
   * Deducts stock for a job. Called from the job screen when the shop pulls
   * material, or automatically from the line items via ?fromItems=true.
   */
  app.post('/:id/consume', { preHandler: requirePermission('inventory:write') }, async (request) => {
    const { id } = parseParams(idParam, request);
    const body = parseBody(
      z.object({
        fromItems: z.boolean().default(false),
        materials: z
          .array(z.object({ materialId: z.string(), quantity: z.coerce.number().positive(), note: optionalString }))
          .default([]),
      }),
      request,
    );
    const actor = currentUser(request);

    return prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({
        where: { id },
        include: { items: { include: { material: true } } },
      });
      if (!job) throw notFound('Job not found');

      const lines = [...body.materials];
      if (body.fromItems) {
        for (const item of job.items) {
          if (!item.material) continue;
          const units = stockUnitsForArea(item.areaSqFt, item.material);
          if (units.isZero()) continue;
          lines.push({
            materialId: item.material.id,
            quantity: units.toNumber(),
            note: `Auto-deducted for "${item.description}"`,
          });
        }
      }
      if (!lines.length) throw badRequest('Nothing to consume — no materials given');

      const movements = [];
      for (const line of lines) {
        const material = await tx.material.findUnique({ where: { id: line.materialId } });
        if (!material) throw notFound(`Material ${line.materialId} not found`);
        const balanceAfter = material.stockQty.minus(line.quantity);
        await tx.material.update({
          where: { id: material.id },
          data: { stockQty: balanceAfter },
        });
        movements.push(
          await tx.stockMovement.create({
            data: {
              materialId: material.id,
              type: 'USAGE',
              quantity: new Prisma.Decimal(line.quantity).negated(),
              balanceAfter,
              unitCost: material.unitCost,
              jobId: id,
              userId: actor.id,
              note: line.note ?? null,
            },
            include: { material: { select: { id: true, sku: true, name: true, unit: true } } },
          }),
        );
      }
      return movements;
    });
  });
}
