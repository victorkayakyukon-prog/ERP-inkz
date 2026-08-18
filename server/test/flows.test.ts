import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/db.js';
import { auth, createTestApp, resetDatabase, seedBasics } from './helpers.js';

let app: FastifyInstance;
let tokens: Record<string, string>;
let fixtures: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const context = await createTestApp();
  app = context.app;
  tokens = context.tokens;
  fixtures = await seedBasics();
});

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

const json = (response: { body: string }) => JSON.parse(response.body);

describe('auth', () => {
  it('rejects a bad password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@test.local', password: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('issues a token and reports the role permissions', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sales@test.local', password: 'password123' },
    });
    expect(response.statusCode).toBe(200);
    const body = json(response);
    expect(body.token).toBeTruthy();
    expect(body.user.permissions).toContain('quote:write');
    expect(body.user.permissions).not.toContain('user:manage');
  });

  it('refuses unauthenticated requests', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/companies' });
    expect(response.statusCode).toBe(401);
  });
});

describe('quote to job to invoice', () => {
  /** Builds a quote with one 4x8 panel at $10/sq ft. */
  const buildQuote = async () =>
    app.inject({
      method: 'POST',
      url: '/api/quotes',
      headers: auth(tokens.sales!),
      payload: {
        title: 'Storefront panel',
        companyId: fixtures.company.id,
        contactId: fixtures.contact.id,
        items: [
          {
            signType: 'MONUMENT',
            description: '4x8 ACM panel',
            widthIn: 48,
            heightIn: 96,
            quantity: 1,
            materialId: fixtures.material.id,
            installRequired: true,
            installHours: 2,
            installRate: 100,
          },
        ],
      },
    });

  it('prices a new quote from the material catalog', async () => {
    const response = await buildQuote();
    expect(response.statusCode).toBe(200);
    const quote = json(response);

    expect(quote.number).toMatch(/^Q-\d{4}-0001$/);
    expect(quote.items[0].areaSqFt).toBe(32);
    expect(quote.items[0].lineTotal).toBe(520); // 32 sqft * $10 + 2h install @ $100
    expect(quote.items[0].materialCost).toBe(64); // 32 sqft * $2/sqft cost
    expect(quote.subtotal).toBe(520);
    expect(quote.taxAmount).toBe(52); // 10% default rate
    expect(quote.total).toBe(572);
  });

  it('locks an accepted quote and creates the job from it', async () => {
    const quote = json(await buildQuote());

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/quotes/${quote.id}/accept`,
      headers: auth(tokens.sales!),
      payload: { signedName: 'Pat Buyer' },
    });
    expect(accepted.statusCode).toBe(200);
    const body = json(accepted);

    expect(body.quote.status).toBe('ACCEPTED');
    expect(body.quote.signedName).toBe('Pat Buyer');
    expect(body.job.jobNumber).toMatch(/^J-\d{4}-0001$/);
    expect(body.job.contractTotal).toBe(572);
    expect(body.job.installRequired).toBe(true);
    expect(body.job.items).toHaveLength(1);

    // The job starts at the front of the pipeline with its checklist seeded.
    const job = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${body.job.id}`, headers: auth(tokens.sales!) }),
    );
    expect(job.status).toBe('DESIGN_PROOF');
    expect(job.checklist.length).toBeGreaterThan(0);
    expect(job.statusEvents).toHaveLength(1);

    // Editing an accepted quote is refused.
    const edit = await app.inject({
      method: 'PATCH',
      url: `/api/quotes/${quote.id}`,
      headers: auth(tokens.sales!),
      payload: { title: 'Changed' },
    });
    expect(edit.statusCode).toBe(400);

    // And it cannot be converted a second time.
    const again = await app.inject({
      method: 'POST',
      url: `/api/quotes/${quote.id}/convert`,
      headers: auth(tokens.sales!),
    });
    expect(again.statusCode).toBe(400);
  });

  it('versions a quote without touching the original', async () => {
    const quote = json(await buildQuote());
    await app.inject({ method: 'POST', url: `/api/quotes/${quote.id}/send`, headers: auth(tokens.sales!) });

    const v2 = json(
      await app.inject({
        method: 'POST',
        url: `/api/quotes/${quote.id}/new-version`,
        headers: auth(tokens.sales!),
      }),
    );
    expect(v2.version).toBe(2);
    expect(v2.parentQuoteId).toBe(quote.id);
    expect(v2.total).toBe(quote.total);
    expect(v2.items).toHaveLength(1);

    const original = json(
      await app.inject({ method: 'GET', url: `/api/quotes/${quote.id}`, headers: auth(tokens.sales!) }),
    );
    expect(original.status).toBe('EXPIRED');
    expect(original.versions).toHaveLength(2);
  });

  it('bills a deposit then a final invoice that lands on the contract total', async () => {
    const quote = json(await buildQuote());
    const { job } = json(
      await app.inject({
        method: 'POST',
        url: `/api/quotes/${quote.id}/accept`,
        headers: auth(tokens.sales!),
        payload: { signedName: 'Pat Buyer' },
      }),
    );

    const deposit = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/invoice`,
        headers: auth(tokens.sales!),
        payload: { type: 'DEPOSIT' },
      }),
    );
    expect(deposit.type).toBe('DEPOSIT');
    expect(deposit.subtotal).toBe(286); // 50% of the 572 contract
    expect(deposit.total).toBe(314.6); // + 10% tax

    const final = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/invoice`,
        headers: auth(tokens.sales!),
        payload: { type: 'FINAL' },
      }),
    );
    expect(final.subtotal).toBe(286); // contract less what was already billed
    expect(deposit.subtotal + final.subtotal).toBe(572);
  });

  it('tracks partial payments and marks an invoice paid', async () => {
    const quote = json(await buildQuote());
    const { job } = json(
      await app.inject({
        method: 'POST',
        url: `/api/quotes/${quote.id}/accept`,
        headers: auth(tokens.sales!),
        payload: { signedName: 'Pat Buyer' },
      }),
    );
    const invoice = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/invoice`,
        headers: auth(tokens.sales!),
        payload: { type: 'FULL' },
      }),
    );

    // A payment cannot be taken against a draft.
    const early = await app.inject({
      method: 'POST',
      url: `/api/invoices/${invoice.id}/payments`,
      headers: auth(tokens.sales!),
      payload: { amount: 100, method: 'CHECK' },
    });
    expect(early.statusCode).toBe(400);

    await app.inject({ method: 'POST', url: `/api/invoices/${invoice.id}/send`, headers: auth(tokens.sales!) });

    const partial = json(
      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoice.id}/payments`,
        headers: auth(tokens.sales!),
        payload: { amount: 200, method: 'CHECK', reference: '#1001' },
      }),
    );
    expect(partial.status).toBe('PARTIAL');
    expect(partial.amountPaid).toBe(200);
    expect(partial.balance).toBe(372);

    const paid = json(
      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoice.id}/payments`,
        headers: auth(tokens.sales!),
        payload: { amount: 372, method: 'ACH' },
      }),
    );
    expect(paid.status).toBe('PAID');
    expect(paid.balance).toBe(0);
    expect(paid.paidAt).toBeTruthy();
  });
});

describe('job pipeline', () => {
  const makeJob = async () =>
    json(
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: auth(tokens.sales!),
        payload: { title: 'Board test job', companyId: fixtures.company.id },
      }),
    );

  it('advances one stage at a time and records who moved it', async () => {
    const job = await makeJob();

    const skip = await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/status`,
      headers: auth(tokens.production!),
      payload: { status: 'PRODUCTION' },
    });
    expect(skip.statusCode).toBe(400); // cannot jump past Client Approval

    const step = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.production!),
        payload: { status: 'CLIENT_APPROVAL' },
      }),
    );
    expect(step.status).toBe('CLIENT_APPROVAL');

    const history = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${job.id}/history`, headers: auth(tokens.sales!) }),
    );
    const latest = history.statusEvents[0];
    expect(latest.fromStatus).toBe('DESIGN_PROOF');
    expect(latest.toStatus).toBe('CLIENT_APPROVAL');
    expect(latest.user.name).toBe('production user');
    expect(history.audit.some((entry: { action: string }) => entry.action === 'status_change')).toBe(true);
  });

  it('allows rework backwards and holding from any stage', async () => {
    const job = await makeJob();
    for (const status of ['CLIENT_APPROVAL', 'MATERIALS_ORDERED', 'PRODUCTION']) {
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.production!),
        payload: { status },
      });
    }
    const back = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.production!),
        payload: { status: 'DESIGN_PROOF', note: 'Customer changed the copy' },
      }),
    );
    expect(back.status).toBe('DESIGN_PROOF');

    const held = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.production!),
        payload: { status: 'ON_HOLD', note: 'Waiting on artwork' },
      }),
    );
    expect(held.status).toBe('ON_HOLD');
    expect(held.onHoldReason).toBe('Waiting on artwork');
  });

  it('moves the job along when a proof is sent and approved', async () => {
    const job = await makeJob();
    const proof = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/proofs`,
        headers: auth(tokens.sales!),
        payload: { notes: 'v1 for review' },
      }),
    );
    expect(proof.version).toBe(1);

    await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/proofs/${proof.id}/send`,
      headers: auth(tokens.sales!),
    });
    let current = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(tokens.sales!) }),
    );
    expect(current.status).toBe('CLIENT_APPROVAL');

    await app.inject({
      method: 'POST',
      url: `/api/jobs/${job.id}/proofs/${proof.id}/decision`,
      headers: auth(tokens.sales!),
      payload: { status: 'APPROVED', decidedByName: 'Pat Buyer' },
    });
    current = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(tokens.sales!) }),
    );
    expect(current.status).toBe('MATERIALS_ORDERED');
    expect(current.proofs[0].decidedByName).toBe('Pat Buyer');
  });

  it('groups the board by stage with a days-in-stage counter', async () => {
    await makeJob();
    const board = json(
      await app.inject({ method: 'GET', url: '/api/jobs/board', headers: auth(tokens.production!) }),
    );
    const design = board.find((column: { status: string }) => column.status === 'DESIGN_PROOF');
    expect(design.jobs).toHaveLength(1);
    expect(design.jobs[0].daysInStage).toBe(0);
  });
});

describe('role based access', () => {
  it('hides pricing from the shop floor', async () => {
    const job = json(
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: auth(tokens.sales!),
        payload: { title: 'Priced job', companyId: fixtures.company.id, contractTotal: 5000 },
      }),
    );
    expect(job.contractTotal).toBe(5000);

    const shopView = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(tokens.production!) }),
    );
    expect(shopView.contractTotal).toBeUndefined();
    expect(shopView.title).toBe('Priced job');
  });

  it('keeps quoting away from production and install roles', async () => {
    for (const role of ['production', 'installer']) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/quotes',
        headers: auth(tokens[role]!),
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('lets only an admin manage users', async () => {
    const asManager = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      headers: auth(tokens.manager!),
      payload: { email: 'new@test.local', name: 'New', password: 'password123', role: 'SALES' },
    });
    expect(asManager.statusCode).toBe(403);

    const asAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      headers: auth(tokens.admin!),
      payload: { email: 'new@test.local', name: 'New', password: 'password123', role: 'SALES' },
    });
    expect(asAdmin.statusCode).toBe(200);
  });

  it('restricts the installer to install work', async () => {
    const installs = await app.inject({
      method: 'GET',
      url: '/api/installs?mine=true',
      headers: auth(tokens.installer!),
    });
    expect(installs.statusCode).toBe(200);

    const inventory = await app.inject({
      method: 'GET',
      url: '/api/materials',
      headers: auth(tokens.installer!),
    });
    expect(inventory.statusCode).toBe(403);
  });
});

describe('inventory', () => {
  it('deducts stock when a job consumes material and logs the movement', async () => {
    const job = json(
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: auth(tokens.sales!),
        payload: { title: 'Consuming job', companyId: fixtures.company.id },
      }),
    );

    const movements = json(
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/consume`,
        headers: auth(tokens.production!),
        payload: { materials: [{ materialId: fixtures.material.id, quantity: 3, note: 'Pulled 3 sheets' }] },
      }),
    );
    expect(movements[0].quantity).toBe(-3);
    expect(movements[0].balanceAfter).toBe(17);

    const material = json(
      await app.inject({
        method: 'GET',
        url: `/api/materials/${fixtures.material.id}`,
        headers: auth(tokens.production!),
      }),
    );
    expect(material.stockQty).toBe(17);
    expect(material.stockMovements[0].job.id).toBe(job.id);
  });

  it('flags material at or below its reorder point', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/stock-movements',
      headers: auth(tokens.production!),
      payload: { materialId: fixtures.material.id, type: 'USAGE', quantity: 16 },
    });
    const low = json(
      await app.inject({
        method: 'GET',
        url: '/api/materials/low-stock',
        headers: auth(tokens.production!),
      }),
    );
    expect(low).toHaveLength(1);
    expect(low[0].sku).toBe('TEST-ACM');
    expect(low[0].suggestedOrderQty).toBe(10);
  });

  it('receives a purchase order into stock', async () => {
    const vendor = json(
      await app.inject({
        method: 'POST',
        url: '/api/vendors',
        headers: auth(tokens.production!),
        payload: { name: 'Test Vendor' },
      }),
    );
    const po = json(
      await app.inject({
        method: 'POST',
        url: '/api/purchase-orders',
        headers: auth(tokens.production!),
        payload: {
          vendorId: vendor.id,
          items: [{ materialId: fixtures.material.id, quantityOrdered: 10, unitCost: 70 }],
        },
      }),
    );
    expect(po.number).toMatch(/^PO-\d{4}-0001$/);
    expect(po.total).toBe(700);

    await app.inject({
      method: 'POST',
      url: `/api/purchase-orders/${po.id}/send`,
      headers: auth(tokens.production!),
    });

    const partial = json(
      await app.inject({
        method: 'POST',
        url: `/api/purchase-orders/${po.id}/receive`,
        headers: auth(tokens.production!),
        payload: { lines: [{ itemId: po.items[0].id, quantity: 4 }] },
      }),
    );
    expect(partial.status).toBe('PARTIAL');

    const received = json(
      await app.inject({
        method: 'POST',
        url: `/api/purchase-orders/${po.id}/receive`,
        headers: auth(tokens.production!),
        payload: { lines: [{ itemId: po.items[0].id, quantity: 6 }] },
      }),
    );
    expect(received.status).toBe('RECEIVED');

    const material = json(
      await app.inject({
        method: 'GET',
        url: `/api/materials/${fixtures.material.id}`,
        headers: auth(tokens.production!),
      }),
    );
    expect(material.stockQty).toBe(30);
    expect(material.unitCost).toBe(70); // receiving at a new price updates cost
  });
});

