import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { addDays, humanize, today } from '../../lib/format';
import type { Install, Job, Page, Resource } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const STATUS_TONES: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  EN_ROUTE: 'bg-purple-100 text-purple-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  RESCHEDULED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

/** Day-by-day install schedule, grouped so a crew can read its route. */
export function InstallsPage() {
  const { can, user } = useAuth();
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(7);
  const [crewId, setCrewId] = useState('');
  const [mine, setMine] = useState(user?.role === 'INSTALLER');
  const [scheduling, setScheduling] = useState(false);

  const installs = useQuery({
    queryKey: ['installs', start, days, crewId, mine],
    queryFn: () =>
      api.get<Install[]>('/installs', {
        start,
        days,
        crewId: crewId || undefined,
        mine: mine || undefined,
      }),
  });
  const crews = useQuery({
    queryKey: ['resources', 'crews'],
    queryFn: () => api.get<Resource[]>('/resources', { type: 'INSTALL_CREW' }),
  });

  const byDate = new Map<string, Install[]>();
  for (const install of installs.data ?? []) {
    const key = install.scheduledDate.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), install]);
  }

  return (
    <>
      <PageHeader
        title="Install schedule"
        subtitle={`${installs.data?.length ?? 0} install${installs.data?.length === 1 ? '' : 's'} in this window`}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setStart(addDays(start, -days))}>
              ←
            </button>
            <input
              type="date"
              className="input w-auto py-1.5"
              value={start}
              onChange={(event) => setStart(event.target.value || today())}
            />
            <button type="button" className="btn-secondary" onClick={() => setStart(addDays(start, days))}>
              →
            </button>
            <select
              className="input w-auto py-1.5"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={1}>Today</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>1 month</option>
            </select>
            {can('install:write') ? (
              <button type="button" className="btn-primary" onClick={() => setScheduling(true)}>
                Schedule install
              </button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          className="input w-auto py-1.5"
          value={crewId}
          onChange={(event) => {
            setCrewId(event.target.value);
            setMine(false);
          }}
        >
          <option value="">All crews</option>
          {(crews.data ?? []).map((crew) => (
            <option key={crew.id} value={crew.id}>
              {crew.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={mine}
            onChange={(event) => {
              setMine(event.target.checked);
              if (event.target.checked) setCrewId('');
            }}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          My crew only
        </label>
      </div>

      {installs.isLoading ? (
        <Spinner />
      ) : installs.error ? (
        <ErrorNote error={installs.error} />
      ) : byDate.size === 0 ? (
        <Card>
          <EmptyState title="No installs scheduled" hint="Nothing booked in this window." />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byDate.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateKey, dayInstalls]) => (
              <section key={dateKey}>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  {new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                  {dateKey === today() ? (
                    <span className="badge ml-2 bg-brand-100 text-brand-700">Today</span>
                  ) : null}
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {dayInstalls.map((install) => (
                    <Link
                      key={install.id}
                      to={`/installs/${install.id}`}
                      className="card block p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {install.job?.jobNumber} — {install.job?.company?.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">{install.job?.title}</p>
                        </div>
                        <span className={`badge shrink-0 ${STATUS_TONES[install.status]}`}>
                          {humanize(install.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {install.windowStart ? `${install.windowStart} – ${install.windowEnd}` : 'No time window'}
                      </p>
                      <p className="text-sm text-slate-600">
                        {[install.street, install.city, install.state].filter(Boolean).join(', ') || 'No address'}
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        {install.crew?.name ?? 'Unassigned crew'}
                        {install.contactName ? ` · ${install.contactName}` : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <ScheduleInstallModal open={scheduling} onClose={() => setScheduling(false)} />
    </>
  );
}

function ScheduleInstallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    jobId: '',
    crewId: '',
    scheduledDate: today(),
    windowStart: '08:00',
    windowEnd: '12:00',
    notes: '',
  });

  const jobs = useQuery({
    queryKey: ['jobs', 'installable'],
    queryFn: () => api.get<Page<Job>>('/jobs', { open: true, pageSize: 100 }),
    enabled: open,
  });
  const crews = useQuery({
    queryKey: ['resources', 'crews'],
    queryFn: () => api.get<Resource[]>('/resources', { type: 'INSTALL_CREW' }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/installs', {
        jobId: form.jobId,
        crewId: form.crewId || undefined,
        scheduledDate: form.scheduledDate,
        windowStart: form.windowStart || undefined,
        windowEnd: form.windowEnd || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installs'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule an install"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.jobId || create.isPending}
            onClick={() => create.mutate()}
          >
            Schedule
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Job" hint="The site address is copied from the job">
          <select
            className="input"
            value={form.jobId}
            onChange={(event) => setForm({ ...form, jobId: event.target.value })}
          >
            <option value="">Select a job…</option>
            {(jobs.data?.data ?? []).map((job) => (
              <option key={job.id} value={job.id}>
                {job.jobNumber} — {job.company?.name} — {job.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Crew">
          <select
            className="input"
            value={form.crewId}
            onChange={(event) => setForm({ ...form, crewId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {(crews.data ?? []).map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <input
              type="date"
              className="input"
              value={form.scheduledDate}
              onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
            />
          </Field>
          <Field label="From">
            <input
              type="time"
              className="input"
              value={form.windowStart}
              onChange={(event) => setForm({ ...form, windowStart: event.target.value })}
            />
          </Field>
          <Field label="To">
            <input
              type="time"
              className="input"
              value={form.windowEnd}
              onChange={(event) => setForm({ ...form, windowEnd: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Notes for the crew">
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Park behind the building, ask for the manager at the desk…"
          />
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
