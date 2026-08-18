import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { InvoiceStatus, JobPriority, JobStatus, PipelineStage, QuoteStatus } from '../lib/types';
import { humanize } from '../lib/format';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="card-header">
      <h2 className="card-title">{title}</h2>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
        aria-hidden
      />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  to?: string;
}) {
  const tones = {
    default: 'text-slate-900',
    positive: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="card block p-4 transition-shadow hover:shadow-md">
        {body}
      </Link>
    );
  }
  return <div className="card p-4">{body}</div>;
}

// --- status badges ---------------------------------------------------------

const JOB_TONES: Record<JobStatus, string> = {
  DESIGN_PROOF: 'bg-slate-100 text-slate-700',
  CLIENT_APPROVAL: 'bg-amber-100 text-amber-800',
  MATERIALS_ORDERED: 'bg-purple-100 text-purple-800',
  PRODUCTION: 'bg-blue-100 text-blue-800',
  FINISHING: 'bg-cyan-100 text-cyan-800',
  QC: 'bg-indigo-100 text-indigo-800',
  READY: 'bg-teal-100 text-teal-800',
  INSTALLED: 'bg-emerald-100 text-emerald-800',
  INVOICED: 'bg-lime-100 text-lime-800',
  CLOSED: 'bg-slate-200 text-slate-600',
  ON_HOLD: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

const JOB_LABELS: Record<JobStatus, string> = {
  DESIGN_PROOF: 'Design / Proof',
  CLIENT_APPROVAL: 'Client Approval',
  MATERIALS_ORDERED: 'Materials Ordered',
  PRODUCTION: 'Production',
  FINISHING: 'Finishing',
  QC: 'QC',
  READY: 'Ready',
  INSTALLED: 'Installed',
  INVOICED: 'Invoiced',
  CLOSED: 'Closed',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
};

export const jobStatusLabel = (status: JobStatus): string => JOB_LABELS[status] ?? humanize(status);

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <span className={`badge ${JOB_TONES[status]}`}>{jobStatusLabel(status)}</span>;
}

const QUOTE_TONES: Record<QuoteStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-slate-200 text-slate-500',
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={`badge ${QUOTE_TONES[status]}`}>{humanize(status)}</span>;
}

const INVOICE_TONES: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  VOID: 'bg-slate-200 text-slate-500',
};

export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue && status !== 'PAID' && status !== 'VOID') {
    return <span className="badge bg-red-100 text-red-700">Overdue</span>;
  }
  return <span className={`badge ${INVOICE_TONES[status]}`}>{humanize(status)}</span>;
}

const STAGE_TONES: Record<PipelineStage, string> = {
  NEW: 'bg-slate-100 text-slate-700',
  CONTACTED: 'bg-blue-100 text-blue-800',
  QUOTED: 'bg-amber-100 text-amber-800',
  WON: 'bg-emerald-100 text-emerald-800',
  LOST: 'bg-red-100 text-red-700',
};

export function StageBadge({ stage }: { stage: PipelineStage }) {
  return <span className={`badge ${STAGE_TONES[stage]}`}>{humanize(stage)}</span>;
}

const PRIORITY_TONES: Record<JobPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-slate-100 text-slate-600',
  HIGH: 'bg-orange-100 text-orange-800',
  RUSH: 'bg-red-100 text-red-700',
};

export function PriorityBadge({ priority }: { priority: JobPriority }) {
  if (priority === 'NORMAL' || priority === 'LOW') return null;
  return <span className={`badge ${PRIORITY_TONES[priority]}`}>{humanize(priority)}</span>;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  );
}
