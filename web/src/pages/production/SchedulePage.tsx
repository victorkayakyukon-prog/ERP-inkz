import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, CardHeader, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { addDays, today } from '../../lib/format';
import type { Job, Resource, ScheduleBoard } from '../../lib/types';
import { useAuth } from '../../lib/auth';

/**
 * Shop schedule: resources down the side, days across the top. Entries drag
 * between cells; a cell turns amber when the day exceeds that machine's
 * capacity, which is the overbooking signal the shop actually needs.
 */
export function SchedulePage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [start, setStart] = useState(today());
  const [days, setDays] = useState(7);
  const [dragging, setDragging] = useState<{ entryId: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<Job | null>(null);

  const board = useQuery({
    queryKey: ['schedule', start, days],
    queryFn: () => api.get<ScheduleBoard>('/schedule', { start, days }),
  });

  const moveEntry = useMutation({
    mutationFn: (input: { id: string; resourceId: string; scheduledDate: string }) =>
      api.patch(`/schedule/${input.id}`, {
        resourceId: input.resourceId,
        scheduledDate: input.scheduledDate,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedule'] }),
  });
  const removeEntry = useMutation({
    mutationFn: (id: string) => api.delete(`/schedule/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedule'] }),
  });

  if (board.isLoading) return <Spinner label="Loading the shop schedule…" />;
  if (board.error) return <ErrorNote error={board.error} />;
  const data = board.data!;

  const overbookedDays = data.board.flatMap((row) => row.days.filter((day) => day.overbooked)).length;

  return (
    <>
      <PageHeader
        title="Shop schedule"
        subtitle={
          overbookedDays > 0
            ? `${overbookedDays} machine-day${overbookedDays === 1 ? '' : 's'} over capacity`
            : 'Everything is within capacity'
        }
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
              <option value={5}>5 days</option>
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
            </select>
            <button type="button" className="btn-secondary" onClick={() => setStart(today())}>
              Today
            </button>
          </>
        }
      />

      <ErrorNote error={moveEntry.error} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Resource
                </th>
                {data.dates.map((dateValue) => {
                  const parsed = new Date(`${dateValue}T00:00:00`);
                  const isToday = dateValue === today();
                  const weekend = parsed.getDay() === 0 || parsed.getDay() === 6;
                  return (
                    <th
                      key={dateValue}
                      className={`border-b border-slate-200 px-2 py-2 text-center text-xs font-semibold ${
                        isToday ? 'bg-brand-50 text-brand-700' : weekend ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      <div>{parsed.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="font-normal">
                        {parsed.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.board.map((row) => (
                <tr key={row.resource.id}>
                  <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-2 text-left align-top">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: row.resource.color }}
                      />
                      <span className="text-sm font-medium text-slate-800">{row.resource.name}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {row.resource.capacityPerDay}/day capacity
                    </span>
                  </th>
                  {row.days.map((day) => {
                    const cellKey = `${row.resource.id}:${day.date}`;
                    return (
                      <td
                        key={cellKey}
                        onDragOver={(event) => {
                          if (!can('production:write')) return;
                          event.preventDefault();
                          setDragOver(cellKey);
                        }}
                        onDragLeave={() => setDragOver((current) => (current === cellKey ? null : current))}
                        onDrop={() => {
                          setDragOver(null);
                          if (dragging) {
                            moveEntry.mutate({
                              id: dragging.entryId,
                              resourceId: row.resource.id,
                              scheduledDate: day.date,
                            });
                          }
                          setDragging(null);
                        }}
                        className={`min-w-[130px] border-b border-r border-slate-100 p-1.5 align-top ${
                          dragOver === cellKey
                            ? 'bg-brand-50'
                            : day.overbooked
                              ? 'bg-amber-50'
                              : ''
                        }`}
                      >
                        <div className="flex flex-col gap-1">
                          {day.entries.map((entry) => (
                            <div
                              key={entry.id}
                              draggable={can('production:write')}
                              onDragStart={() => setDragging({ entryId: entry.id })}
                              onDragEnd={() => setDragging(null)}
                              className={`group rounded border-l-4 bg-white px-1.5 py-1 text-xs shadow-sm ${
                                can('production:write') ? 'cursor-grab active:cursor-grabbing' : ''
                              }`}
                              style={{ borderLeftColor: row.resource.color }}
                            >
                              <Link
                                to={`/jobs/${entry.jobId}`}
                                className="block truncate font-semibold text-brand-700"
                              >
                                {entry.job?.jobNumber}
                              </Link>
                              <p className="truncate text-slate-600">{entry.job?.title}</p>
                              <p className="flex items-center justify-between text-slate-400">
                                <span>{entry.durationHours}h</span>
                                {can('production:write') ? (
                                  <button
                                    type="button"
                                    className="opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                                    onClick={() => removeEntry.mutate(entry.id)}
                                    aria-label="Remove from schedule"
                                  >
                                    ✕
                                  </button>
                                ) : null}
                              </p>
                            </div>
                          ))}
                          {day.overbooked ? (
                            <p className="text-center text-[10px] font-medium text-amber-700">
                              {day.load}/{day.capacity} over
                            </p>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={`Waiting to be scheduled (${data.unscheduled.length})`}
        />
        {data.unscheduled.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            Every job in a shop stage is on the board.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 p-4">
            {data.unscheduled.map((job) => (
              <li key={job.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <div>
                  <Link to={`/jobs/${job.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                    {job.jobNumber}
                  </Link>
                  <p className="max-w-[200px] truncate text-xs text-slate-600">{job.title}</p>
                  <p className="text-xs text-slate-400">{job.company?.name}</p>
                </div>
                {can('production:write') ? (
                  <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setScheduling(job)}>
                    Schedule
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-400">
        Drag a card between machines or days to reschedule. Amber cells are booked past that machine's
        daily capacity.
      </p>

      {scheduling ? <ScheduleModal job={scheduling} onClose={() => setScheduling(null)} /> : null}
    </>
  );
}

function ScheduleModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    resourceId: '',
    scheduledDate: today(),
    durationHours: '2',
    stage: 'PRODUCTION',
  });

  const resources = useQuery({
    queryKey: ['resources'],
    queryFn: () => api.get<Resource[]>('/resources'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/schedule', {
        jobId: job.id,
        resourceId: form.resourceId,
        scheduledDate: form.scheduledDate,
        durationHours: Number(form.durationHours),
        stage: form.stage,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Schedule ${job.jobNumber}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.resourceId || create.isPending}
            onClick={() => create.mutate()}
          >
            Schedule
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Resource">
          <select
            className="input"
            value={form.resourceId}
            onChange={(event) => setForm({ ...form, resourceId: event.target.value })}
          >
            <option value="">Select a machine or bench…</option>
            {(resources.data ?? [])
              .filter((resource) => resource.type !== 'INSTALL_CREW')
              .map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              className="input"
              value={form.scheduledDate}
              onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
            />
          </Field>
          <Field label="Hours">
            <input
              type="number"
              step="0.5"
              className="input"
              value={form.durationHours}
              onChange={(event) => setForm({ ...form, durationHours: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Stage">
          <select
            className="input"
            value={form.stage}
            onChange={(event) => setForm({ ...form, stage: event.target.value })}
          >
            {['PRODUCTION', 'FINISHING', 'QC'].map((stage) => (
              <option key={stage} value={stage}>
                {stage[0] + stage.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
