import type { Tx } from './db.js';
import { prisma } from './db.js';

export interface AuditInput {
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'status_change' | 'login';
  userId?: string | null;
  summary: string;
  changes?: Record<string, unknown> | null;
}

/** Writes an audit row. Never throws into the request path. */
export async function recordAudit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        userId: input.userId ?? null,
        summary: input.summary,
        changes: (input.changes ?? undefined) as never,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record', input.entity, input.entityId, error);
  }
}

const stringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** Shallow diff of the fields a caller actually submitted. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const prev = before[key];
    if (stringify(prev) !== stringify(next)) changes[key] = { from: prev, to: next };
  }
  return changes;
}
