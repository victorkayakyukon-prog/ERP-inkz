import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { authenticate, currentUser, requirePermission } from '../../lib/auth.js';
import { parseBody, parseQuery } from '../../lib/http.js';
import { getSettings } from '../../lib/settings.js';
import { recordAudit } from '../../lib/audit.js';
import { paginationSchema, skipTake, paginate } from '../../lib/http.js';

const settingsSchema = z.object({
  shopName: z.string().min(1).optional(),
  shopEmail: z.string().optional(),
  shopPhone: z.string().optional(),
  shopStreet: z.string().optional(),
  shopCity: z.string().optional(),
  shopState: z.string().optional(),
  shopZip: z.string().optional(),
  defaultMarkupPct: z.coerce.number().min(0).optional(),
  defaultMinimumCharge: z.coerce.number().min(0).optional(),
  rushFeePct: z.coerce.number().min(0).optional(),
  laborRate: z.coerce.number().min(0).optional(),
  installRate: z.coerce.number().min(0).optional(),
  laminateCostPerSqFt: z.coerce.number().min(0).optional(),
  mountingCostPerSqFt: z.coerce.number().min(0).optional(),
  contourCutFee: z.coerce.number().min(0).optional(),
  grommetFee: z.coerce.number().min(0).optional(),
  hemFeePerLinearFt: z.coerce.number().min(0).optional(),
  defaultTaxRatePct: z.coerce.number().min(0).optional(),
  taxJurisdiction: z.string().optional(),
  depositPct: z.coerce.number().min(0).max(100).optional(),
  quoteValidDays: z.coerce.number().int().min(1).optional(),
  paymentTerms: z.string().optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async () => getSettings());

  app.patch('/', { preHandler: requirePermission('settings:write') }, async (request) => {
    const body = parseBody(settingsSchema, request);
    const actor = currentUser(request);
    await getSettings(); // ensure the row exists
    const updated = await prisma.setting.update({ where: { id: 1 }, data: body });
    await recordAudit({
      entity: 'Setting', entityId: '1', action: 'update', userId: actor.id,
      summary: 'Updated shop settings',
      changes: body,
    });
    return updated;
  });

  /** Shop-wide audit feed, for the admin screen. */
  app.get('/audit', { preHandler: requirePermission('settings:write') }, async (request) => {
    const query = parseQuery(
      paginationSchema.extend({ entity: z.string().optional(), entityId: z.string().optional() }),
      request,
    );
    const where = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(query.page, query.pageSize),
      }),
      prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query.page, query.pageSize);
  });
}
