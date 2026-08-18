-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'PRODUCTION', 'INSTALLER');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'SITE_VISIT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SignType" AS ENUM ('BANNER', 'VEHICLE_WRAP', 'CHANNEL_LETTERS', 'MONUMENT', 'ADA', 'DECAL', 'TRADE_SHOW', 'YARD_SIGN', 'WINDOW_GRAPHIC', 'DIMENSIONAL_LETTERS', 'WAYFINDING', 'OTHER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DESIGN_PROOF', 'CLIENT_APPROVAL', 'MATERIALS_ORDERED', 'PRODUCTION', 'FINISHING', 'QC', 'READY', 'INSTALLED', 'INVOICED', 'CLOSED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'RUSH');

-- CreateEnum
CREATE TYPE "ProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PRINTER', 'ROUTER', 'LAMINATOR', 'BENCH', 'PAINT', 'INSTALL_CREW');

-- CreateEnum
CREATE TYPE "InstallStatus" AS ENUM ('SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('SUBSTRATE', 'VINYL', 'INK', 'LAMINATE', 'HARDWARE', 'PAINT', 'ELECTRICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('SQFT', 'EACH', 'ROLL', 'SHEET', 'LINEAR_FT', 'LITER', 'GALLON');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'USAGE', 'ADJUSTMENT', 'RETURN', 'WASTE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('DEPOSIT', 'MILESTONE', 'FINAL', 'FULL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CHECK', 'CARD', 'ACH', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "taxExempt" BOOLEAN NOT NULL DEFAULT false,
    "taxRatePct" DECIMAL(6,3),
    "billingStreet" TEXT,
    "billingCity" TEXT,
    "billingState" TEXT,
    "billingZip" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT,
    "stage" "PipelineStage" NOT NULL DEFAULT 'NEW',
    "estimatedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "source" TEXT,
    "description" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "lostReason" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "createdById" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "jobId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentQuoteId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "createdById" TEXT,
    "discountPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "rushFeePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxRatePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rushFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "signedIp" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "signType" "SignType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "widthIn" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "heightIn" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "materialId" TEXT,
    "pricePerSqFt" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "materialCostPerSqFt" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "minimumCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "laminate" BOOLEAN NOT NULL DEFAULT false,
    "mounting" BOOLEAN NOT NULL DEFAULT false,
    "contourCut" BOOLEAN NOT NULL DEFAULT false,
    "grommets" BOOLEAN NOT NULL DEFAULT false,
    "hemmed" BOOLEAN NOT NULL DEFAULT false,
    "laborHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "laborRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "markupPct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "installRequired" BOOLEAN NOT NULL DEFAULT false,
    "installHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "installRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "areaSqFt" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'DESIGN_PROOF',
    "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "quoteId" TEXT,
    "opportunityId" TEXT,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "onHoldReason" TEXT,
    "contractTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quotedMaterialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installRequired" BOOLEAN NOT NULL DEFAULT false,
    "installStreet" TEXT,
    "installCity" TEXT,
    "installState" TEXT,
    "installZip" TEXT,
    "installNotes" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "signType" "SignType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL,
    "widthIn" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "heightIn" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "materialId" TEXT,
    "areaSqFt" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "JobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStatusEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChecklistItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "JobStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JobChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobComment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proof" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'PENDING',
    "fileId" TEXT,
    "sentAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "decidedByName" TEXT,
    "clientNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "capacityPerDay" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallCrewMember" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InstallCrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleEntry" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "stage" "JobStatus" NOT NULL DEFAULT 'PRODUCTION',
    "scheduledDate" DATE NOT NULL,
    "durationHours" DECIMAL(6,2) NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Install" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "crewId" TEXT,
    "status" "InstallStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledDate" DATE NOT NULL,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "completionNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Install_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL DEFAULT 'OTHER',
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'SQFT',
    "unitCost" DECIMAL(12,4) NOT NULL,
    "pricePerSqFt" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "minimumCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sheetWidthIn" DECIMAL(10,3),
    "sheetHeightIn" DECIMAL(10,3),
    "stockQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "vendorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "balanceAfter" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,4),
    "jobId" TEXT,
    "purchaseOrderId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(12,3) NOT NULL,
    "quantityReceived" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,4) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'FULL',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "jobId" TEXT,
    "companyId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "terms" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxRatePct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "stripeInvoiceId" TEXT,
    "quickbooksInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CHECK',
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "note" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'attachment',
    "uploadedById" TEXT,
    "companyId" TEXT,
    "jobId" TEXT,
    "quoteId" TEXT,
    "installId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "shopName" TEXT NOT NULL DEFAULT 'Your Sign Shop',
    "shopEmail" TEXT NOT NULL DEFAULT 'hello@signshop.test',
    "shopPhone" TEXT NOT NULL DEFAULT '',
    "shopStreet" TEXT NOT NULL DEFAULT '',
    "shopCity" TEXT NOT NULL DEFAULT '',
    "shopState" TEXT NOT NULL DEFAULT '',
    "shopZip" TEXT NOT NULL DEFAULT '',
    "defaultMarkupPct" DECIMAL(6,3) NOT NULL DEFAULT 35,
    "defaultMinimumCharge" DECIMAL(10,2) NOT NULL DEFAULT 75,
    "rushFeePct" DECIMAL(6,3) NOT NULL DEFAULT 25,
    "laborRate" DECIMAL(10,2) NOT NULL DEFAULT 85,
    "installRate" DECIMAL(10,2) NOT NULL DEFAULT 95,
    "laminateCostPerSqFt" DECIMAL(10,4) NOT NULL DEFAULT 1.25,
    "mountingCostPerSqFt" DECIMAL(10,4) NOT NULL DEFAULT 2.5,
    "contourCutFee" DECIMAL(10,2) NOT NULL DEFAULT 25,
    "grommetFee" DECIMAL(10,2) NOT NULL DEFAULT 0.75,
    "hemFeePerLinearFt" DECIMAL(10,2) NOT NULL DEFAULT 1.5,
    "defaultTaxRatePct" DECIMAL(6,3) NOT NULL DEFAULT 8.25,
    "taxJurisdiction" TEXT NOT NULL DEFAULT 'Default',
    "depositPct" DECIMAL(6,3) NOT NULL DEFAULT 50,
    "quoteValidDays" INTEGER NOT NULL DEFAULT 30,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Net 30',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Contact_lastName_idx" ON "Contact"("lastName");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Opportunity_stage_position_idx" ON "Opportunity"("stage", "position");