describe('crm pipeline', () => {
  it('moves an opportunity across the kanban and stamps the close date', async () => {
    const opportunity = json(
      await app.inject({
        method: 'POST',
        url: '/api/opportunities',
        headers: auth(tokens.sales!),
        payload: { title: 'New lead', companyId: fixtures.company.id, estimatedValue: 5000 },
      }),
    );
    expect(opportunity.stage).toBe('NEW');

    const moved = json(
      await app.inject({
        method: 'POST',
        url: `/api/opportunities/${opportunity.id}/move`,
        headers: auth(tokens.sales!),
        payload: { stage: 'WON', position: 0 },
      }),
    );
    expect(moved.stage).toBe('WON');
    expect(moved.closedAt).toBeTruthy();
  });

  it('builds a timeline from every record touching the customer', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/activities',
      headers: auth(tokens.sales!),
      payload: { type: 'CALL', subject: 'Called about the banner', companyId: fixtures.company.id },
    });
    await app.inject({
      method: 'POST',
      url: '/api/jobs',
      headers: auth(tokens.sales!),
      payload: { title: 'Timeline job', companyId: fixtures.company.id },
    });

    const timeline = json(
      await app.inject({
        method: 'GET',
        url: `/api/companies/${fixtures.company.id}/timeline`,
        headers: auth(tokens.sales!),
      }),
    );
    const kinds = timeline.map((entry: { kind: string }) => entry.kind);
    expect(kinds).toContain('activity');
    expect(kinds).toContain('job');
  });
});

