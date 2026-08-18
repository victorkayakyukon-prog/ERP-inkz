import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { parseQuery } from '../../lib/http.js';
import { money } from '../../lib/money.js';
import { JOB_PIPELINE, JOB_STATUS_LABELS } from '../jobs/service.js';

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const defaultRange = (query: { from?: Date; to?: Date }) => {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getFullYear(), to.getMonth() - 11, 1);
  return { from, to };
};

export async function reportingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requirePermission('report:read'));

  /** Everything the landing dashboard needs, in one round trip. */
  app.get('/dashboard', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      openOpportunities,
      wonThisMonth,
      lostThisMonth,
      openJobs,
      jobsByStatus,
      overdueInvoices,
      outstanding,
      revenueThisMonth,
      lowStockCount,
      dueThisWeek,
    ] = await Promise.all([
      prisma.opportunity.aggregate({
        where: { stage: { in: ['NEW', 'CONTACTED', 'QUOTED'] } },
        _sum: { estimatedValue: true },
        _count: { _all: true },
      }),
      prisma.opportunity.count({ where: { stage: 'WON', closedAt: { gte: monthStart } } }),
      prisma.opportunity.count({ where: { stage: 'LOST', closedAt: { gte: monthStart } } }),
      prisma.job.count({ where: { status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] } } }),
      prisma.job.groupBy({
        by: ['status'],
        where: { status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] } },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ['SENT', 'PARTIAL'] }, dueDate: { lt: now }, balance: { gt: 0 } },
        _sum: { balance: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ['SENT', 'PARTIAL'] } },
        _sum: { balance: true },
      }),
      prisma.payment.aggregate({ where: { receivedAt: { gte: monthStart } }, _sum: { amount: true } }),
      prisma.material.count({ where: { active: true } }),
      prisma.job.count({
        where: {
          status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] },
          dueDate: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
        },
      }),
    ]);

    const materials = await prisma.material.findMany({
      where: { active: true },
      select: { stockQty: true, reorderPoint: true },
    });
    const lowStock = materials.filter((m) => m.stockQty.lessThanOrEqualTo(m.reorderPoint)).length;

    const decided = wonThisMonth + lostThisMonth;

    return {
      pipeline: {
        openCount: openOpportunities._count._all,
        openValue: openOpportunities._sum.estimatedValue ?? 0,
        wonThisMonth,
        lostThisMonth,
        winRatePct: decided ? Math.round((wonThisMonth / decided) * 100) : 0,
      },
      jobs: {
        open: openJobs,
        dueThisWeek,
        byStatus: JOB_PIPELINE.map((status) => ({
          status,
          label: JOB_STATUS_LABELS[status],
          count: jobsByStatus.find((row) => row.status === status)?._count._all ?? 0,
        })),
      },
      money: {
        revenueThisMonth: revenueThisMonth._sum.amount ?? 0,
        outstanding: outstanding._sum.balance ?? 0,
        overdueCount: overdueInvoices._count._all,
        overdueAmount: overdueInvoices._sum.balance ?? 0,
      },
      inventory: { trackedMaterials: lowStockCount, lowStock },
    };
  });

  /** Pipeline value and win rate by stage. */
  app.get('/pipeline', async (request) => {
    const query = parseQuery(rangeSchema, request);
    const { from, to } = defaultRange(query);

    const [byStage, decided] = await Promise.all([
      prisma.opportunity.groupBy({
        by: ['stage'],
        _sum: { estimatedValue: true },
        _count: { _all: true },
      }),
      prisma.opportunity.findMany({
        where: { stage: { in: ['WON', 'LOST'] }, closedAt: { gte: from, lte: to } },
        select: { stage: true, estimatedValue: true, closedAt: true, lostReason: true },
      }),
    ]);

    const won = decided.filter((o) => o.stage === 'WON');
    const lost = decided.filter((o) => o.stage === 'LOST');
    const lostReasons = new Map<string, number>();
    for (const opportunity of lost) {
      const reason = opportunity.lostReason?.trim() || 'Not recorded';
      lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
    }

    return {
      byStage: ['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST'].map((stage) => {
        const row = byStage.find((r) => r.stage === stage);
        return { stage, count: row?._count._all ?? 0, value: row?._sum.estimatedValue ?? 0 };
      }),
      winRate: {
        won: won.length,
        lost: lost.length,
        pct: decided.length ? Math.round((won.length / decided.length) * 100) : 0,
        wonValue: won.reduce((sum, o) => sum.plus(o.estimatedValue), new Prisma.Decimal(0)),
        lostValue: lost.reduce((sum, o) => sum.plus(o.estimatedValue), new Prisma.Decimal(0)),
      },
      lostReasons: [...lostReasons.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

  /**
   * Bottleneck view: where open jobs are piling up and how long they have sat
   * in the current stage. "Stuck in Client Approval" is the classic one.
   */
  app.get('/bottlenecks', async () => {
    const jobs = await prisma.job.findMany({
      where: { status: { notIn: [JobStatus.CLOSED, JobStatus.CANCELLED] } },
      include: {
        company: { select: { id: true, name: true } },
        statusEvents: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const byStatus = new Map<JobStatus, { count: number; totalDays: number; oldest: number; jobs: unknown[] }>();
    for (const job of jobs) {
      const since = job.statusEvents[0]?.createdAt ?? job.createdAt;
      const days = Math.floor((Date.now() - since.getTime()) / 86_400_000);
      const bucket = byStatus.get(job.status) ?? { count: 0, totalDays: 0, oldest: 0, jobs: [] };
      bucket.count += 1;
      bucket.totalDays += days;
      bucket.oldest = Math.max(bucket.oldest, days);
      bucket.jobs.push({
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        company: job.company.name,
        daysInStage: days,
        dueDate: job.dueDate,
      });
      byStatus.set(job.status, bucket);
    }

    return [...JOB_PIPELINE, JobStatus.ON_HOLD].map((status) => {
      const bucket = byStatus.get(status);
      return {
        status,
        label: JOB_STATUS_LABELS[status],
        count: bucket?.count ?? 0,
        avgDaysInStage: bucket?.count ? Math.round(bucket.totalDays / bucket.count) : 0,
        oldestDays: bucket?.oldest ?? 0,
        jobs: (bucket?.jobs ?? []).sort(
          (a, b) => (b as { daysInStage: number }).daysInStage - (a as { daysInStage: number }).daysInStage,
        ),
      };
    });
  });

  /** Revenue by month, from payments received. */
  app.get('/revenue', async (request) => {
    const query = parseQuery(rangeSchema, request);
    const { from, to } = defaultRange(query);

    const [payments, invoiced] = await Promise.all([
      prisma.payment.findMany({
        where: { receivedAt: { gte: from, lte: to } },
        select: { amount: true, receivedAt: true },
      }),
      prisma.invoice.findMany({
        where: { issueDate: { gte: from, lte: to }, status: { not: 'VOID' } },
        select: { total: true, issueDate: true },
      }),
    ]);

    const months = new Map<string, { collected: Prisma.Decimal; invoiced: Prisma.Decimal }>();
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = (k: string) =>
      months.get(k) ?? { collected: new Prisma.Decimal(0), invoiced: new Prisma.Decimal(0) };

    for (const payment of payments) {
      const k = key(payment.receivedAt);
      const b = bucket(k);
      months.set(k, { ...b, collected: b.collected.plus(payment.amount) });
    }
    for (const invoice of invoiced) {
      const k = key(invoice.issueDate);
      const b = bucket(k);
      months.set(k, { ...b, invoiced: b.invoiced.plus(invoice.total) });
    }

    return [...months.entries()]
      .map(([month, values]) => ({ month, collected: values.collected, invoiced: values.invoiced }))
      .sort((a, b) => a.month.localeCompare(b.month));
  });

  /** Revenue split by sign type and by customer. */
  app.get('/revenue-breakdown', async (request) => {
    const query = parseQuery(rangeSchema, request);
    const { from, to } = defaultRange(query);

    const items = await prisma.jobItem.findMany({
      where: { job: { createdAt: { gte: from, lte: to }, status: { not: JobStatus.CANCELLED } } },
      select: {
        signType: true,
        lineTotal: true,
        materialCost: true,
        job: { select: { companyId: true, company: { select: { name: true } } } },
      },
    });

    const bySignType = new Map<string, { revenue: Prisma.Decimal; cost: Prisma.Decimal; count: number }>();
    const byCustomer = new Map<string, { name: string; revenue: Prisma.Decimal; count: number }>();

    for (const item of items) {
      const signBucket = bySignType.get(item.signType) ?? {
        revenue: new Prisma.Decimal(0), cost: new Prisma.Decimal(0), count: 0,
      };
      bySignType.set(item.signType, {
        revenue: signBucket.revenue.plus(item.lineTotal),
        cost: signBucket.cost.plus(item.materialCost),
        count: signBucket.count + 1,
      });

      const customerBucket = byCustomer.get(item.job.companyId) ?? {
        name: item.job.company.name, revenue: new Prisma.Decimal(0), count: 0,
      };
      byCustomer.set(item.job.companyId, {
        name: customerBucket.name,
        revenue: customerBucket.revenue.plus(item.lineTotal),
        count: customerBucket.count + 1,
      });
    }

    return {
      bySignType: [...bySignType.entries()]
        .map(([signType, v]) => ({ signType, ...v }))
        .sort((a, b) => b.revenue.comparedTo(a.revenue)),
      byCustomer: [...byCustomer.entries()]
        .map(([companyId, v]) => ({ companyId, ...v }))
        .sort((a, b) => b.revenue.comparedTo(a.revenue))
        .slice(0, 25),
    };
  });

  /**
   * Margin per job: contract value against material actually consumed, which
   * is the number that tells the owner whether the estimate held up.
   */
  app.get('/margins', async (request) => {
    const query = parseQuery(rangeSchema.extend({ limit: z.coerce.number().int().max(200).default(50) }), request);
    const { from, to } = defaultRange(query);

    const jobs = await prisma.job.findMany({
      where: { createdAt: { gte: from, lte: to }, status: { not: JobStatus.CANCELLED } },
      include: {
        company: { select: { id: true, name: true } },
        stockMovements: { where: { type: { in: ['USAGE', 'WASTE'] } }, select: { quantity: true, unitCost: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return jobs.map((job) => {
      const actualMaterialCost = money(
        job.stockMovements.reduce(
          (sum, movement) => sum.plus(movement.quantity.abs().times(movement.unitCost ?? 0)),
          new Prisma.Decimal(0),
        ),
      );
      const quoted = job.quotedMaterialCost;
      const margin = money(job.contractTotal.minus(actualMaterialCost));
      const marginPct = job.contractTotal.isZero()
        ? new Prisma.Decimal(0)
        : margin.dividedBy(job.contractTotal).times(100).toDecimalPlaces(1);

      return {
        id: job.id,
        jobNumber: job.jobNumber,
        title: job.title,
        company: job.company.name,
        status: job.status,
        contractTotal: job.contractTotal,
        quotedMaterialCost: quoted,
        actualMaterialCost,
        materialVariance: money(actualMaterialCost.minus(quoted)),
        margin,
        marginPct,
      };
    });
  });

  /** Aged receivables, bucketed the way a bookkeeper expects to see them. */
  app.get('/receivables', async () => {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIAL'] }, balance: { gt: 0 } },
      include: {
        company: { select: { id: true, name: true } },
        job: { select: { id: true, jobNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: new Prisma.Decimal(0), d30: new Prisma.Decimal(0), d60: new Prisma.Decimal(0), d90: new Prisma.Decimal(0) };
    const rows = invoices.map((invoice) => {
      const daysOverdue = invoice.dueDate
        ? Math.floor((Date.now() - invoice.dueDate.getTime()) / 86_400_000)
        : 0;
      if (daysOverdue <= 0) buckets.current = buckets.current.plus(invoice.balance);
      else if (daysOverdue <= 30) buckets.d30 = buckets.d30.plus(invoice.balance);
      else if (daysOverdue <= 60) buckets.d60 = buckets.d60.plus(invoice.balance);
      else buckets.d90 = buckets.d90.plus(invoice.balance);

      return {
        id: invoice.id,
        number: invoice.number,
        company: invoice.company.name,
        companyId: invoice.company.id,
        job: invoice.job?.jobNumber ?? null,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        total: invoice.total,
        balance: invoice.balance,
        daysOverdue: Math.max(0, daysOverdue),
      };
    });

    return {
      buckets: {
        current: buckets.current,
        '1-30': buckets.d30,
        '31-60': buckets.d60,
        '60+': buckets.d90,
      },
      invoices: rows.sort((a, b) => b.daysOverdue - a.daysOverdue),
    };
  });
}
