import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader, Spinner, Stat } from '../../components/ui';
import { humanize, money, moneyShort, number } from '../../lib/format';

interface PipelineReport {
  byStage: Array<{ stage: string; count: number; value: number }>;
  winRate: { won: number; lost: number; pct: number; wonValue: number; lostValue: number };
  lostReasons: Array<{ reason: string; count: number }>;
}

interface BottleneckRow {
  status: string;
  label: string;
  count: number;
  avgDaysInStage: number;
  oldestDays: number;
  jobs: Array<{ id: string; jobNumber: string; title: string; company: string; daysInStage: number }>;
}

interface RevenueMonth {
  month: string;
  collected: number;
  invoiced: number;
}

interface Breakdown {
  bySignType: Array<{ signType: string; revenue: number; cost: number; count: number }>;
  byCustomer: Array<{ companyId: string; name: string; revenue: number; count: number }>;
}

interface MarginRow {
  id: string;
  jobNumber: string;
  title: string;
  company: string;
  status: string;
  contractTotal: number;
  quotedMaterialCost: number;
  actualMaterialCost: number;
  materialVariance: number;
  margin: number;
  marginPct: number;
}

interface Receivables {
  buckets: Record<string, number>;
  invoices: Array<{
    id: string;
    number: string;
    company: string;
    job: string | null;
    dueDate: string | null;
    total: number;
    balance: number;
    daysOverdue: number;
  }>;
}

type Tab = 'pipeline' | 'production' | 'revenue' | 'margins' | 'receivables';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pipeline', label: 'Pipeline & win rate' },
  { key: 'production', label: 'Bottlenecks' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'margins', label: 'Job margins' },
  { key: 'receivables', label: 'Receivables' },
];

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pipeline');

  return (
    <>
      <PageHeader title="Reports" subtitle="Where the money and the work actually are." />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === entry.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' ? <PipelineReportView /> : null}
      {tab === 'production' ? <BottleneckView /> : null}
      {tab === 'revenue' ? <RevenueView /> : null}
      {tab === 'margins' ? <MarginView /> : null}
      {tab === 'receivables' ? <ReceivablesView /> : null}
    </>
  );
}

