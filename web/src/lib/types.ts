export type Role = 'ADMIN' | 'MANAGER' | 'SALES' | 'PRODUCTION' | 'INSTALLER';

export type Permission =
  | 'crm:read' | 'crm:write'
  | 'quote:read' | 'quote:write'
  | 'job:read' | 'job:write' | 'job:stage'
  | 'production:read' | 'production:write'
  | 'install:read' | 'install:write'
  | 'inventory:read' | 'inventory:write'
  | 'invoice:read' | 'invoice:write'
  | 'report:read' | 'pricing:read'
  | 'settings:write' | 'user:manage';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  permissions: Permission[];
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type PipelineStage = 'NEW' | 'CONTACTED' | 'QUOTED' | 'WON' | 'LOST';

export type JobStatus =
  | 'DESIGN_PROOF' | 'CLIENT_APPROVAL' | 'MATERIALS_ORDERED' | 'PRODUCTION'
  | 'FINISHING' | 'QC' | 'READY' | 'INSTALLED' | 'INVOICED' | 'CLOSED'
  | 'ON_HOLD' | 'CANCELLED';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'VOID';
export type JobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'RUSH';

export type SignType =
  | 'BANNER' | 'VEHICLE_WRAP' | 'CHANNEL_LETTERS' | 'MONUMENT' | 'ADA' | 'DECAL'
  | 'TRADE_SHOW' | 'YARD_SIGN' | 'WINDOW_GRAPHIC' | 'DIMENSIONAL_LETTERS'
  | 'WAYFINDING' | 'OTHER';

export interface Company {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  tags: string[];
  notes?: string | null;
  taxExempt: boolean;
  taxRatePct?: number | null;
  billingStreet?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  contacts?: Contact[];
  _count?: { contacts: number; jobs: number; opportunities: number };
}

export interface Contact {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  firstName: string;
  lastName: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  isPrimary: boolean;
  notes?: string | null;
}

export interface Opportunity {
  id: string;
  title: string;
  companyId: string;
  company?: { id: string; name: string };
  contactId?: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  stage: PipelineStage;
  estimatedValue: number;
  source?: string | null;
  description?: string | null;
  expectedCloseDate?: string | null;
  lostReason?: string | null;
  position: number;
  closedAt?: string | null;
  createdAt: string;
  _count?: { quotes: number };
}

export interface Activity {
  id: string;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'SITE_VISIT';
  subject: string;
  body?: string | null;
  occurredAt: string;
  user?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
}

export interface Task {
  id: string;
  title: string;
  notes?: string | null;
  dueAt?: string | null;
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  assignee?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
  opportunity?: { id: string; title: string } | null;
  job?: { id: string; jobNumber: string; title: string } | null;
}

export interface Material {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  pricePerSqFt: number;
  minimumCharge: number;
  sheetWidthIn?: number | null;
  sheetHeightIn?: number | null;
  stockQty: number;
  reorderPoint: number;
  reorderQty: number;
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  active: boolean;
  notes?: string | null;
  lowStock?: boolean;
  shortfall?: number;
  suggestedOrderQty?: number;
}

export interface QuoteItem {
  id: string;
  sortOrder: number;
  signType: SignType;
  description: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
  materialId?: string | null;
  material?: Material | null;
  pricePerSqFt: number;
  materialCostPerSqFt: number;
  minimumCharge: number;
  laminate: boolean;
  mounting: boolean;
  contourCut: boolean;
  grommets: boolean;
  hemmed: boolean;
  laborHours: number;
  laborRate: number;
  markupPct: number;
  installRequired: boolean;
  installHours: number;
  installRate: number;
  areaSqFt: number;
  materialCost: number;
  lineTotal: number;
  notes?: string | null;
}

export interface Quote {
  id: string;
  number: string;
  version: number;
  parentQuoteId?: string | null;
  status: QuoteStatus;
  title: string;
  companyId: string;
  company: Company;
  contactId?: string | null;
  contact?: Contact | null;
  opportunityId?: string | null;
  opportunity?: { id: string; title: string; stage: PipelineStage } | null;
  createdBy?: { id: string; name: string } | null;
  discountPct: number;
  rushFeePct: number;
  taxRatePct: number;
  subtotal: number;
  discount: number;
  rushFee: number;
  taxAmount: number;
  total: number;
  materialCost: number;
  notes?: string | null;
  terms?: string | null;
  validUntil?: string | null;
  sentAt?: string | null;
  decidedAt?: string | null;
  signedName?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  items: QuoteItem[];
  jobs?: Array<{ id: string; jobNumber: string; status: JobStatus }>;
  versions?: Array<{ id: string; number: string; version: number; status: QuoteStatus; total: number }>;
  _count?: { items: number };
}

export interface JobItem {
  id: string;
  sortOrder: number;
  signType: SignType;
  description: string;
  widthIn: number;
  heightIn: number;
  quantity: number;
  materialId?: string | null;
  material?: Material | null;
  areaSqFt: number;
  lineTotal?: number;
  materialCost?: number;
  installRequired: boolean;
  notes?: string | null;
}

export interface ChecklistItem {
  id: string;
  stage: JobStatus;
  label: string;
  done: boolean;
  sortOrder: number;
  completedBy?: { id: string; name: string } | null;
  completedAt?: string | null;
}

