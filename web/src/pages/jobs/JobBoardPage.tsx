import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { ErrorNote, PageHeader, PriorityBadge, Spinner } from '../../components/ui';
import { moneyShort, relative } from '../../lib/format';
import type { Job, JobStatus } from '../../lib/types';
import { useAuth } from '../../lib/auth';

interface BoardColumn {
  status: JobStatus;
  label: string;
  jobs: Array<Job & { daysInStage: number }>;
}

/**
 * The shop board. Cards drag between stages; the server rejects an illegal
 * jump, and the error surfaces above the board rather than silently failing.
 */
export function JobBoardPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<JobStatus | null>(null);

  const board = useQuery({
    queryKey: ['job-board'],
    queryFn: () => api.get<BoardColumn[]>('/jobs/board'),
  });

  const move = useMutation({
    mutationFn: (input: { id: string; status: JobStatus }) =>
      api.post(`/jobs/${input.id}/status`, { status: input.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-board'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (board.isLoading) return <Spinner label="Loading the shop board…" />;
  if (board.error) return <ErrorNote error={board.error} />;

  const columns = board.data ?? [];
  const total = columns.reduce((sum, column) => sum + column.jobs.length, 0);

  return (
    <>
      <PageHeader
        title="Job board"
        subtitle={`${total} open job${total === 1 ? '' : 's'} across the shop`}
        actions={
          <Link to="/jobs" className="btn-secondary">
            List view
          </Link>
        }
      />

      {move.error ? (
        <div className="mb-3">
          <ErrorNote error={move.error} />
        </div>
      ) : null}

      <div className="-mx-3 overflow-x-auto px-3 pb-2">
        <div className="flex min-w-max gap-3">
          {columns.map((column) => (
            <div
              key={column.status}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(column.status);
              }}
              onDragLeave={() => setDragOver((current) => (current === column.status ? null : current))}
              onDrop={() => {
                setDragOver(null);
                if (dragging) move.mutate({ id: dragging, status: column.status });
                setDragging(null);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-slate-50 ${
                dragOver === column.status ? 'border-brand-400 bg-brand-50' : 'border-slate-200'
              }`}
            >
              <div className="flex items-baseline justify-between border-b border-slate-200 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{column.label}</span>
                <span className="text-xs text-slate-500">{column.jobs.length}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {column.jobs.map((job) => {
                  const overdue = job.dueDate && new Date(job.dueDate) < new Date();
                  return (
                    <article
                      key={job.id}
                      draggable={can('job:stage')}
                      onDragStart={() => setDragging(job.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`card p-3 ${can('job:stage') ? 'cursor-grab active:cursor-grabbing' : ''} ${
                        dragging === job.id ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/jobs/${job.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                          {job.jobNumber}
                        </Link>
                        <PriorityBadge priority={job.priority} />
                      </div>
                      <p className="mt-1 text-sm font-medium leading-snug text-slate-900">{job.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{job.company?.name}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className={overdue ? 'font-medium text-red-600' : 'text-slate-400'}>
                          {job.dueDate ? `Due ${relative(job.dueDate)}` : 'No due date'}
                        </span>
                        {job.contractTotal !== undefined ? (
                          <span className="text-slate-500">{moneyShort(job.contractTotal)}</span>
                        ) : null}
                      </div>
                      {job.daysInStage >= 3 ? (
                        <p className="mt-1 text-xs text-amber-600">{job.daysInStage} days in this stage</p>
                      ) : null}
                    </article>
                  );
                })}
                {column.jobs.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-400">Empty</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {can('job:stage')
          ? 'Drag a card to the next stage. Jobs move one stage forward at a time, but can be sent back or put on hold from anywhere.'
          : 'You have read-only access to the board.'}
      </p>
    </>
  );
}
