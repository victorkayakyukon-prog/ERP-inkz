import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { authenticate, canSeePricing } from '../../lib/auth.js';
import { parseQuery } from '../../lib/http.js';
import { roleHas } from '../../lib/rbac.js';
import { currentUser } from '../../lib/auth.js';

export interface SearchHit {
  type: 'company' | 'contact' | 'job' | 'quote' | 'invoice' | 'material';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/**
 * Global search across the records a shop looks up by name or number at the
 * counter: customers, job numbers, quotes, invoices, and the material catalog.
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request) => {
    const { q, limit } = parseQuery(
      z.object({ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(50).default(8) }),
      request,
    );
    const actor = currentUser(request);
    const contains = { contains: q, mode: 'insensitive' as const };
    const showMoney = canSeePricing(request);

    const [companies, contacts, jobs, quotes, invoices, materials] = await Promise.all([
      roleHas(actor.role, 'crm:read')
        ? prisma.company.findMany({
            where: { OR: [{ name: contains }, { email: contains }, { phone: contains }] },
            take: limit,
            orderBy: { name: 'asc' },
          })
        : [],
      roleHas(actor.role, 'crm:read')
        ? prisma.contact.findMany({
            where: {
              OR: [{ firstName: contains }, { lastName: contains }, { email: contains }, { phone: contains }],
            },
            include: { company: { select: { name: true } } },
            take: limit,
          })
        : [],
      prisma.job.findMany({
        where: { OR: [{ jobNumber: contains }, { title: contains }, { company: { name: contains } }] },
        include: { company: { select: { name: true } } },
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      roleHas(actor.role, 'quote:read')
        ? prisma.quote.findMany({
            where: { OR: [{ number: contains }, { title: contains }, { company: { name: contains } }] },
            include: { company: { select: { name: true } } },
            take: limit,
            orderBy: { createdAt: 'desc' },
          })
        : [],
      roleHas(actor.role, 'invoice:read')
        ? prisma.invoice.findMany({
            where: { OR: [{ number: contains }, { company: { name: contains } }] },
            include: { company: { select: { name: true } } },
            take: limit,
            orderBy: { issueDate: 'desc' },
          })
        : [],
      roleHas(actor.role, 'inventory:read')
        ? prisma.material.findMany({
            where: { active: true, OR: [{ sku: contains }, { name: contains }] },
            take: limit,
            orderBy: { name: 'asc' },
          })
        : [],
    ]);

    const hits: SearchHit[] = [
      ...companies.map((c) => ({
        type: 'company' as const, id: c.id, title: c.name,
        subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || 'Customer',
        href: `/crm/companies/${c.id}`,
      })),
      ...contacts.map((c) => ({
        type: 'contact' as const, id: c.id, title: `${c.firstName} ${c.lastName}`,
        subtitle: [c.company?.name, c.email, c.phone].filter(Boolean).join(' · '),
        href: c.companyId ? `/crm/companies/${c.companyId}` : `/crm/contacts`,
      })),
      ...jobs.map((j) => ({
        type: 'job' as const, id: j.id, title: `${j.jobNumber} — ${j.title}`,
        subtitle: `${j.company.name} · ${j.status.replace(/_/g, ' ')}`,
        href: `/jobs/${j.id}`,
      })),
      ...quotes.map((q2) => ({
        type: 'quote' as const, id: q2.id, title: `${q2.number} — ${q2.title}`,
        subtitle: `${q2.company.name} · ${q2.status}${showMoney ? ` · $${q2.total}` : ''}`,
        href: `/quotes/${q2.id}`,
      })),
      ...invoices.map((i) => ({
        type: 'invoice' as const, id: i.id, title: i.number,
        subtitle: `${i.company.name} · ${i.status}${showMoney ? ` · $${i.balance} due` : ''}`,
        href: `/invoices/${i.id}`,
      })),
      ...materials.map((m) => ({
        type: 'material' as const, id: m.id, title: `${m.sku} — ${m.name}`,
        subtitle: `${m.category} · ${m.stockQty} ${m.unit} on hand`,
        href: `/inventory/materials/${m.id}`,
      })),
    ];

    return { query: q, hits };
  });
}
