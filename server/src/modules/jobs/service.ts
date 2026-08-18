import { JobStatus, Prisma } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
import { nextNumber } from '../../lib/numbering.js';
import { badRequest, notFound } from '../../lib/errors.js';

/**
 * The shop's default job pipeline. Stages are ordered; the board renders them
 * in this sequence and `canTransition` uses it to describe legal moves.
 */
export const JOB_PIPELINE: JobStatus[] = [
  JobStatus.DESIGN_PROOF,
  JobStatus.CLIENT_APPROVAL,
  JobStatus.MATERIALS_ORDERED,
  JobStatus.PRODUCTION,
  JobStatus.FINISHING,
  JobStatus.QC,
  JobStatus.READY,
  JobStatus.INSTALLED,
  JobStatus.INVOICED,
  JobStatus.CLOSED,
];

/** Off-pipeline states a job can enter from anywhere. */
export const JOB_SIDE_STATES: JobStatus[] = [JobStatus.ON_HOLD, JobStatus.CANCELLED];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DESIGN_PROOF: 'Design / Proof',
  CLIENT_APPROVAL: 'Client Approval',
  MATERIALS_ORDERED: 'Materials Ordered',
  PRODUCTION: 'Production',
  FINISHING: 'Finishing / Assembly',
  QC: 'QC',
  READY: 'Ready for Install / Pickup',
  INSTALLED: 'Installed',
  INVOICED: 'Invoiced',
  CLOSED: 'Closed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
};

/**
 * Checklist seeded onto every new job. Shop floor ticks these off as a stage
 * progresses; nothing blocks on them, they are a memory aid for the crew.
 */
const CHECKLIST_TEMPLATE: Array<{ stage: JobStatus; label: string }> = [
  { stage: JobStatus.DESIGN_PROOF, label: 'Collect customer artwork / logos' },
  { stage: JobStatus.DESIGN_PROOF, label: 'Confirm dimensions and mounting location' },
  { stage: JobStatus.DESIGN_PROOF, label: 'Build proof at scale with color callouts' },
  { stage: JobStatus.CLIENT_APPROVAL, label: 'Send proof to customer' },
  { stage: JobStatus.CLIENT_APPROVAL, label: 'Written approval on file' },
  { stage: JobStatus.MATERIALS_ORDERED, label: 'Check substrate stock on hand' },
  { stage: JobStatus.MATERIALS_ORDERED, label: 'Raise PO for anything short' },
  { stage: JobStatus.PRODUCTION, label: 'Print / route / cut' },
  { stage: JobStatus.PRODUCTION, label: 'Color check against proof' },
  { stage: JobStatus.FINISHING, label: 'Laminate / weed / mask' },
  { stage: JobStatus.FINISHING, label: 'Trim, hem, grommet or assemble' },
  { stage: JobStatus.QC, label: 'Spell check against approved proof' },
  { stage: JobStatus.QC, label: 'Inspect for scratches, bubbles, edge lift' },
  { stage: JobStatus.READY, label: 'Package and label for install or pickup' },
  { stage: JobStatus.INSTALLED, label: 'Site photos uploaded' },
  { stage: JobStatus.INSTALLED, label: 'Customer sign-off collected' },
];

export function defaultChecklist(): Array<{ stage: JobStatus; label: string; sortOrder: number }> {
  return CHECKLIST_TEMPLATE.map((item, index) => ({ ...item, sortOrder: index }));
}

/**
 * Jobs move forward one stage at a time, but the shop is allowed to jump
 * backwards freely (a failed QC goes straight back to production) and to
 * park a job on hold from anywhere.
 */
export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return false;
  if (JOB_SIDE_STATES.includes(to)) return true;
  if (JOB_SIDE_STATES.includes(from)) return true; // resuming a held job
  const fromIndex = JOB_PIPELINE.indexOf(from);
  const toIndex = JOB_PIPELINE.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  if (toIndex < fromIndex) return true; // rework
  return toIndex === fromIndex + 1;
}

export function nextStatus(from: JobStatus): JobStatus | null {
  const index = JOB_PIPELINE.indexOf(from);
  if (index === -1 || index === JOB_PIPELINE.length - 1) return null;
  return JOB_PIPELINE[index + 1] ?? null;
}

export interface StatusChangeInput {
  jobId: string;
  toStatus: JobStatus;
  userId?: string | null;
  note?: string | null;
  /** Allows the seed script and quote conversion to set a status directly. */
  force?: boolean;
}