function Bar({ value, max, tone = 'bg-brand-500' }: { value: number; max: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
      <div className={`h-full rounded ${tone}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

function PipelineReportView() {
  const report = useQuery({
    queryKey: ['report', 'pipeline'],
    queryFn: () => api.get<PipelineReport>('/reports/pipeline'),
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorNote error={report.error} />;
  const data = report.data!;
  const maxValue = Math.max(...data.byStage.map((row) => row.value), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Win rate" value={`${data.winRate.pct}%`} tone={data.winRate.pct >= 50 ? 'positive' : 'warning'} />
        <Stat label="Won" value={data.winRate.won} hint={money(data.winRate.wonValue)} tone="positive" />
        <Stat label="Lost" value={data.winRate.lost} hint={money(data.winRate.lostValue)} tone="danger" />
        <Stat
          label="Open pipeline"
          value={moneyShort(
            data.byStage
              .filter((row) => !['WON', 'LOST'].includes(row.stage))
              .reduce((sum, row) => sum + row.value, 0),
          )}
        />
      </div>

      <Card>
        <CardHeader title="Value by stage" />
        <div className="space-y-3 p-4">
          {data.byStage.map((row) => (
            <div key={row.stage}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-700">{humanize(row.stage)}</span>
                <span className="text-slate-500">
                  {row.count} · {money(row.value)}
                </span>
              </div>
              <Bar
                value={row.value}
                max={maxValue}
                tone={row.stage === 'WON' ? 'bg-emerald-500' : row.stage === 'LOST' ? 'bg-red-400' : 'bg-brand-500'}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Why we lose" />
        {data.lostReasons.length === 0 ? (
          <EmptyState title="No losses recorded in this period" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.lostReasons.map((row) => (
              <li key={row.reason} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-slate-700">{row.reason}</span>
                <span className="font-medium text-slate-500">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BottleneckView() {
  const report = useQuery({
    queryKey: ['report', 'bottlenecks'],
    queryFn: () => api.get<BottleneckRow[]>('/reports/bottlenecks'),
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorNote error={report.error} />;
  const rows = (report.data ?? []).filter((row) => row.count > 0);
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  if (!rows.length) {
    return (
      <Card>
        <EmptyState title="No open jobs" hint="Nothing is stuck anywhere right now." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Jobs sitting in each stage" />
        <div className="space-y-4 p-4">
          {rows.map((row) => (
            <div key={row.status}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{row.label}</span>
                <span className="text-slate-500">
                  {row.count} job{row.count === 1 ? '' : 's'} · avg {row.avgDaysInStage}d · oldest{' '}
                  {row.oldestDays}d
                </span>
              </div>
              <Bar
                value={row.count}
                max={maxCount}
                tone={row.avgDaysInStage >= 7 ? 'bg-red-500' : row.avgDaysInStage >= 3 ? 'bg-amber-500' : 'bg-brand-500'}
              />
              {row.avgDaysInStage >= 3 ? (
                <ul className="mt-2 space-y-0.5 text-xs">
                  {row.jobs.slice(0, 5).map((job) => (
                    <li key={job.id} className="flex justify-between">
                      <Link to={`/jobs/${job.id}`} className="link">
                        {job.jobNumber} — {job.company}
                      </Link>
                      <span className={job.daysInStage >= 7 ? 'font-medium text-red-600' : 'text-slate-400'}>
                        {job.daysInStage}d
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RevenueView() {
  const revenue = useQuery({
    queryKey: ['report', 'revenue'],
    queryFn: () => api.get<RevenueMonth[]>('/reports/revenue'),
  });
  const breakdown = useQuery({
    queryKey: ['report', 'revenue-breakdown'],
    queryFn: () => api.get<Breakdown>('/reports/revenue-breakdown'),
  });

  if (revenue.isLoading) return <Spinner />;
  if (revenue.error) return <ErrorNote error={revenue.error} />;
  const months = revenue.data ?? [];
  const maxMonth = Math.max(...months.map((row) => Math.max(row.collected, row.invoiced)), 1);
  const maxSignType = Math.max(...(breakdown.data?.bySignType ?? []).map((row) => row.revenue), 1);
  const maxCustomer = Math.max(...(breakdown.data?.byCustomer ?? []).map((row) => row.revenue), 1);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Invoiced vs collected by month" />
        {months.length === 0 ? (
          <EmptyState title="No revenue in this period" />
        ) : (
          <div className="space-y-3 p-4">
            {months.map((row) => (
              <div key={row.month}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {new Date(`${row.month}-01T00:00:00`).toLocaleDateString('en-US', {
                      month: 'short', year: 'numeric',
                    })}
                  </span>
                  <span className="text-slate-500">
                    invoiced {money(row.invoiced)} · collected {money(row.collected)}
                  </span>
                </div>
                <div className="space-y-1">
                  <Bar value={row.invoiced} max={maxMonth} tone="bg-brand-300" />
                  <Bar value={row.collected} max={maxMonth} tone="bg-emerald-500" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By sign type" />
          {(breakdown.data?.bySignType ?? []).length === 0 ? (
            <EmptyState title="No job items in this period" />
          ) : (
            <div className="space-y-3 p-4">
              {(breakdown.data?.bySignType ?? []).map((row) => (
                <div key={row.signType}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{humanize(row.signType)}</span>
                    <span className="text-slate-500">
                      {money(row.revenue)}
                      <span className="ml-1 text-xs text-slate-400">({row.count} lines)</span>
                    </span>
                  </div>
                  <Bar value={row.revenue} max={maxSignType} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Top customers" />
          {(breakdown.data?.byCustomer ?? []).length === 0 ? (
            <EmptyState title="No customer revenue yet" />
          ) : (
            <div className="space-y-3 p-4">
              {(breakdown.data?.byCustomer ?? []).slice(0, 10).map((row) => (
                <div key={row.companyId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <Link to={`/crm/companies/${row.companyId}`} className="link truncate">
                      {row.name}
                    </Link>
                    <span className="shrink-0 text-slate-500">{money(row.revenue)}</span>
                  </div>
                  <Bar value={row.revenue} max={maxCustomer} tone="bg-cyan-500" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MarginView() {
  const report = useQuery({
    queryKey: ['report', 'margins'],
    queryFn: () => api.get<MarginRow[]>('/reports/margins'),
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorNote error={report.error} />;
  const rows = report.data ?? [];

  return (
    <Card>
      <CardHeader title="Contract value vs material actually consumed" />
      {rows.length === 0 ? (
        <EmptyState title="No jobs in this period" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th className="text-right">Contract</th>
                <th className="text-right">Quoted material</th>
                <th className="text-right">Actual material</th>
                <th className="text-right">Variance</th>
                <th className="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/jobs/${row.id}`} className="link">
                      {row.jobNumber}
                    </Link>
                    <p className="max-w-[200px] truncate text-xs text-slate-400">{row.title}</p>
                  </td>
                  <td className="max-w-[160px] truncate text-slate-600">{row.company}</td>
                  <td className="text-right">{money(row.contractTotal)}</td>
                  <td className="text-right text-slate-500">{money(row.quotedMaterialCost)}</td>
                  <td className="text-right text-slate-600">{money(row.actualMaterialCost)}</td>
                  <td
                    className={`text-right ${
                      row.materialVariance > 0 ? 'text-red-600' : row.materialVariance < 0 ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {row.materialVariance > 0 ? '+' : ''}
                    {money(row.materialVariance)}
                  </td>
                  <td className="text-right">
                    <span className="font-medium">{money(row.margin)}</span>
                    <span
                      className={`ml-1 text-xs ${
                        row.marginPct >= 50 ? 'text-emerald-600' : row.marginPct >= 30 ? 'text-amber-600' : 'text-red-600'
                      }`}
                    >
                      {number(row.marginPct, 1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        Margin here is contract value less material consumed through stock movements. It does not deduct
        shop labor, so treat it as a gross material margin.
      </p>
    </Card>
  );
}

function ReceivablesView() {
  const report = useQuery({
    queryKey: ['report', 'receivables'],
    queryFn: () => api.get<Receivables>('/reports/receivables'),
  });

  if (report.isLoading) return <Spinner />;
  if (report.error) return <ErrorNote error={report.error} />;
  const data = report.data!;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current" value={money(data.buckets.current ?? 0)} />
        <Stat label="1–30 days" value={money(data.buckets['1-30'] ?? 0)} tone="warning" />
        <Stat label="31–60 days" value={money(data.buckets['31-60'] ?? 0)} tone="warning" />
        <Stat label="60+ days" value={money(data.buckets['60+'] ?? 0)} tone="danger" />
      </div>

      <Card>
        <CardHeader title="Open invoices" />
        {data.invoices.length === 0 ? (
          <EmptyState title="Nothing outstanding" hint="Every invoice is settled." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Days overdue</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <Link to={`/invoices/${invoice.id}`} className="link">
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate">{invoice.company}</td>
                    <td className="text-slate-500">{invoice.job ?? '—'}</td>
                    <td className="text-right text-slate-600">{money(invoice.total)}</td>
                    <td className="text-right font-medium">{money(invoice.balance)}</td>
                    <td
                      className={`text-right ${
                        invoice.daysOverdue > 30
                          ? 'font-semibold text-red-600'
                          : invoice.daysOverdue > 0
                            ? 'text-amber-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {invoice.daysOverdue > 0 ? invoice.daysOverdue : 'Current'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
