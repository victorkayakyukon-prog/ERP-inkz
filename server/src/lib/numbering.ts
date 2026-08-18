import type { Tx } from './db.js';

export type DocumentKind = 'quote' | 'job' | 'invoice' | 'po';

const PREFIX: Record<DocumentKind, string> = {
  quote: 'Q',
  job: 'J',
  invoice: 'INV',
  po: 'PO',
};

/**
 * Allocates the next human-facing document number (Q-2026-0007).
 * The counter row is upserted inside the caller's transaction so two
 * simultaneous quote submissions cannot claim the same number.
 */
export async function nextNumber(tx: Tx, kind: DocumentKind, date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const key = `${kind}:${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${PREFIX[kind]}-${year}-${String(counter.value).padStart(4, '0')}`;
}