describe('production scheduling', () => {
  it('flags an overbooked resource on the board', async () => {
    const resource = json(
      await app.inject({
        method: 'POST',
        url: '/api/resources',
        headers: auth(tokens.production!),
        payload: { name: 'Test Printer', type: 'PRINTER', capacityPerDay: 1 },
      }),
    );
    const today = new Date().toISOString().slice(0, 10);

    for (const title of ['Job A', 'Job B']) {
      const job = json(
        await app.inject({
          method: 'POST',
          url: '/api/jobs',
          headers: auth(tokens.sales!),
          payload: { title, companyId: fixtures.company.id },
        }),
      );
      await app.inject({
        method: 'POST',
        url: '/api/schedule',
        headers: auth(tokens.production!),
        payload: { jobId: job.id, resourceId: resource.id, scheduledDate: today },
      });
    }

    const board = json(
      await app.inject({
        method: 'GET',
        url: `/api/schedule?start=${today}&days=1`,
        headers: auth(tokens.production!),
      }),
    );
    const day = board.board[0].days[0];
    expect(day.load).toBe(2);
    expect(day.capacity).toBe(1);
    expect(day.overbooked).toBe(true);
  });

  it('completes an install and advances a ready job to installed', async () => {
    const job = json(
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: auth(tokens.sales!),
        payload: { title: 'Install job', companyId: fixtures.company.id, installRequired: true },
      }),
    );
    for (const status of ['CLIENT_APPROVAL', 'MATERIALS_ORDERED', 'PRODUCTION', 'FINISHING', 'QC', 'READY']) {
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.production!),
        payload: { status },
      });
    }

    const install = json(
      await app.inject({
        method: 'POST',
        url: '/api/installs',
        headers: auth(tokens.sales!),
        payload: { jobId: job.id, scheduledDate: new Date().toISOString().slice(0, 10) },
      }),
    );
    // The install address defaults to the customer's address on the job.
    expect(install.street).toBe('100 Main St');

    await app.inject({
      method: 'POST',
      url: `/api/installs/${install.id}/complete`,
      headers: auth(tokens.installer!),
      payload: { completionNotes: 'Mounted and cleaned up' },
    });

    const updated = json(
      await app.inject({ method: 'GET', url: `/api/jobs/${job.id}`, headers: auth(tokens.sales!) }),
    );
    expect(updated.status).toBe('INSTALLED');
  });
});

