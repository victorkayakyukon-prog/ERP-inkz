/**
 * Seeds a shop that looks like it has been running for a few months: staff,
 * customers at every pipeline stage, a material catalog, and jobs spread
 * across the production board so every screen has something to show.
 */
import { PrismaClient, Prisma, JobStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { priceLine, totalQuote } from '../src/modules/quotes/pricing.js';
import { defaultChecklist } from '../src/modules/jobs/service.js';

const prisma = new PrismaClient();

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);
const daysAhead = (n: number) => new Date(Date.now() + n * day);
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const pick = <T>(list: T[], index: number): T => list[index % list.length]!;

async function main() {
  console.log('Clearing existing data…');
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.purchaseOrderItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.proof.deleteMany(),
    prisma.fileAsset.deleteMany(),
    prisma.jobComment.deleteMany(),
    prisma.jobChecklistItem.deleteMany(),
    prisma.jobStatusEvent.deleteMany(),
    prisma.scheduleEntry.deleteMany(),
    prisma.install.deleteMany(),
    prisma.jobItem.deleteMany(),
    prisma.job.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.task.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.opportunity.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.company.deleteMany(),
    prisma.material.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.installCrewMember.deleteMany(),
    prisma.resource.deleteMany(),
    prisma.counter.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const settings = await prisma.setting.create({
    data: {
      id: 1,
      shopName: 'Inkz Sign & Graphics',
      shopEmail: 'orders@inkzsigns.test',
      shopPhone: '(512) 555-0180',
      shopStreet: '4120 Commerce Park Dr',
      shopCity: 'Austin',
      shopState: 'TX',
      shopZip: '78744',
      defaultTaxRatePct: 8.25,
      taxJurisdiction: 'Austin, TX',
    },
  });

  // --- users ---------------------------------------------------------------
  const password = await bcrypt.hash('password123', 10);
  const [admin, manager, sales, sales2, production, production2, installer, installer2] =
    await Promise.all(
      [
        { email: 'admin@inkzsigns.test', name: 'Dana Reyes', role: 'ADMIN' as const, phone: '(512) 555-0101' },
        { email: 'owner@inkzsigns.test', name: 'Marcus Webb', role: 'MANAGER' as const, phone: '(512) 555-0102' },
        { email: 'sales@inkzsigns.test', name: 'Priya Nair', role: 'SALES' as const, phone: '(512) 555-0103' },
        { email: 'sales2@inkzsigns.test', name: 'Tom Vasquez', role: 'SALES' as const, phone: '(512) 555-0104' },
        { email: 'shop@inkzsigns.test', name: 'Angela Cho', role: 'PRODUCTION' as const, phone: '(512) 555-0105' },
        { email: 'shop2@inkzsigns.test', name: 'Derek Mills', role: 'PRODUCTION' as const, phone: '(512) 555-0106' },
        { email: 'install@inkzsigns.test', name: 'Luis Herrera', role: 'INSTALLER' as const, phone: '(512) 555-0107' },
        { email: 'install2@inkzsigns.test', name: 'Sam Okoye', role: 'INSTALLER' as const, phone: '(512) 555-0108' },
      ].map((user) => prisma.user.create({ data: { ...user, passwordHash: password } })),
    );

  // --- production resources -----------------------------------------------
  const [printer, printer2, router, laminator, bench, crewA, crewB] = await Promise.all(
    [
      { name: 'HP Latex 570', type: 'PRINTER' as const, color: '#2563eb', capacityPerDay: 4, sortOrder: 0 },
      { name: 'Roland TrueVIS', type: 'PRINTER' as const, color: '#7c3aed', capacityPerDay: 3, sortOrder: 1 },
      { name: 'MultiCam CNC Router', type: 'ROUTER' as const, color: '#ea580c', capacityPerDay: 3, sortOrder: 2 },
      { name: 'Seal 62 Laminator', type: 'LAMINATOR' as const, color: '#0891b2', capacityPerDay: 5, sortOrder: 3 },
      { name: 'Assembly Bench', type: 'BENCH' as const, color: '#65a30d', capacityPerDay: 6, sortOrder: 4 },
      { name: 'Install Crew A', type: 'INSTALL_CREW' as const, color: '#dc2626', capacityPerDay: 2, sortOrder: 5 },
      { name: 'Install Crew B', type: 'INSTALL_CREW' as const, color: '#db2777', capacityPerDay: 2, sortOrder: 6 },
    ].map((resource) => prisma.resource.create({ data: resource })),
  );

  await prisma.installCrewMember.createMany({
    data: [
      { resourceId: crewA.id, userId: installer.id },
      { resourceId: crewA.id, userId: production.id },
      { resourceId: crewB.id, userId: installer2.id },
    ],
  });

  // --- vendors & materials -------------------------------------------------
  const [grimco, fellers, laird, gemini] = await Promise.all(
    [
      { name: 'Grimco', contactName: 'Wholesale Desk', email: 'orders@grimco.test', phone: '(800) 555-0140', city: 'Austin', state: 'TX' },
      { name: 'Fellers', contactName: 'Rita Dunn', email: 'rita@fellers.test', phone: '(800) 555-0141', city: 'San Antonio', state: 'TX' },
      { name: 'Laird Plastics', contactName: 'Counter Sales', email: 'sales@laird.test', phone: '(800) 555-0142', city: 'Austin', state: 'TX' },
      { name: 'Gemini Letters', contactName: 'Custom Orders', email: 'custom@gemini.test', phone: '(800) 555-0143', city: 'Cannon Falls', state: 'MN' },
    ].map((vendor) => prisma.vendor.create({ data: vendor })),
  );

  const materialSpecs = [
    { sku: 'ACM-3MM-4X8', name: 'ACM Dibond 3mm White 48x96', category: 'SUBSTRATE' as const, unit: 'SHEET' as const, unitCost: 68, pricePerSqFt: 11.5, sheetWidthIn: 48, sheetHeightIn: 96, stockQty: 24, reorderPoint: 8, reorderQty: 20, vendorId: laird.id },
    { sku: 'PVC-6MM-4X8', name: 'PVC Sintra 6mm White 48x96', category: 'SUBSTRATE' as const, unit: 'SHEET' as const, unitCost: 52, pricePerSqFt: 9.75, sheetWidthIn: 48, sheetHeightIn: 96, stockQty: 6, reorderPoint: 10, reorderQty: 24, vendorId: laird.id },
    { sku: 'ALU-063-4X10', name: 'Aluminum .063 48x120', category: 'SUBSTRATE' as const, unit: 'SHEET' as const, unitCost: 96, pricePerSqFt: 14.25, sheetWidthIn: 48, sheetHeightIn: 120, stockQty: 11, reorderPoint: 4, reorderQty: 10, vendorId: laird.id },
    { sku: 'COR-4MM-4X8', name: 'Coroplast 4mm White 48x96', category: 'SUBSTRATE' as const, unit: 'SHEET' as const, unitCost: 14, pricePerSqFt: 4.5, sheetWidthIn: 48, sheetHeightIn: 96, stockQty: 88, reorderPoint: 30, reorderQty: 100, vendorId: grimco.id },
    { sku: 'ACR-118-CLR', name: 'Acrylic 1/8" Clear 48x96', category: 'SUBSTRATE' as const, unit: 'SHEET' as const, unitCost: 118, pricePerSqFt: 18.5, sheetWidthIn: 48, sheetHeightIn: 96, stockQty: 5, reorderPoint: 3, reorderQty: 8, vendorId: laird.id },
    { sku: 'VIN-IJ180-54', name: '3M IJ180Cv3 Wrap Vinyl 54" x 25yd', category: 'VINYL' as const, unit: 'ROLL' as const, unitCost: 445, pricePerSqFt: 6.75, sheetWidthIn: 54, sheetHeightIn: 900, stockQty: 3, reorderPoint: 2, reorderQty: 4, vendorId: fellers.id },
    { sku: 'VIN-IJ35-54', name: '3M IJ35C Calendered Vinyl 54" x 50yd', category: 'VINYL' as const, unit: 'ROLL' as const, unitCost: 268, pricePerSqFt: 3.25, sheetWidthIn: 54, sheetHeightIn: 1800, stockQty: 4, reorderPoint: 2, reorderQty: 6, vendorId: fellers.id },
    { sku: 'VIN-CUT-651-24', name: 'Oracal 651 Cut Vinyl 24" x 50yd', category: 'VINYL' as const, unit: 'ROLL' as const, unitCost: 92, pricePerSqFt: 2.85, sheetWidthIn: 24, sheetHeightIn: 1800, stockQty: 9, reorderPoint: 4, reorderQty: 10, vendorId: grimco.id },
    { sku: 'BAN-13OZ-54', name: '13oz Scrim Banner 54" x 164ft', category: 'SUBSTRATE' as const, unit: 'ROLL' as const, unitCost: 138, pricePerSqFt: 5.5, sheetWidthIn: 54, sheetHeightIn: 1968, stockQty: 5, reorderPoint: 2, reorderQty: 6, vendorId: grimco.id },
    { sku: 'LAM-8518-54', name: '3M 8518 Gloss Overlaminate 54"', category: 'LAMINATE' as const, unit: 'ROLL' as const, unitCost: 312, pricePerSqFt: 2.15, sheetWidthIn: 54, sheetHeightIn: 900, stockQty: 2, reorderPoint: 2, reorderQty: 4, vendorId: fellers.id },
    { sku: 'INK-LX-BLK', name: 'HP Latex 831 Ink Black 775ml', category: 'INK' as const, unit: 'EACH' as const, unitCost: 158, stockQty: 4, reorderPoint: 2, reorderQty: 6, vendorId: grimco.id },
    { sku: 'INK-LX-CYN', name: 'HP Latex 831 Ink Cyan 775ml', category: 'INK' as const, unit: 'EACH' as const, unitCost: 158, stockQty: 1, reorderPoint: 2, reorderQty: 6, vendorId: grimco.id },
    { sku: 'HW-STAKE-H', name: 'H-Stakes 10" x 30" (bundle of 100)', category: 'HARDWARE' as const, unit: 'EACH' as const, unitCost: 38, stockQty: 12, reorderPoint: 4, reorderQty: 10, vendorId: grimco.id },
    { sku: 'HW-STANDOFF-1', name: 'Standoff Barrel 1" Brushed Steel', category: 'HARDWARE' as const, unit: 'EACH' as const, unitCost: 4.25, stockQty: 140, reorderPoint: 60, reorderQty: 200, vendorId: grimco.id },
    { sku: 'HW-GROMMET-38', name: '3/8" Self-Piercing Grommets (box 1000)', category: 'HARDWARE' as const, unit: 'EACH' as const, unitCost: 42, stockQty: 3, reorderPoint: 2, reorderQty: 5, vendorId: grimco.id },
    { sku: 'CL-RGB-12', name: 'Channel Letter Kit 12" Face + LED', category: 'ELECTRICAL' as const, unit: 'EACH' as const, unitCost: 92, pricePerSqFt: 0, minimumCharge: 250, stockQty: 18, reorderPoint: 6, reorderQty: 24, vendorId: gemini.id },
    { sku: 'ADA-PLQ-KIT', name: 'ADA Photopolymer Plaque Blank 6x8', category: 'SUBSTRATE' as const, unit: 'EACH' as const, unitCost: 11.5, pricePerSqFt: 0, minimumCharge: 65, stockQty: 46, reorderPoint: 20, reorderQty: 50, vendorId: gemini.id },
    { sku: 'PNT-MATTHEWS-BK', name: 'Matthews Acrylic Polyurethane Black', category: 'PAINT' as const, unit: 'GALLON' as const, unitCost: 168, stockQty: 2, reorderPoint: 1, reorderQty: 3, vendorId: laird.id },
  ];

  const materials = await Promise.all(
    materialSpecs.map((spec) => prisma.material.create({ data: spec })),
  );
  const bySku = Object.fromEntries(materials.map((m) => [m.sku, m]));

  // Opening stock movements, so the ledger is not empty on day one.
  await prisma.stockMovement.createMany({
    data: materials.map((material) => ({
      materialId: material.id,
      type: 'ADJUSTMENT' as const,
      quantity: material.stockQty,
      balanceAfter: material.stockQty,
      unitCost: material.unitCost,
      userId: production.id,
      note: 'Opening inventory count',
      createdAt: daysAgo(90),
    })),
  });

  // --- customers -----------------------------------------------------------
  const companySpecs = [
    { name: 'Lone Star Brewing Co.', industry: 'Food & Beverage', tags: ['repeat', 'wraps'], phone: '(512) 555-0210', email: 'ops@lonestarbrew.test', billingStreet: '900 E 6th St', billingCity: 'Austin', billingState: 'TX', billingZip: '78702', ownerId: sales.id },
    { name: 'Hill Country Dental', industry: 'Healthcare', tags: ['ada', 'monument'], phone: '(512) 555-0211', email: 'office@hcdental.test', billingStreet: '2200 Bee Cave Rd', billingCity: 'Austin', billingState: 'TX', billingZip: '78746', ownerId: sales.id },
    { name: 'Redline Auto Group', industry: 'Automotive', tags: ['fleet', 'wraps'], phone: '(512) 555-0212', email: 'fleet@redlineauto.test', billingStreet: '5501 N Lamar Blvd', billingCity: 'Austin', billingState: 'TX', billingZip: '78751', ownerId: sales2.id },
    { name: 'Barton Creek Realty', industry: 'Real Estate', tags: ['yard signs', 'repeat'], phone: '(512) 555-0213', email: 'marketing@bcrealty.test', billingStreet: '3300 Bee Cave Rd', billingCity: 'Austin', billingState: 'TX', billingZip: '78746', ownerId: sales2.id },
    { name: 'Franklin Barbecue Supply', industry: 'Retail', tags: ['storefront'], phone: '(512) 555-0214', email: 'hello@franklinsupply.test', billingStreet: '900 E 11th St', billingCity: 'Austin', billingState: 'TX', billingZip: '78702', ownerId: sales.id },
    { name: 'Capitol Fitness', industry: 'Fitness', tags: ['window graphics'], phone: '(512) 555-0215', email: 'gm@capitolfitness.test', billingStreet: '1100 Congress Ave', billingCity: 'Austin', billingState: 'TX', billingZip: '78701', ownerId: sales.id },
    { name: 'Travis County ISD', industry: 'Education', tags: ['ada', 'wayfinding'], phone: '(512) 555-0216', email: 'facilities@tcisd.test', billingStreet: '1111 W 6th St', billingCity: 'Austin', billingState: 'TX', billingZip: '78703', ownerId: sales2.id, taxExempt: true },
    { name: 'Zilker Landscaping', industry: 'Services', tags: ['fleet'], phone: '(512) 555-0217', email: 'info@zilkerland.test', billingStreet: '4400 S Congress Ave', billingCity: 'Austin', billingState: 'TX', billingZip: '78745', ownerId: sales.id },
    { name: 'Third Coast Coffee', industry: 'Food & Beverage', tags: ['storefront', 'repeat'], phone: '(512) 555-0218', email: 'roasters@thirdcoast.test', billingStreet: '4600 Elmont Dr', billingCity: 'Austin', billingState: 'TX', billingZip: '78741', ownerId: sales.id },
    { name: 'Pecan Grove Apartments', industry: 'Property Management', tags: ['monument', 'wayfinding'], phone: '(512) 555-0219', email: 'manager@pecangrove.test', billingStreet: '1200 Barton Springs Rd', billingCity: 'Austin', billingState: 'TX', billingZip: '78704', ownerId: sales2.id },
  ];
  const companies = await Promise.all(
    companySpecs.map((company) => prisma.company.create({ data: company })),
  );

  const contactSpecs = [
    ['Jesse', 'Ramirez', 'Operations Manager', 'jesse@lonestarbrew.test'],
    ['Dr. Anita', 'Shah', 'Practice Owner', 'anita@hcdental.test'],
    ['Bo', 'Callahan', 'Fleet Coordinator', 'bo@redlineauto.test'],
    ['Megan', 'Ford', 'Marketing Director', 'megan@bcrealty.test'],
    ['Wes', 'Trent', 'Store Manager', 'wes@franklinsupply.test'],
    ['Nikki', 'Barnes', 'General Manager', 'nikki@capitolfitness.test'],
    ['Roland', 'Petty', 'Facilities Director', 'roland@tcisd.test'],
    ['Carla', 'Diaz', 'Owner', 'carla@zilkerland.test'],
    ['Owen', 'Pratt', 'Head Roaster', 'owen@thirdcoast.test'],
    ['Sylvia', 'Nguyen', 'Property Manager', 'sylvia@pecangrove.test'],
  ];
  const contacts = await Promise.all(
    contactSpecs.map(([firstName, lastName, title, email], index) =>
      prisma.contact.create({
        data: {
          companyId: companies[index]!.id,
          firstName: firstName!,
          lastName: lastName!,
          title,
          email,
          phone: `(512) 555-0${300 + index}`,
          mobile: `(512) 555-0${400 + index}`,
          isPrimary: true,
        },
      }),
    ),
  );
  // A couple of companies have a second contact.
  await prisma.contact.createMany({
    data: [
      { companyId: companies[0]!.id, firstName: 'Dana', lastName: 'Wolfe', title: 'Taproom Lead', email: 'dana@lonestarbrew.test', phone: '(512) 555-0320' },
      { companyId: companies[2]!.id, firstName: 'Ray', lastName: 'Osei', title: 'Service Director', email: 'ray@redlineauto.test', phone: '(512) 555-0321' },
      { companyId: companies[6]!.id, firstName: 'Beth', lastName: 'Alvarez', title: 'Purchasing', email: 'beth@tcisd.test', phone: '(512) 555-0322' },
    ],
  });

  // --- pipeline ------------------------------------------------------------
  const opportunitySpecs = [
    { title: 'Taproom patio banner set', companyIndex: 0, stage: 'QUOTED' as const, estimatedValue: 1850, source: 'Repeat customer', ownerId: sales.id, expectedCloseDate: daysAhead(9) },
    { title: 'Monument sign refresh', companyIndex: 1, stage: 'QUOTED' as const, estimatedValue: 12400, source: 'Referral', ownerId: sales.id, expectedCloseDate: daysAhead(21) },
    { title: 'Fleet wrap — 6 service vans', companyIndex: 2, stage: 'CONTACTED' as const, estimatedValue: 21600, source: 'Cold call', ownerId: sales2.id, expectedCloseDate: daysAhead(30) },
    { title: 'Spring listing yard signs (250)', companyIndex: 3, stage: 'WON' as const, estimatedValue: 3400, source: 'Repeat customer', ownerId: sales2.id, closedAt: daysAgo(20) },
    { title: 'Storefront channel letters', companyIndex: 4, stage: 'NEW' as const, estimatedValue: 9800, source: 'Website form', ownerId: sales.id, expectedCloseDate: daysAhead(45) },
    { title: 'Window graphics — 3 locations', companyIndex: 5, stage: 'QUOTED' as const, estimatedValue: 4750, source: 'Walk-in', ownerId: sales.id, expectedCloseDate: daysAhead(14) },
    { title: 'ADA restroom + wayfinding package', companyIndex: 6, stage: 'WON' as const, estimatedValue: 7200, source: 'Bid board', ownerId: sales2.id, closedAt: daysAgo(35) },
    { title: 'Truck door decals (8 units)', companyIndex: 7, stage: 'NEW' as const, estimatedValue: 1600, source: 'Referral', ownerId: sales.id, expectedCloseDate: daysAhead(18) },
    { title: 'Roastery hanging blade sign', companyIndex: 8, stage: 'CONTACTED' as const, estimatedValue: 5200, source: 'Instagram', ownerId: sales.id, expectedCloseDate: daysAhead(25) },
    { title: 'Leasing office monument', companyIndex: 9, stage: 'LOST' as const, estimatedValue: 14500, source: 'Bid board', ownerId: sales2.id, closedAt: daysAgo(12), lostReason: 'Lost on price to a national vendor' },
    { title: 'Trade show booth graphics', companyIndex: 0, stage: 'NEW' as const, estimatedValue: 6300, source: 'Repeat customer', ownerId: sales.id, expectedCloseDate: daysAhead(38) },
    { title: 'Parking lot directional signs', companyIndex: 9, stage: 'CONTACTED' as const, estimatedValue: 2900, source: 'Repeat customer', ownerId: sales2.id, expectedCloseDate: daysAhead(16) },
  ];

  const opportunities: Awaited<ReturnType<typeof prisma.opportunity.create>>[] = [];
  const stageCounters: Record<string, number> = {};
  for (const spec of opportunitySpecs) {
    stageCounters[spec.stage] = (stageCounters[spec.stage] ?? 0) + 1;
    opportunities.push(
      await prisma.opportunity.create({
        data: {
          title: spec.title,
          companyId: companies[spec.companyIndex]!.id,
          contactId: contacts[spec.companyIndex]!.id,
          ownerId: spec.ownerId,
          stage: spec.stage,
          estimatedValue: spec.estimatedValue,
          source: spec.source,
          expectedCloseDate: spec.expectedCloseDate ?? null,
          closedAt: spec.closedAt ?? null,
          lostReason: spec.lostReason ?? null,
          position: stageCounters[spec.stage]!,
          createdAt: daysAgo(60 - spec.companyIndex * 3),
        },
      }),
    );
  }

  // --- activity log & tasks ------------------------------------------------
  const activityTypes = ['CALL', 'EMAIL', 'MEETING', 'SITE_VISIT', 'NOTE'] as const;
  const activitySubjects = [
    'Left voicemail about proof timing',
    'Emailed updated quote',
    'Site visit — measured wall for letters',
    'Discussed permit requirements with city',
    'Customer asked about rush turnaround',
    'Confirmed color match to brand guide',
    'Walked the parking lot for sign placement',
    'Follow-up on outstanding balance',
  ];
  await prisma.activity.createMany({
    data: Array.from({ length: 36 }, (_, index) => ({
      type: pick([...activityTypes], index),
      subject: pick(activitySubjects, index),
      body: index % 3 === 0 ? 'Customer is comparing two substrate options and will decide this week.' : null,
      occurredAt: daysAgo(index * 2 + 1),
      userId: pick([sales.id, sales2.id, manager.id], index),
      companyId: companies[index % companies.length]!.id,
      contactId: contacts[index % contacts.length]!.id,
      opportunityId: index % 2 === 0 ? opportunities[index % opportunities.length]!.id : null,
    })),
  });

  await prisma.task.createMany({
    data: [
      { title: 'Send revised monument quote to Dr. Shah', dueAt: daysAhead(1), assigneeId: sales.id, createdById: manager.id, companyId: companies[1]!.id, opportunityId: opportunities[1]!.id },
      { title: 'Chase permit drawings for Franklin storefront', dueAt: daysAhead(3), assigneeId: sales.id, createdById: sales.id, companyId: companies[4]!.id },
      { title: 'Follow up on fleet wrap decision', dueAt: daysAgo(2), assigneeId: sales2.id, createdById: sales2.id, companyId: companies[2]!.id, opportunityId: opportunities[2]!.id },
      { title: 'Collect deposit for window graphics', dueAt: daysAhead(5), assigneeId: sales.id, createdById: manager.id, companyId: companies[5]!.id },
      { title: 'Schedule site survey at Pecan Grove', dueAt: daysAgo(1), assigneeId: sales2.id, createdById: sales2.id, companyId: companies[9]!.id },
      { title: 'Order replacement cyan ink', dueAt: daysAhead(2), assigneeId: production.id, createdById: production.id },
      { title: 'Call Third Coast about blade sign engineering', dueAt: daysAhead(7), assigneeId: sales.id, createdById: sales.id, companyId: companies[8]!.id },
    ],
  });

  // --- quotes --------------------------------------------------------------
  const pricingDefaults = {
    laminateCostPerSqFt: settings.laminateCostPerSqFt,
    mountingCostPerSqFt: settings.mountingCostPerSqFt,
    contourCutFee: settings.contourCutFee,
    grommetFee: settings.grommetFee,
    hemFeePerLinearFt: settings.hemFeePerLinearFt,
  };

  let quoteCounter = 0;
  const makeQuote = async (spec: {
    title: string;
    companyIndex: number;
    opportunityIndex?: number;
    status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
    createdById: string;
    rushFeePct?: number;
    discountPct?: number;
    createdAt: Date;
    items: Array<{
      signType: Prisma.QuoteItemCreateManyQuoteInput['signType'];
      description: string;
      widthIn: number;
      heightIn: number;
      quantity: number;
      sku?: string;
      laminate?: boolean;
      mounting?: boolean;
      contourCut?: boolean;
      grommets?: boolean;
      hemmed?: boolean;
      laborHours?: number;
      installRequired?: boolean;
      installHours?: number;
      pricePerSqFt?: number;
      minimumCharge?: number;
    }>;
  }) => {
    quoteCounter += 1;
    const company = companies[spec.companyIndex]!;
    const taxRatePct = company.taxExempt ? 0 : Number(settings.defaultTaxRatePct);

    const lines = spec.items.map((item) => {
      const material = item.sku ? bySku[item.sku] : undefined;
      const sheetSqFt =
        material?.sheetWidthIn && material?.sheetHeightIn
          ? Number(material.sheetWidthIn) * Number(material.sheetHeightIn) / 144
          : 0;
      const materialCostPerSqFt =
        material && sheetSqFt > 0 ? Number(material.unitCost) / sheetSqFt : material ? Number(material.unitCost) : 0;
      return {
        input: {
          widthIn: item.widthIn,
          heightIn: item.heightIn,
          quantity: item.quantity,
          pricePerSqFt: item.pricePerSqFt ?? Number(material?.pricePerSqFt ?? 0),
          materialCostPerSqFt,
          minimumCharge: item.minimumCharge ?? Number(material?.minimumCharge ?? settings.defaultMinimumCharge),
          laminate: item.laminate ?? false,
          mounting: item.mounting ?? false,
          contourCut: item.contourCut ?? false,
          grommets: item.grommets ?? false,
          hemmed: item.hemmed ?? false,
          laborHours: item.laborHours ?? 0,
          laborRate: Number(settings.laborRate),
          markupPct: Number(settings.defaultMarkupPct),
          installRequired: item.installRequired ?? false,
          installHours: item.installHours ?? 0,
          installRate: Number(settings.installRate),
        },
        item,
        materialId: material?.id ?? null,
      };
    });

    const priced = lines.map((line) => priceLine(line.input, pricingDefaults));
    const totals = totalQuote(priced, {
      discountPct: spec.discountPct ?? 0,
      rushFeePct: spec.rushFeePct ?? 0,
      taxRatePct,
    });

    return prisma.quote.create({
      data: {
        number: `Q-2026-${String(quoteCounter).padStart(4, '0')}`,
        title: spec.title,
        status: spec.status,
        companyId: company.id,
        contactId: contacts[spec.companyIndex]!.id,
        opportunityId:
          spec.opportunityIndex !== undefined ? opportunities[spec.opportunityIndex]!.id : null,
        createdById: spec.createdById,
        discountPct: spec.discountPct ?? 0,
        rushFeePct: spec.rushFeePct ?? 0,
        taxRatePct,
        subtotal: totals.subtotal,
        discount: totals.discount,
        rushFee: totals.rushFee,
        taxAmount: totals.taxAmount,
        total: totals.total,
        materialCost: totals.materialCost,
        terms: settings.paymentTerms,
        validUntil: new Date(spec.createdAt.getTime() + settings.quoteValidDays * day),
        sentAt: spec.status === 'DRAFT' ? null : spec.createdAt,
        decidedAt: spec.status === 'ACCEPTED' || spec.status === 'REJECTED' ? daysAgo(2) : null,
        signedName: spec.status === 'ACCEPTED' ? contacts[spec.companyIndex]!.firstName + ' ' + contacts[spec.companyIndex]!.lastName : null,
        createdAt: spec.createdAt,
        items: {
          create: lines.map((line, index) => ({
            sortOrder: index,
            signType: line.item.signType,
            description: line.item.description,
            widthIn: line.item.widthIn,
            heightIn: line.item.heightIn,
            quantity: line.item.quantity,
            materialId: line.materialId,
            pricePerSqFt: line.input.pricePerSqFt,
            materialCostPerSqFt: line.input.materialCostPerSqFt,
            minimumCharge: line.input.minimumCharge,
            laminate: line.input.laminate,
            mounting: line.input.mounting,
            contourCut: line.input.contourCut,
            grommets: line.input.grommets,
            hemmed: line.input.hemmed,
            laborHours: line.input.laborHours,
            laborRate: line.input.laborRate,
            markupPct: line.input.markupPct,
            installRequired: line.input.installRequired,
            installHours: line.input.installHours,
            installRate: line.input.installRate,
            areaSqFt: priced[index]!.areaSqFt,
            materialCost: priced[index]!.materialCost,
            lineTotal: priced[index]!.lineTotal,
          })),
        },
      },
      include: { items: true },
    });
  };

  const quoteTaproom = await makeQuote({
    title: 'Taproom patio banner set', companyIndex: 0, opportunityIndex: 0, status: 'SENT',
    createdById: sales.id, createdAt: daysAgo(6),
    items: [
      { signType: 'BANNER', description: '3x8 vinyl banner — "Live Music Fridays"', widthIn: 96, heightIn: 36, quantity: 2, sku: 'BAN-13OZ-54', hemmed: true, grommets: true, laborHours: 0.5 },
      { signType: 'BANNER', description: '2x6 patio hours banner', widthIn: 72, heightIn: 24, quantity: 1, sku: 'BAN-13OZ-54', hemmed: true, grommets: true, laborHours: 0.25 },
    ],
  });

  const quoteMonument = await makeQuote({
    title: 'Monument sign refresh — faces and cabinet', companyIndex: 1, opportunityIndex: 1, status: 'SENT',
    createdById: sales.id, createdAt: daysAgo(9),
    items: [
      { signType: 'MONUMENT', description: 'Aluminum monument face 8x4 with routed logo', widthIn: 96, heightIn: 48, quantity: 2, sku: 'ALU-063-4X10', laborHours: 9, installRequired: true, installHours: 6 },
      { signType: 'DIMENSIONAL_LETTERS', description: '12" acrylic dimensional letters, 18 characters', widthIn: 12, heightIn: 12, quantity: 18, sku: 'ACR-118-CLR', laborHours: 6, mounting: true },
    ],
  });

  const quoteYardSigns = await makeQuote({
    title: 'Spring listing yard signs (250)', companyIndex: 3, opportunityIndex: 3, status: 'ACCEPTED',
    createdById: sales2.id, createdAt: daysAgo(28), discountPct: 5,
    items: [
      { signType: 'YARD_SIGN', description: '18x24 coroplast listing signs, 2-sided', widthIn: 24, heightIn: 18, quantity: 250, sku: 'COR-4MM-4X8', laborHours: 4 },
      { signType: 'OTHER', description: 'H-stakes, 250 count', widthIn: 0, heightIn: 0, quantity: 250, sku: 'HW-STAKE-H', pricePerSqFt: 0, minimumCharge: 220 },
    ],
  });

  const quoteAda = await makeQuote({
    title: 'ADA restroom + wayfinding package', companyIndex: 6, opportunityIndex: 6, status: 'ACCEPTED',
    createdById: sales2.id, createdAt: daysAgo(40),
    items: [
      { signType: 'ADA', description: 'ADA restroom signs with braille, 6x8', widthIn: 8, heightIn: 6, quantity: 24, sku: 'ADA-PLQ-KIT', pricePerSqFt: 0, minimumCharge: 68, laborHours: 0.2 },
      { signType: 'WAYFINDING', description: 'Interior directional panels 12x36 on ACM', widthIn: 36, heightIn: 12, quantity: 14, sku: 'ACM-3MM-4X8', laborHours: 3, mounting: true, installRequired: true, installHours: 5 },
    ],
  });

  const quoteWindows = await makeQuote({
    title: 'Window graphics — 3 locations', companyIndex: 5, opportunityIndex: 5, status: 'SENT',
    createdById: sales.id, createdAt: daysAgo(4), rushFeePct: 25,
    items: [
      { signType: 'WINDOW_GRAPHIC', description: 'Frosted privacy band, 120" x 24" per location', widthIn: 120, heightIn: 24, quantity: 3, sku: 'VIN-IJ35-54', laborHours: 1.5, installRequired: true, installHours: 2 },
      { signType: 'DECAL', description: 'Cut vinyl hours + logo on entry door', widthIn: 24, heightIn: 18, quantity: 3, sku: 'VIN-CUT-651-24', contourCut: true, laborHours: 0.75, installRequired: true, installHours: 0.5 },
    ],
  });

  const quoteWrap = await makeQuote({
    title: 'Fleet wrap — 6 service vans', companyIndex: 2, opportunityIndex: 2, status: 'DRAFT',
    createdById: sales2.id, createdAt: daysAgo(2),
    items: [
      { signType: 'VEHICLE_WRAP', description: 'Full wrap, Transit 250 mid-roof', widthIn: 240, heightIn: 84, quantity: 6, sku: 'VIN-IJ180-54', laminate: true, laborHours: 14, installRequired: true, installHours: 12 },
    ],
  });

  const quoteStorefront = await makeQuote({
    title: 'Storefront channel letters', companyIndex: 4, opportunityIndex: 4, status: 'ACCEPTED',
    createdById: sales.id, createdAt: daysAgo(22),
    items: [
      { signType: 'CHANNEL_LETTERS', description: '18" front-lit channel letters, 16 characters', widthIn: 18, heightIn: 18, quantity: 16, sku: 'CL-RGB-12', pricePerSqFt: 0, minimumCharge: 385, laborHours: 12, installRequired: true, installHours: 8 },
      { signType: 'OTHER', description: 'Raceway, transformers and permit coordination', widthIn: 0, heightIn: 0, quantity: 1, pricePerSqFt: 0, minimumCharge: 1450 },
    ],
  });

  const quoteRejected = await makeQuote({
    title: 'Leasing office monument', companyIndex: 9, opportunityIndex: 9, status: 'REJECTED',
    createdById: sales2.id, createdAt: daysAgo(30),
    items: [
      { signType: 'MONUMENT', description: 'Illuminated monument, dual face 10x6 with masonry base', widthIn: 120, heightIn: 72, quantity: 2, sku: 'ALU-063-4X10', laborHours: 22, installRequired: true, installHours: 16 },
    ],
  });
  await prisma.quote.update({
    where: { id: quoteRejected.id },
    data: { rejectedReason: 'Lost on price to a national vendor' },
  });

  const acceptedQuotes = [quoteYardSigns, quoteAda, quoteStorefront];
  console.log(`Seeded ${quoteCounter} quotes`);

  // --- jobs ----------------------------------------------------------------
  let jobCounter = 0;
  const makeJob = async (spec: {
    title: string;
    companyIndex: number;
    status: JobStatus;
    priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'RUSH';
    quote?: Awaited<ReturnType<typeof makeQuote>>;
    ownerId: string;
    dueInDays: number;
    createdDaysAgo: number;
    installRequired?: boolean;
    contractTotal?: number;
    materialCost?: number;
    items?: Array<{ signType: Prisma.JobItemCreateManyJobInput['signType']; description: string; widthIn: number; heightIn: number; quantity: number; sku?: string; lineTotal: number; materialCost: number; installRequired?: boolean }>;
  }) => {
    jobCounter += 1;
    const company = companies[spec.companyIndex]!;
    const items =
      spec.items ??
      spec.quote?.items.map((item) => ({
        signType: item.signType,
        description: item.description,
        widthIn: Number(item.widthIn),
        heightIn: Number(item.heightIn),
        quantity: item.quantity,
        materialId: item.materialId,
        areaSqFt: Number(item.areaSqFt),
        lineTotal: Number(item.lineTotal),
        materialCost: Number(item.materialCost),
        installRequired: item.installRequired,
      })) ??
      [];

    const job = await prisma.job.create({
      data: {
        jobNumber: `J-2026-${String(jobCounter).padStart(4, '0')}`,
        title: spec.title,
        status: spec.status,
        priority: spec.priority ?? 'NORMAL',
        companyId: company.id,
        contactId: contacts[spec.companyIndex]!.id,
        quoteId: spec.quote?.id ?? null,
        ownerId: spec.ownerId,
        dueDate: daysAhead(spec.dueInDays),
        createdAt: daysAgo(spec.createdDaysAgo),
        startedAt: daysAgo(Math.max(1, spec.createdDaysAgo - 2)),
        contractTotal: spec.contractTotal ?? Number(spec.quote?.total ?? 0),
        quotedMaterialCost: spec.materialCost ?? Number(spec.quote?.materialCost ?? 0),
        installRequired: spec.installRequired ?? items.some((i) => i.installRequired),
        installStreet: company.billingStreet,
        installCity: company.billingCity,
        installState: company.billingState,
        installZip: company.billingZip,
        items: {
          create: items.map((item, index) => ({
            sortOrder: index,
            signType: item.signType,
            description: item.description,
            widthIn: item.widthIn,
            heightIn: item.heightIn,
            quantity: item.quantity,
            materialId: 'materialId' in item ? (item as { materialId: string | null }).materialId : item.sku ? bySku[item.sku]!.id : null,
            areaSqFt: 'areaSqFt' in item ? (item as { areaSqFt: number }).areaSqFt : (item.widthIn * item.heightIn * item.quantity) / 144,
            lineTotal: item.lineTotal,
            materialCost: item.materialCost,
            installRequired: item.installRequired ?? false,
          })),
        },
        checklist: { create: defaultChecklist() },
      },
      include: { items: true },
    });

    // Walk the status history up to the current stage so the audit trail reads
    // like the job actually moved through the shop.
    const pipeline: JobStatus[] = [
      JobStatus.DESIGN_PROOF, JobStatus.CLIENT_APPROVAL, JobStatus.MATERIALS_ORDERED,
      JobStatus.PRODUCTION, JobStatus.FINISHING, JobStatus.QC, JobStatus.READY,
      JobStatus.INSTALLED, JobStatus.INVOICED, JobStatus.CLOSED,
    ];
    const targetIndex = pipeline.indexOf(spec.status);
    const walk = targetIndex === -1 ? [JobStatus.DESIGN_PROOF] : pipeline.slice(0, targetIndex + 1);
    let previous: JobStatus | null = null;
    for (const [index, status] of walk.entries()) {
      await prisma.jobStatusEvent.create({
        data: {
          jobId: job.id,
          fromStatus: previous,
          toStatus: status,
          userId: index < 2 ? spec.ownerId : production.id,
          createdAt: daysAgo(Math.max(0, spec.createdDaysAgo - index * 2)),
        },
      });
      previous = status;
    }
    if (targetIndex === -1) {
      await prisma.jobStatusEvent.create({
        data: { jobId: job.id, fromStatus: previous, toStatus: spec.status, userId: spec.ownerId, note: 'Waiting on customer decision' },
      });
    }

    // Tick off checklist items for stages already completed.
    const completedStages = new Set(walk.slice(0, Math.max(0, walk.length - 1)));
    await prisma.jobChecklistItem.updateMany({
      where: { jobId: job.id, stage: { in: [...completedStages] } },
      data: { done: true, completedById: production.id, completedAt: daysAgo(1) },
    });

    return job;
  };

  const jobYardSigns = await makeJob({
    title: 'Spring listing yard signs (250)', companyIndex: 3, status: JobStatus.CLOSED,
    quote: quoteYardSigns, ownerId: sales2.id, dueInDays: -12, createdDaysAgo: 26,
  });
  const jobAda = await makeJob({
    title: 'ADA restroom + wayfinding package', companyIndex: 6, status: JobStatus.INVOICED,
    quote: quoteAda, ownerId: sales2.id, dueInDays: -3, createdDaysAgo: 38, installRequired: true,
  });
  const jobStorefront = await makeJob({
    title: 'Storefront channel letters', companyIndex: 4, status: JobStatus.PRODUCTION,
    quote: quoteStorefront, ownerId: sales.id, dueInDays: 11, createdDaysAgo: 20,
    priority: 'HIGH', installRequired: true,
  });
  const jobBrewTaproom = await makeJob({
    title: 'Taproom interior wall mural', companyIndex: 0, status: JobStatus.CLIENT_APPROVAL,
    ownerId: sales.id, dueInDays: 8, createdDaysAgo: 9, contractTotal: 4280, materialCost: 640,
    items: [
      { signType: 'WINDOW_GRAPHIC', description: 'Wall mural, 144" x 96", printed wrap vinyl', widthIn: 144, heightIn: 96, quantity: 1, sku: 'VIN-IJ180-54', lineTotal: 3280, materialCost: 480 },
      { signType: 'DECAL', description: 'Cut vinyl tagline above bar', widthIn: 96, heightIn: 18, quantity: 1, sku: 'VIN-CUT-651-24', lineTotal: 1000, materialCost: 160 },
    ],
  });
  const jobRedlineDecals = await makeJob({
    title: 'Service van door decals (2 units)', companyIndex: 2, status: JobStatus.FINISHING,
    ownerId: sales2.id, dueInDays: 4, createdDaysAgo: 7, contractTotal: 1180, materialCost: 190,
    items: [
      { signType: 'DECAL', description: 'Door logo + phone, 36" x 24", contour cut', widthIn: 36, heightIn: 24, quantity: 4, sku: 'VIN-CUT-651-24', lineTotal: 1180, materialCost: 190, installRequired: true },
    ],
  });
  const jobZilker = await makeJob({
    title: 'Truck bed rail lettering (8 trucks)', companyIndex: 7, status: JobStatus.QC,
    ownerId: sales.id, dueInDays: 2, createdDaysAgo: 11, priority: 'RUSH', contractTotal: 2240, materialCost: 310,
    items: [
      { signType: 'DECAL', description: 'Cut vinyl company name + DOT numbers', widthIn: 48, heightIn: 12, quantity: 16, sku: 'VIN-CUT-651-24', lineTotal: 2240, materialCost: 310, installRequired: true },
    ],
  });
  const jobThirdCoast = await makeJob({
    title: 'Roastery A-frame + menu boards', companyIndex: 8, status: JobStatus.READY,
    ownerId: sales.id, dueInDays: 1, createdDaysAgo: 14, contractTotal: 1890, materialCost: 265,
    items: [
      { signType: 'OTHER', description: 'A-frame sidewalk sign with insert panels', widthIn: 24, heightIn: 36, quantity: 2, sku: 'ACM-3MM-4X8', lineTotal: 890, materialCost: 120 },
      { signType: 'OTHER', description: 'Interior menu boards, 24x36 ACM', widthIn: 24, heightIn: 36, quantity: 3, sku: 'ACM-3MM-4X8', lineTotal: 1000, materialCost: 145, installRequired: true },
    ],
  });
  const jobPecanWayfinding = await makeJob({
    title: 'Parking lot directional signs', companyIndex: 9, status: JobStatus.MATERIALS_ORDERED,
    ownerId: sales2.id, dueInDays: 15, createdDaysAgo: 5, contractTotal: 3120, materialCost: 520,
    items: [
      { signType: 'WAYFINDING', description: 'Post-mounted directional, 18x24 aluminum', widthIn: 18, heightIn: 24, quantity: 8, sku: 'ALU-063-4X10', lineTotal: 3120, materialCost: 520, installRequired: true },
    ],
  });
  const jobCapitolWindows = await makeJob({
    title: 'Window graphics — Congress Ave', companyIndex: 5, status: JobStatus.DESIGN_PROOF,
    ownerId: sales.id, dueInDays: 12, createdDaysAgo: 3, contractTotal: 1650, materialCost: 210,
    items: [
      { signType: 'WINDOW_GRAPHIC', description: 'Frosted privacy band 120" x 24"', widthIn: 120, heightIn: 24, quantity: 1, sku: 'VIN-IJ35-54', lineTotal: 1650, materialCost: 210, installRequired: true },
    ],
  });
  const jobHillCountry = await makeJob({
    title: 'Reception wall logo', companyIndex: 1, status: JobStatus.ON_HOLD,
    ownerId: sales.id, dueInDays: 20, createdDaysAgo: 16, contractTotal: 2450, materialCost: 380,
    items: [
      { signType: 'DIMENSIONAL_LETTERS', description: '1/2" acrylic logo + letters, brushed face', widthIn: 60, heightIn: 24, quantity: 1, sku: 'ACR-118-CLR', lineTotal: 2450, materialCost: 380, installRequired: true },
    ],
  });
  await prisma.job.update({
    where: { id: jobHillCountry.id },
    data: { onHoldReason: 'Customer is finalizing the logo redesign with their agency' },
  });

  const allJobs = [
    jobYardSigns, jobAda, jobStorefront, jobBrewTaproom, jobRedlineDecals,
    jobZilker, jobThirdCoast, jobPecanWayfinding, jobCapitolWindows, jobHillCountry,
  ];
  console.log(`Seeded ${allJobs.length} jobs`);

  // --- proofs, comments ----------------------------------------------------
  await prisma.proof.createMany({
    data: [
      { jobId: jobBrewTaproom.id, version: 1, status: 'REJECTED', sentAt: daysAgo(6), decidedAt: daysAgo(5), decidedByName: 'Jesse Ramirez', clientNote: 'Logo is too small — please scale up 20%' },
      { jobId: jobBrewTaproom.id, version: 2, status: 'PENDING', sentAt: daysAgo(2) },
      { jobId: jobStorefront.id, version: 1, status: 'APPROVED', sentAt: daysAgo(17), decidedAt: daysAgo(16), decidedByName: 'Wes Trent' },
      { jobId: jobCapitolWindows.id, version: 1, status: 'PENDING' },
      { jobId: jobThirdCoast.id, version: 1, status: 'APPROVED', sentAt: daysAgo(11), decidedAt: daysAgo(10), decidedByName: 'Owen Pratt' },
      { jobId: jobZilker.id, version: 1, status: 'APPROVED', sentAt: daysAgo(9), decidedAt: daysAgo(9), decidedByName: 'Carla Diaz' },
    ],
  });

  await prisma.jobComment.createMany({
    data: [
      { jobId: jobStorefront.id, userId: production.id, body: 'Raceway is painted and drying. Letters go on the bench tomorrow morning.' },
      { jobId: jobStorefront.id, userId: sales.id, body: 'Permit came back approved — install can be scheduled any time after the 12th.' },
      { jobId: jobZilker.id, userId: production2.id, body: 'Weeded all 16 sets. Two need a reprint, the cut line drifted on the second panel.' },
      { jobId: jobThirdCoast.id, userId: production.id, body: 'Menu boards are packed and labeled. A-frames are in the rack by the door.' },
      { jobId: jobBrewTaproom.id, userId: sales.id, body: 'Customer wants to see the mural mocked up on a photo of the actual wall.' },
      { jobId: jobRedlineDecals.id, userId: production.id, body: 'Laminated and ready for the mask. Install is on the books for Thursday.' },
    ],
  });

  // --- production schedule -------------------------------------------------
  const scheduleSpecs = [
    { jobId: jobStorefront.id, resourceId: router.id, stage: JobStatus.PRODUCTION, dayOffset: 0, durationHours: 6 },
    { jobId: jobStorefront.id, resourceId: bench.id, stage: JobStatus.FINISHING, dayOffset: 1, durationHours: 8 },
    { jobId: jobRedlineDecals.id, resourceId: printer.id, stage: JobStatus.PRODUCTION, dayOffset: 0, durationHours: 2 },
    { jobId: jobRedlineDecals.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 1, durationHours: 1.5 },
    { jobId: jobZilker.id, resourceId: printer2.id, stage: JobStatus.PRODUCTION, dayOffset: 0, durationHours: 3 },
    { jobId: jobZilker.id, resourceId: bench.id, stage: JobStatus.QC, dayOffset: 1, durationHours: 2 },
    { jobId: jobThirdCoast.id, resourceId: router.id, stage: JobStatus.PRODUCTION, dayOffset: -1, durationHours: 4 },
    { jobId: jobCapitolWindows.id, resourceId: printer.id, stage: JobStatus.PRODUCTION, dayOffset: 3, durationHours: 2 },
    { jobId: jobPecanWayfinding.id, resourceId: router.id, stage: JobStatus.PRODUCTION, dayOffset: 4, durationHours: 5 },
    { jobId: jobPecanWayfinding.id, resourceId: printer.id, stage: JobStatus.PRODUCTION, dayOffset: 4, durationHours: 2 },
    // Deliberately stack the laminator to demonstrate the overbooked flag.
    { jobId: jobStorefront.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 3 },
    { jobId: jobCapitolWindows.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 2 },
    { jobId: jobThirdCoast.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 2 },
    { jobId: jobZilker.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 1 },
    { jobId: jobRedlineDecals.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 1 },
    { jobId: jobPecanWayfinding.id, resourceId: laminator.id, stage: JobStatus.FINISHING, dayOffset: 2, durationHours: 1 },
  ];
  await prisma.scheduleEntry.createMany({
    data: scheduleSpecs.map((spec, index) => ({
      jobId: spec.jobId,
      resourceId: spec.resourceId,
      stage: spec.stage,
      scheduledDate: dateOnly(daysAhead(spec.dayOffset)),
      durationHours: spec.durationHours,
      sortOrder: index,
    })),
  });

  // --- installs ------------------------------------------------------------
  await prisma.install.createMany({
    data: [
      {
        jobId: jobThirdCoast.id, crewId: crewA.id, status: 'SCHEDULED',
        scheduledDate: dateOnly(daysAhead(0)), windowStart: '08:00', windowEnd: '10:00',
        street: '4600 Elmont Dr', city: 'Austin', state: 'TX', zip: '78741',
        contactName: 'Owen Pratt', contactPhone: '(512) 555-0308',
        notes: 'Park in the alley behind the roastery. Menu boards mount with standoffs.',
        sortOrder: 0,
      },
      {
        jobId: jobRedlineDecals.id, crewId: crewA.id, status: 'SCHEDULED',
        scheduledDate: dateOnly(daysAhead(0)), windowStart: '13:00', windowEnd: '15:00',
        street: '5501 N Lamar Blvd', city: 'Austin', state: 'TX', zip: '78751',
        contactName: 'Bo Callahan', contactPhone: '(512) 555-0302',
        notes: 'Vans will be staged in the back lot. Ask for Bo at the service desk.',
        sortOrder: 1,
      },
      {
        jobId: jobZilker.id, crewId: crewB.id, status: 'SCHEDULED',
        scheduledDate: dateOnly(daysAhead(1)), windowStart: '07:30', windowEnd: '11:30',
        street: '4400 S Congress Ave', city: 'Austin', state: 'TX', zip: '78745',
        contactName: 'Carla Diaz', contactPhone: '(512) 555-0307',
        notes: 'All 8 trucks on site before 8am. Bring the extra squeegees.',
      },
      {
        jobId: jobStorefront.id, crewId: crewA.id, status: 'SCHEDULED',
        scheduledDate: dateOnly(daysAhead(12)), windowStart: '09:00', windowEnd: '17:00',
        street: '900 E 11th St', city: 'Austin', state: 'TX', zip: '78702',
        contactName: 'Wes Trent', contactPhone: '(512) 555-0304',
        notes: 'Lift is rented for the day. Electrician meets us at noon for the raceway hookup.',
      },
      {
        jobId: jobAda.id, crewId: crewB.id, status: 'COMPLETED',
        scheduledDate: dateOnly(daysAgo(6)), windowStart: '08:00', windowEnd: '14:00',
        street: '1111 W 6th St', city: 'Austin', state: 'TX', zip: '78703',
        contactName: 'Roland Petty', contactPhone: '(512) 555-0306',
        completedAt: daysAgo(6), completionNotes: 'All 24 restroom signs and 14 directionals installed. Facilities signed off.',
      },
    ],
  });

  // --- material consumption on jobs in production --------------------------
  const consumption = [
    { jobId: jobStorefront.id, sku: 'CL-RGB-12', quantity: 16 },
    { jobId: jobStorefront.id, sku: 'PNT-MATTHEWS-BK', quantity: 1 },
    { jobId: jobZilker.id, sku: 'VIN-CUT-651-24', quantity: 0.6 },
    { jobId: jobRedlineDecals.id, sku: 'VIN-CUT-651-24', quantity: 0.3 },
    { jobId: jobThirdCoast.id, sku: 'ACM-3MM-4X8', quantity: 3 },
    { jobId: jobAda.id, sku: 'ADA-PLQ-KIT', quantity: 24 },
    { jobId: jobAda.id, sku: 'ACM-3MM-4X8', quantity: 2 },
    { jobId: jobYardSigns.id, sku: 'COR-4MM-4X8', quantity: 32 },
    { jobId: jobYardSigns.id, sku: 'HW-STAKE-H', quantity: 3 },
  ];
  for (const use of consumption) {
    const material = bySku[use.sku]!;
    const current = await prisma.material.findUniqueOrThrow({ where: { id: material.id } });
    const balanceAfter = current.stockQty.minus(use.quantity);
    await prisma.material.update({ where: { id: material.id }, data: { stockQty: balanceAfter } });
    await prisma.stockMovement.create({
      data: {
        materialId: material.id,
        type: 'USAGE',
        quantity: new Prisma.Decimal(use.quantity).negated(),
        balanceAfter,
        unitCost: current.unitCost,
        jobId: use.jobId,
        userId: production.id,
        note: 'Pulled for production',
        createdAt: daysAgo(3),
      },
    });
  }

  // --- purchase orders -----------------------------------------------------
  const poDraft = await prisma.purchaseOrder.create({
    data: {
      number: 'PO-2026-0001',
      vendorId: laird.id,
      status: 'SENT',
      orderedAt: daysAgo(4),
      expectedAt: daysAhead(3),
      notes: 'Sintra is short for the Pecan Grove job.',
      items: {
        create: [
          { materialId: bySku['PVC-6MM-4X8']!.id, quantityOrdered: 24, unitCost: 52, lineTotal: 1248 },
          { materialId: bySku['ACR-118-CLR']!.id, quantityOrdered: 8, unitCost: 118, lineTotal: 944 },
        ],
      },
    },
  });
  await prisma.purchaseOrder.update({ where: { id: poDraft.id }, data: { total: 2192 } });

  const poReceived = await prisma.purchaseOrder.create({
    data: {
      number: 'PO-2026-0002',
      vendorId: grimco.id,
      status: 'RECEIVED',
      orderedAt: daysAgo(18),
      expectedAt: daysAgo(12),
      receivedAt: daysAgo(11),
      total: 1518,
      items: {
        create: [
          { materialId: bySku['COR-4MM-4X8']!.id, quantityOrdered: 100, quantityReceived: 100, unitCost: 14, lineTotal: 1400 },
          { materialId: bySku['HW-STAKE-H']!.id, quantityOrdered: 3, quantityReceived: 3, unitCost: 38, lineTotal: 114 },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      number: 'PO-2026-0003',
      vendorId: fellers.id,
      status: 'DRAFT',
      notes: 'Auto-generated from low stock levels',
      total: 1560,
      items: {
        create: [
          { materialId: bySku['LAM-8518-54']!.id, quantityOrdered: 4, unitCost: 312, lineTotal: 1248 },
          { materialId: bySku['VIN-IJ180-54']!.id, quantityOrdered: 0, unitCost: 445, lineTotal: 0 },
        ],
      },
    },
  });
  void poReceived;

  // --- invoices & payments -------------------------------------------------
  const makeInvoice = async (spec: {
    number: string;
    jobId: string;
    companyIndex: number;
    type: 'DEPOSIT' | 'MILESTONE' | 'FINAL' | 'FULL';
    status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID';
    issuedDaysAgo: number;
    dueInDays: number;
    lines: Array<{ description: string; quantity: number; unitPrice: number }>;
    payments?: Array<{ amount: number; method: 'CASH' | 'CHECK' | 'CARD' | 'ACH' | 'OTHER'; daysAgo: number; reference?: string }>;
  }) => {
    const company = companies[spec.companyIndex]!;
    const taxRatePct = company.taxExempt ? 0 : Number(settings.defaultTaxRatePct);
    const subtotal = spec.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const taxAmount = Math.round(subtotal * (taxRatePct / 100) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    const amountPaid = (spec.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);

    const invoice = await prisma.invoice.create({
      data: {
        number: spec.number,
        type: spec.type,
        status: spec.status,
        jobId: spec.jobId,
        companyId: company.id,
        issueDate: daysAgo(spec.issuedDaysAgo),
        dueDate: daysAhead(spec.dueInDays),
        sentAt: spec.status === 'DRAFT' ? null : daysAgo(spec.issuedDaysAgo),
        paidAt: spec.status === 'PAID' ? daysAgo(1) : null,
        terms: settings.paymentTerms,
        subtotal,
        taxRatePct,
        taxAmount,
        total,
        amountPaid,
        balance: Math.round((total - amountPaid) * 100) / 100,
        items: {
          create: spec.lines.map((line, index) => ({
            sortOrder: index,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: Math.round(line.quantity * line.unitPrice * 100) / 100,
          })),
        },
      },
    });

    for (const payment of spec.payments ?? []) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference ?? null,
          receivedAt: daysAgo(payment.daysAgo),
          userId: manager.id,
        },
      });
    }
    return invoice;
  };

  await makeInvoice({
    number: 'INV-2026-0001', jobId: jobYardSigns.id, companyIndex: 3, type: 'FULL', status: 'PAID',
    issuedDaysAgo: 14, dueInDays: 16,
    lines: [{ description: '18x24 coroplast listing signs, 2-sided (250)', quantity: 1, unitPrice: Number(quoteYardSigns.subtotal) }],
    payments: [{ amount: Number(quoteYardSigns.total), method: 'ACH', daysAgo: 9, reference: 'ACH-88213' }],
  });

  await makeInvoice({
    number: 'INV-2026-0002', jobId: jobAda.id, companyIndex: 6, type: 'FULL', status: 'SENT',
    issuedDaysAgo: 5, dueInDays: 25,
    lines: [
      { description: 'ADA restroom signs with braille (24)', quantity: 1, unitPrice: 1632 },
      { description: 'Interior directional panels 12x36 (14)', quantity: 1, unitPrice: 4914 },
      { description: 'Installation labor', quantity: 5, unitPrice: 95 },
    ],
  });

  await makeInvoice({
    number: 'INV-2026-0003', jobId: jobStorefront.id, companyIndex: 4, type: 'DEPOSIT', status: 'PARTIAL',
    issuedDaysAgo: 19, dueInDays: -4,
    lines: [{ description: 'Deposit — J-2026-0003 Storefront channel letters', quantity: 1, unitPrice: Math.round(Number(quoteStorefront.total) * 0.5) }],
    payments: [{ amount: 2000, method: 'CHECK', daysAgo: 12, reference: 'Check #4471' }],
  });

  await makeInvoice({
    number: 'INV-2026-0004', jobId: jobThirdCoast.id, companyIndex: 8, type: 'DEPOSIT', status: 'PAID',
    issuedDaysAgo: 12, dueInDays: 18,
    lines: [{ description: 'Deposit — J-2026-0007 Roastery A-frame + menu boards', quantity: 1, unitPrice: 945 }],
    payments: [{ amount: 1022.96, method: 'CARD', daysAgo: 11, reference: 'Stripe pi_test_4471' }],
  });

  await makeInvoice({
    number: 'INV-2026-0005', jobId: jobRedlineDecals.id, companyIndex: 2, type: 'FULL', status: 'SENT',
    issuedDaysAgo: 45, dueInDays: -15,
    lines: [{ description: 'Service van door decals (4 doors)', quantity: 1, unitPrice: 1180 }],
  });

  await makeInvoice({
    number: 'INV-2026-0006', jobId: jobZilker.id, companyIndex: 7, type: 'DEPOSIT', status: 'SENT',
    issuedDaysAgo: 70, dueInDays: -40,
    lines: [{ description: 'Deposit — truck bed rail lettering', quantity: 1, unitPrice: 1120 }],
  });

  // Counters must reflect the seeded document numbers so the next real
  // document does not collide with them.
  const year = new Date().getFullYear();
  await prisma.counter.createMany({
    data: [
      { key: `quote:${year}`, value: quoteCounter },
      { key: `job:${year}`, value: jobCounter },
      { key: `invoice:${year}`, value: 6 },
      { key: `po:${year}`, value: 3 },
    ],
  });

  void [admin, quoteTaproom, quoteMonument, quoteWindows, quoteWrap, jobBrewTaproom];

  console.log('\nSeed complete.');
  console.log('  Users (password: password123)');
  console.log('    admin@inkzsigns.test     Admin        — everything');
  console.log('    owner@inkzsigns.test     Manager      — reporting + all modules');
  console.log('    sales@inkzsigns.test     Sales rep    — CRM, quoting, invoicing');
  console.log('    shop@inkzsigns.test      Production   — job board, no pricing');
  console.log('    install@inkzsigns.test   Install crew — today\'s installs only');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