-- CreateIndex
CREATE INDEX "Activity_companyId_occurredAt_idx" ON "Activity"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_occurredAt_idx" ON "Activity"("occurredAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueAt_idx" ON "Task"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_companyId_idx" ON "Quote"("companyId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_sortOrder_idx" ON "QuoteItem"("quoteId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_companyId_idx" ON "Job"("companyId");

-- CreateIndex
CREATE INDEX "Job_dueDate_idx" ON "Job"("dueDate");

-- CreateIndex
CREATE INDEX "JobItem_jobId_sortOrder_idx" ON "JobItem"("jobId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobStatusEvent_jobId_createdAt_idx" ON "JobStatusEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobChecklistItem_jobId_stage_sortOrder_idx" ON "JobChecklistItem"("jobId", "stage", "sortOrder");

-- CreateIndex
CREATE INDEX "JobComment_jobId_createdAt_idx" ON "JobComment"("jobId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proof_jobId_version_key" ON "Proof"("jobId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InstallCrewMember_resourceId_userId_key" ON "InstallCrewMember"("resourceId", "userId");

-- CreateIndex
CREATE INDEX "ScheduleEntry_resourceId_scheduledDate_idx" ON "ScheduleEntry"("resourceId", "scheduledDate");

-- CreateIndex
CREATE INDEX "ScheduleEntry_jobId_idx" ON "ScheduleEntry"("jobId");

-- CreateIndex
CREATE INDEX "Install_scheduledDate_crewId_idx" ON "Install"("scheduledDate", "crewId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_sku_key" ON "Material"("sku");

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- CreateIndex
CREATE INDEX "StockMovement_materialId_createdAt_idx" ON "StockMovement"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_jobId_idx" ON "StockMovement"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_sortOrder_idx" ON "InvoiceItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "FileAsset_jobId_idx" ON "FileAsset"("jobId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_parentQuoteId_fkey" FOREIGN KEY ("parentQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobItem" ADD CONSTRAINT "JobItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistItem" ADD CONSTRAINT "JobChecklistItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistItem" ADD CONSTRAINT "JobChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobComment" ADD CONSTRAINT "JobComment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobComment" ADD CONSTRAINT "JobComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proof" ADD CONSTRAINT "Proof_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallCrewMember" ADD CONSTRAINT "InstallCrewMember_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallCrewMember" ADD CONSTRAINT "InstallCrewMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEntry" ADD CONSTRAINT "ScheduleEntry_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Install" ADD CONSTRAINT "Install_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Install" ADD CONSTRAINT "Install_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_installId_fkey" FOREIGN KEY ("installId") REFERENCES "Install"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
