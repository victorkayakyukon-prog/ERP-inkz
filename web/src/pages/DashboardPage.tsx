import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardHeader, ErrorNote, PageHeader, Spinner, Stat } from '../components/ui';
import { money, moneyShort, number } from '../lib/format';
import type { DashboardData, Install, Task } from '../lib/types';
import { useAuth } from '../lib/auth';

interface BottleneckRow {
  status: string;
  label: string;
  count: number;
  avgDaysInStage: number;
  oldestDays: number;
}

export function DashboardPage() {
  const { user } = useAuth();

  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/reports/dashboard'),
  });
  const bottlenecks = useQuery({
    queryKey: ['bottlenecks'],
    queryFn: () => api.get<BottleneckRow[]>('/reports/bottlenecks'),
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => api.get<Task[]>('/tasks', { mine: true, status: 'OPEN' }),
  });
  const installs = useQuery({
    queryKey: ['installs', 'week'],
    queryFn: () => api.get<Install[]>('/installs', { days: 7 }),
  });

  if (dashboard.isLoading) return <Spinner label="Building your dashboard…" />;
  if (dashboard.error) return <ErrorNote error={dashboard.error} />;
  const data = dashboard.data!;

  const busiest = (bottlenecks.data ?? [])
    .filter((row) => row.count > 0)
    .sort((a, b) => b.avgDaysInStage - a.avgDaysInStage)[0];

  const overdueTasks = (tasks.data ?? []).filter(
    (task) => task.dueAt && new Date(task.dueAt) < new Date(),
  );

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0]}`}
        subtitle="Here's where the shop stands today."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Open pipeline"
          value={moneyShort(data.pipeline.openValue)}
          hint={`${data.pipeline.openCount} open opportunities`}
          to="/crm/pipeline"
        />
        <Stat
          label="Win rate (month)"
          value={`${data.pipeline.winRatePct}%`}
          hint={`${data.pipeline.wonThisMonth} won · ${data.pipeline.lostThisMonth} lost`}
          tone={data.pipeline.winRatePct >= 50 ? 'positive' : 'default'}
          to="/reports"
        />
        <Stat
          label="Open jobs"
          value={number(data.jobs.open, 0)}
          hint={`${data.jobs.dueThisWeek} due within 7 days`}
          to="/jobs/board"
        />
        <Stat
          label="Collected this month"
          value={moneyShort(data.money.revenueThisMonth)}
          hint={`${moneyShort(data.money.outstanding)} outstanding`}
          tone="positive"
          to="/invoices"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Jobs by stage"
            actions={
              <Link to="/jobs/board" className="link text-sm">
                Open board →
              </Link>
            }
          />
          <div className="p-4">
            {data.jobs.byStatus.every((row) => row.count === 0) ? (
              <p className="py-6 text-center text-sm text-slate-500">No open jobs right now.</p>
            ) : (
              <div className="space-y-2">
                {data.jobs.byStatus.map((row) => {
                  const max = Math.max(...data.jobs.byStatus.map((entry) => entry.count), 1);
                  const bottleneck = bottlenecks.data?.find((entry) => entry.status === row.status);
                  return (
                    <div key={row.status} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm text-slate-600">{row.label}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                          className="flex h-full items-center justify-end rounded bg-brand-500 px-2 text-xs font-medium text-white transition-all"
                          style={{ width: `${Math.max(row.count / max, row.count ? 0.08 : 0) * 100}%` }}
                        >
                          {row.count > 0 ? row.count : null}
                        </div>
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs text-slate-400">
                        {bottleneck && bottleneck.count > 0 ? `avg ${bottleneck.avgDaysInStage}d` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {busiest && busiest.avgDaysInStage >= 3 ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <strong>{busiest.label}</strong> is the slowest stage right now — {busiest.count} job
                {busiest.count === 1 ? '' : 's'} sitting an average of {busiest.avgDaysInStage} days, oldest{' '}
                {busiest.oldestDays} days.
              </p>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Money" />
            <dl className="divide-y divide-slate-100 text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-slate-600">Outstanding</dt>
                <dd className="font-medium">{money(data.money.outstanding)}</dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-slate-600">Overdue</dt>
                <dd className={`font-medium ${data.money.overdueAmount > 0 ? 'text-red-600' : ''}`}>
                  {money(data.money.overdueAmount)}
                  {data.money.overdueCount > 0 ? (
                    <span className="ml-1 text-xs text-slate-400">({data.money.overdueCount})</span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-slate-600">Low stock items</dt>
                <dd className={`font-medium ${data.inventory.lowStock > 0 ? 'text-amber-600' : ''}`}>
                  {data.inventory.lowStock} of {data.inventory.trackedMaterials}
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="My open tasks"
              actions={
                <Link to="/my-day" className="link text-sm">
                  All →
                </Link>
              }
            />
            {tasks.isLoading ? (
              <Spinner />
            ) : (tasks.data ?? []).length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing on your list.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(tasks.data ?? []).slice(0, 5).map((task) => (
                  <li key={task.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium text-slate-800">{task.title}</p>
                    <p className="text-xs text-slate-500">
                      {task.company?.name ?? task.job?.jobNumber ?? 'General'}
                      {task.dueAt ? (
                        <span
                          className={
                            new Date(task.dueAt) < new Date() ? ' font-medium text-red-600' : ''
                          }
                        >
                          {' '}
                          · due {new Date(task.dueAt).toLocaleDateString()}
                        </span>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {overdueTasks.length > 0 ? (
              <p className="border-t border-slate-100 px-4 py-2 text-xs font-medium text-red-600">
                {overdueTasks.length} task{overdueTasks.length === 1 ? '' : 's'} overdue
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Installs this week"
          actions={
            <Link to="/installs" className="link text-sm">
              Install schedule →
            </Link>
          }
        />
        {installs.isLoading ? (
          <Spinner />
        ) : (installs.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No installs booked this week.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Crew</th>
                  <th>Window</th>
                </tr>
              </thead>
              <tbody>
                {(installs.data ?? []).map((install) => (
                  <tr key={install.id}>
                    <td className="whitespace-nowrap">
                      {new Date(install.scheduledDate).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td>
                      <Link to={`/jobs/${install.jobId}`} className="link">
                        {install.job?.jobNumber}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate">{install.job?.company?.name}</td>
                    <td className="max-w-[220px] truncate text-slate-500">
                      {[install.street, install.city].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td>{install.crew?.name ?? <span className="text-amber-600">Unassigned</span>}</td>
                    <td className="whitespace-nowrap text-slate-500">
                      {install.windowStart ? `${install.windowStart}–${install.windowEnd}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