/** Moves a job and writes the audit trail entry in the same transaction. */
export async function changeJobStatus(tx: Tx, input: StatusChangeInput) {
  const job = await tx.job.findUnique({ where: { id: input.jobId } });
  if (!job) throw notFound('Job not found');
  if (job.status === input.toStatus) return job;
  if (!input.force && !canTransition(job.status, input.toStatus)) {
    throw badRequest(
      `Cannot move a job from ${JOB_STATUS_LABELS[job.status]} to ${JOB_STATUS_LABELS[input.toStatus]}`,
    );
  }

  const updated = await tx.job.update({
    where: { id: input.jobId },
    data: {
      status: input.toStatus,
      ...(input.toStatus === JobStatus.PRODUCTION && !job.startedAt ? { startedAt: new Date() } : {}),
      ...(input.toStatus === JobStatus.CLOSED || input.toStatus === JobStatus.CANCELLED
        ? { closedAt: new Date() }
        : {}),
      ...(input.toStatus === JobStatus.ON_HOLD ? { onHoldReason: input.note ?? null } : {}),
      ...(job.status === JobStatus.ON_HOLD ? { onHoldReason: null } : {}),
    },
  });

  await tx.jobStatusEvent.create({
    data: {
      jobId: job.id,
      fromStatus: job.status,
      toStatus: input.toStatus,
      userId: input.userId ?? null,
      note: input.note ?? null,
    },
  });

  await tx.auditLog.create({
    data: {
      entity: 'Job',
      entityId: job.id,
      action: 'status_change',
      userId: input.userId ?? null,
      summary: `${job.jobNumber}: ${JOB_STATUS_LABELS[job.status]} → ${JOB_STATUS_LABELS[input.toStatus]}`,
      changes: { status: { from: job.status, to: input.toStatus } } as never,
    },
  });

  return updated;
}

/**
 * Turns an accepted quote into a job: copies the line items, snapshots the
 * contract value, and seeds the stage checklist. Runs inside a transaction so
 * a half-built job can never exist.
 */
export async function createJobFromQuote(tx: Tx, quoteId: string, userId?: string | null) {
  const quote = await tx.quote.findUnique({
    where: { id: quoteId },
    include: { items: { orderBy: { sortOrder: 'asc' } }, company: true },
  });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'ACCEPTED') {
    throw badRequest('Only an accepted quote can be converted into a job');
  }
  const existing = await tx.job.findFirst({ where: { quoteId } });
  if (existing) throw badRequest(`Quote ${quote.number} is already on job ${existing.jobNumber}`);

  const jobNumber = await nextNumber(tx, 'job');
  const installRequired = quote.items.some((item) => item.installRequired);

  const job = await tx.job.create({
    data: {
      jobNumber,
      title: quote.title,
      status: JobStatus.DESIGN_PROOF,
      companyId: quote.companyId,
      contactId: quote.contactId,
      quoteId: quote.id,
      opportunityId: quote.opportunityId,
      ownerId: userId ?? quote.createdById,
      contractTotal: quote.total,
      quotedMaterialCost: quote.materialCost,
      installRequired,
      installStreet: quote.company.billingStreet,
      installCity: quote.company.billingCity,
      installState: quote.company.billingState,
      installZip: quote.company.billingZip,
      description: quote.notes,
      items: {
        create: quote.items.map((item, index) => ({
          sortOrder: index,
          signType: item.signType,
          description: item.description,
          widthIn: item.widthIn,
          heightIn: item.heightIn,
          quantity: item.quantity,
          materialId: item.materialId,
          areaSqFt: item.areaSqFt,
          lineTotal: item.lineTotal,
          materialCost: item.materialCost,
          installRequired: item.installRequired,
          notes: item.notes,
        })),
      },
      checklist: { create: defaultChecklist() },
      statusEvents: {
        create: {
          toStatus: JobStatus.DESIGN_PROOF,
          userId: userId ?? null,
          note: `Created from quote ${quote.number}`,
        },
      },
    },
    include: { items: true },
  });

  if (quote.opportunityId) {
    await tx.opportunity.update({
      where: { id: quote.opportunityId },
      data: { stage: 'WON', closedAt: new Date() },
    });
  }

  await tx.auditLog.create({
    data: {
      entity: 'Job',
      entityId: job.id,
      action: 'create',
      userId: userId ?? null,
      summary: `Created ${job.jobNumber} from quote ${quote.number}`,
    },
  });

  return job;
}

/**
 * Consumes material for a job. Sheet-goods are tracked in sheets, everything
 * else in its own unit, so square footage is converted when geometry is known.
 */
export function stockUnitsForArea(
  areaSqFt: Prisma.Decimal | number,
  material: { unit: string; sheetWidthIn: Prisma.Decimal | null; sheetHeightIn: Prisma.Decimal | null },
): Prisma.Decimal {
  const area = new Prisma.Decimal(areaSqFt);
  if (material.unit === 'SQFT') return area;
  if ((material.unit === 'SHEET' || material.unit === 'ROLL') && material.sheetWidthIn && material.sheetHeightIn) {
    const sheetSqFt = new Prisma.Decimal(material.sheetWidthIn)
      .times(material.sheetHeightIn)
      .dividedBy(144);
    if (sheetSqFt.isZero()) return area;
    return area.dividedBy(sheetSqFt).toDecimalPlaces(3, Prisma.Decimal.ROUND_CEIL);
  }
  return area;
}
