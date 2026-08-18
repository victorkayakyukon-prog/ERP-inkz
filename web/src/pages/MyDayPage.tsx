import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardHeader, EmptyState, ErrorNote, JobStatusBadge, PageHeader, Spinner } from '../components/ui';
import { date, humanize, relative, today } from '../lib/format';
import type { Install, Job, Page, Task } from '../lib/types';
import { useAuth } from '../lib/auth';

/**
 * The one screen that works for every role: today's installs, your open jobs
 * and your open tasks. This is the install crew's landing page.
 */
export function MyDayPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();

  const installs = useQuery({
    queryKey: ['installs', 'my-day'],
    queryFn: () => api.get<Install[]>('/installs', { start: today(), days: 2, mine: user?.role === 'INSTALLER' }),
    enabled: can('install:read'),
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'my-day'],
    queryFn: () => api.get<Task[]>('/tasks', { mine: true, status: 'OPEN' }),
    enabled: can('crm:read'),
  });
  const jobs = useQuery({
    queryKey: ['jobs', 'my-day'],
    queryFn: () => api.get<Page<Job>>('/jobs', { open: true, ownerId: user?.id, pageSize: 25 }),
    enabled: can('job:read') && can('crm:read'),
  });

  const completeTask = useMutation({
    mutationFn: (taskId: string) => api.patch(`/tasks/${taskId}`, { status: 'DONE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const todayInstalls = (installs.data ?? []).filter(
    (install) => install.scheduledDate.slice(0, 10) === today(),
  );
  const tomorrowInstalls = (installs.data ?? []).filter(
    (install) => install.scheduledDate.slice(0, 10) !== today(),
  );

  return (
    <>
      <PageHeader
        title="My day"
        subtitle={new Date().toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
        })}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {can('install:read') ? (
          <Card className="lg:col-span-2">
            <CardHeader title={`Today's installs (${todayInstalls.length})`} />
            {installs.isLoading ? (
              <Spinner />
            ) : todayInstalls.length === 0 ? (
              <EmptyState title="No installs today" hint="Enjoy the shop time." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {todayInstalls.map((install) => (
                  <li key={install.id}>
                    <Link to={`/installs/${install.id}`} className="block px-4 py-3 hover:bg-slate-50">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-slate-900">
                            {install.job?.company?.name}
                          </p>
                          <p className="text-sm text-slate-600">
                            {[install.street, install.city].filter(Boolean).join(', ')}
                          </p>
                          <p className="text-xs text-slate-400">
                            {install.job?.jobNumber} · {install.job?.title}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-semibold text-brand-700">
                            {install.windowStart ? `${install.windowStart}–${install.windowEnd}` : 'Any time'}
                          </p>
                          <span className="badge bg-slate-100 text-slate-600">
                            {humanize(install.status)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {tomorrowInstalls.length ? (
              <div className="border-t border-slate-100 px-4 py-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Tomorrow
                </p>
                <ul className="space-y-1 text-sm">
                  {tomorrowInstalls.map((install) => (
                    <li key={install.id}>
                      <Link to={`/installs/${install.id}`} className="link">
                        {install.windowStart ?? ''} {install.job?.company?.name}
                      </Link>
                      <span className="text-slate-400"> — {install.city}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        ) : null}

        {can('crm:read') ? (
          <Card>
            <CardHeader title="My tasks" />
            {tasks.isLoading ? (
              <Spinner />
            ) : (tasks.data ?? []).length === 0 ? (
              <EmptyState title="Nothing on your list" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {(tasks.data ?? []).map((task) => {
                  const overdue = task.dueAt && new Date(task.dueAt) < new Date();
                  return (
                    <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                        onChange={() => completeTask.mutate(task.id)}
                        aria-label={`Complete ${task.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{task.title}</p>
                        <p className="text-xs text-slate-500">
                          {task.company ? (
                            <Link to={`/crm/companies/${task.company.id}`} className="link">
                              {task.company.name}
                            </Link>
                          ) : (
                            'General'
                          )}
                          {task.dueAt ? (
                            <span className={overdue ? ' font-medium text-red-600' : ''}>
                              {' '}
                              · due {relative(task.dueAt)}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <ErrorNote error={completeTask.error} />
          </Card>
        ) : null}

        {can('job:read') && can('crm:read') ? (
          <Card>
            <CardHeader title="My open jobs" />
            {jobs.isLoading ? (
              <Spinner />
            ) : (jobs.data?.data ?? []).length === 0 ? (
              <EmptyState title="No jobs assigned to you" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {(jobs.data?.data ?? []).map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/jobs/${job.id}`} className="link text-sm">
                        {job.jobNumber}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{job.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <JobStatusBadge status={job.status} />
                      {job.dueDate ? (
                        <p className="mt-0.5 text-xs text-slate-400">{date(job.dueDate)}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