export interface Proof {
  id: string;
  version: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fileId?: string | null;
  file?: FileAsset | null;
  sentAt?: string | null;
  decidedAt?: string | null;
  decidedByName?: string | null;
  clientNote?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface FileAsset {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: string;
  previewable?: boolean;
  uploadedBy?: { id: string; name: string } | null;
  createdAt: string;
}

export interface JobStatusEvent {
  id: string;
  fromStatus?: JobStatus | null;
  toStatus: JobStatus;
  note?: string | null;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export interface Job {
  id: string;
  jobNumber: string;
  title: string;
  status: JobStatus;
  priority: JobPriority;
  companyId: string;
  company: Company;
  contactId?: string | null;
  contact?: Contact | null;
  quoteId?: string | null;
  quote?: { id: string; number: string; status: QuoteStatus; total?: number } | null;
  owner?: { id: string; name: string } | null;
  dueDate?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  onHoldReason?: string | null;
  contractTotal?: number;
  quotedMaterialCost?: number;
  installRequired: boolean;
  installStreet?: string | null;
  installCity?: string | null;
  installState?: string | null;
  installZip?: string | null;
  installNotes?: string | null;
  description?: string | null;
  createdAt: string;
  items: JobItem[];
  checklist: ChecklistItem[];
  comments: Array<{ id: string; body: string; internal: boolean; createdAt: string; user?: { id: string; name: string } | null }>;
  proofs: Proof[];
  files: FileAsset[];
  statusEvents: JobStatusEvent[];
  scheduleEntries: ScheduleEntry[];
  installs: Install[];
  invoices: Invoice[];
  stockMovements: StockMovement[];
  allowedTransitions?: Array<{ status: JobStatus; label: string }>;
  daysInStage?: number;
  enteredStageAt?: string;
  _count?: { items: number; proofs: number };
}

export interface Resource {
  id: string;
  name: string;
  type: 'PRINTER' | 'ROUTER' | 'LAMINATOR' | 'BENCH' | 'PAINT' | 'INSTALL_CREW';
  color: string;
  capacityPerDay: number;
  active: boolean;
  sortOrder: number;
  crewMembers?: Array<{ id: string; user: { id: string; name: string; phone?: string | null } }>;
}

export interface ScheduleEntry {
  id: string;
  jobId: string;
  job?: Job;
  resourceId: string;
  resource?: Resource;
  stage: JobStatus;
  scheduledDate: string;
  durationHours: number;
  sortOrder: number;
  notes?: string | null;
  completedAt?: string | null;
}

export interface ScheduleBoard {
  start: string;
  dates: string[];
  board: Array<{
    resource: Resource;
    days: Array<{
      date: string;
      entries: ScheduleEntry[];
      load: number;
      capacity: number;
      overbooked: boolean;
    }>;
  }>;
  unscheduled: Job[];
}

export interface Install {
  id: string;
  jobId: string;
  job?: Job;
  crewId?: string | null;
  crew?: Resource | null;
  status: 'SCHEDULED' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED';
  scheduledDate: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  completionNotes?: string | null;
  completedAt?: string | null;
  photos: FileAsset[];
}

export interface InvoiceItem {
  id: string;
  sortOrder: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxable: boolean;
}

export interface Payment {
  id: string;
  amount: number;
  method: 'CASH' | 'CHECK' | 'CARD' | 'ACH' | 'OTHER';
  reference?: string | null;
  receivedAt: string;
  note?: string | null;
  user?: { id: string; name: string } | null;
}

export interface Invoice {
  id: string;
  number: string;
  type: 'DEPOSIT' | 'MILESTONE' | 'FINAL' | 'FULL';
  status: InvoiceStatus;
  jobId?: string | null;
  job?: { id: string; jobNumber: string; title: string; status?: JobStatus } | null;
  companyId: string;
  company: Company;
  issueDate: string;
  dueDate?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  terms?: string | null;
  subtotal: number;
  taxRatePct: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;
  notes?: string | null;
  overdue?: boolean;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface StockMovement {
  id: string;
  type: 'RECEIPT' | 'USAGE' | 'ADJUSTMENT' | 'RETURN' | 'WASTE';
  quantity: number;
  balanceAfter: number;
  unitCost?: number | null;
  note?: string | null;
  createdAt: string;
  material?: { id: string; sku: string; name: string; unit: string };
  user?: { id: string; name: string } | null;
  job?: { id: string; jobNumber: string } | null;
}

export interface Vendor {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  active: boolean;
  materials?: Material[];
  purchaseOrders?: PurchaseOrder[];
  _count?: { materials: number; purchaseOrders: number };
}

export interface PurchaseOrderItem {
  id: string;
  materialId: string;
  material?: Material;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  vendorId: string;
  vendor?: Vendor;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
  orderedAt?: string | null;
  expectedAt?: string | null;
  receivedAt?: string | null;
  total: number;
  notes?: string | null;
  items: PurchaseOrderItem[];
  _count?: { items: number };
}

export interface Settings {
  shopName: string;
  shopEmail: string;
  shopPhone: string;
  shopStreet: string;
  shopCity: string;
  shopState: string;
  shopZip: string;
  defaultMarkupPct: number;
  defaultMinimumCharge: number;
  rushFeePct: number;
  laborRate: number;
  installRate: number;
  laminateCostPerSqFt: number;
  mountingCostPerSqFt: number;
  contourCutFee: number;
  grommetFee: number;
  hemFeePerLinearFt: number;
  defaultTaxRatePct: number;
  taxJurisdiction: string;
  depositPct: number;
  quoteValidDays: number;
  paymentTerms: string;
}

export interface DashboardData {
  pipeline: { openCount: number; openValue: number; wonThisMonth: number; lostThisMonth: number; winRatePct: number };
  jobs: { open: number; dueThisWeek: number; byStatus: Array<{ status: JobStatus; label: string; count: number }> };
  money: { revenueThisMonth: number; outstanding: number; overdueCount: number; overdueAmount: number };
  inventory: { trackedMaterials: number; lowStock: number };
}