describe('reporting', () => {
  it('reports overdue receivables in aging buckets', async () => {
    const invoice = await prisma.invoice.create({
      data: {
        number: 'INV-TEST-1',
        companyId: fixtures.company.id,
        status: 'SENT',
        issueDate: new Date(Date.now() - 60 * 86_400_000),
        dueDate: new Date(Date.now() - 45 * 86_400_000),
        subtotal: 1000,
        total: 1000,
        balance: 1000,
      },
    });
    const report = json(
      await app.inject({ method: 'GET', url: '/api/reports/receivables', headers: auth(tokens.manager!) }),
    );
    expect(report.buckets['31-60']).toBe(1000);
    expect(report.invoices[0].id).toBe(invoice.id);
    expect(report.invoices[0].daysOverdue).toBeGreaterThanOrEqual(44);
  });

  it('surfaces the stage where jobs are piling up', async () => {
    for (const title of ['Stuck A', 'Stuck B']) {
      const job = json(
        await app.inject({
          method: 'POST',
          url: '/api/jobs',
          headers: auth(tokens.sales!),
          payload: { title, companyId: fixtures.company.id },
        }),
      );
      await app.inject({
        method: 'POST',
        url: `/api/jobs/${job.id}/status`,
        headers: auth(tokens.sales!),
        payload: { status: 'CLIENT_APPROVAL' },
      });
    }
    const bottlenecks = json(
      await app.inject({ method: 'GET', url: '/api/reports/bottlenecks', headers: auth(tokens.manager!) }),
    );
    const approval = bottlenecks.find((row: { status: string }) => row.status === 'CLIENT_APPROVAL');
    expect(approval.count).toBe(2);
  });
});

describe('global search', () => {
  it('finds a job by its number', async () => {
    const job = json(
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        headers: auth(tokens.sales!),
        payload: { title: 'Searchable job', companyId: fixtures.company.id },
      }),
    );
    const results = json(
      await app.inject({
        method: 'GET',
        url: `/api/search?q=${job.jobNumber}`,
        headers: auth(tokens.sales!),
      }),
    );
    expect(results.hits.some((hit: { id: string }) => hit.id === job.id)).toBe(true);
  });
});
