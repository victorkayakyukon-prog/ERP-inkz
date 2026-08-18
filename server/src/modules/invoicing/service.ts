import { Prisma } from '@prisma/client';
import type { Tx } from '../../lib/db.js';
import { money, pct } from '../../lib/money.js';
import { notFound } from '../../lib/errors.js';

/**
 * Recomputes an invoice from its lines and payments. Status follows the
 * balance: anything with money still owed after a payment is PARTIAL, a zero
 * balance is PAID. DRAFT and VOID are set explicitly and never inferred.
 */
export async function recalculateInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  if (!invoice) throw notFound('Invoice not found');

  const subtotal = money(
    invoice.items.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)),
  );
  const taxableSubtotal = money(
    invoice.items
      .filter((item) => item.taxable)
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0)),
  );
  const taxAmount = money(pct(taxableSubtotal, invoice.taxRatePct));
  const total = money(subtotal.plus(taxAmount));
  const amountPaid = money(
    invoice.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0)),
  );
  const balance = money(total.minus(amountPaid));

  let status = invoice.status;
  if (status !== 'DRAFT' && status !== 'VOID') {
    if (balance.lessThanOrEqualTo(0) && total.greaterThan(0)) status = 'PAID';
    else if (amountPaid.greaterThan(0)) status = 'PARTIAL';
    else status = 'SENT';
  }

  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      subtotal,
      taxAmount,
      total,
      amountPaid,
      balance,
      status,
      ...(status === 'PAID' && !invoice.paidAt ? { paidAt: new Date() } : {}),
      ...(status !== 'PAID' ? { paidAt: null } : {}),
    },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      payments: { orderBy: { receivedAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
      company: true,
      job: { select: { id: true, jobNumber: true, title: true, status: true } },
    },
  });
}

/** An invoice is overdue when it is past due and still owes money. */
export function isOverdue(invoice: { status: string; dueDate: Date | null; balance: Prisma.Decimal }): boolean {
  if (invoice.status === 'PAID' || invoice.status === 'VOID' || invoice.status === 'DRAFT') return false;
  if (!invoice.dueDate) return false;
  return invoice.dueDate.getTime() < Date.now() && invoice.balance.greaterThan(0);
}
