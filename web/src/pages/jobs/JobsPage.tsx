import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Card, EmptyState, ErrorNote, Field, JobStatusBadge, PageHeader, PriorityBadge, Spinner,
} from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, money, relative } from '../../lib/format';
import type { Company, Job, Page } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function JobsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const jobs = useQuery({
    queryKey: ['jobs', search, openOnly, page],
    queryFn: () =>
      api.get<Page<Job>>('/jobs', {
        q: search || undefined,
        open: openOnly || undefined,
        page,
        pageSize: 25,
      }),
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={jobs.data ? `${jobs.data.total} job${jobs.data.total === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <Link to="/jobs/board" className="btn-secondary">
              Board view
            </Link>
            {can('job:write') ? (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                New job
              </button>
            ) : null}
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-xs"
            placeholder="Search job number, title or customer…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(event) => {
                setOpenOnly(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Open jobs only
          </label>
        </div>

        {jobs.isLoading ? (
          <Spinner />
        ) : jobs.error ? (
          <div className="p-4">
            <ErrorNote error={jobs.error} />
          </div>
        ) : jobs.data!.data.length === 0 ? (
          <EmptyState title="No jobs found" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Customer</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Owner</th>
                  {can('pricing:read') ? <th className="text-right">Contract</th> : null}
                </tr>
              </thead>
              <tbody>
                {jobs.data!.data.map((job) => {
                  const overdue =
                    job.dueDate && new Date(job.dueDate) < new Date() && job.status !== 'CLOSED';
                  return (
                    <tr key={job.id}>
                      <td className="whitespace-nowrap">
                        <Link to={`/jobs/${job.id}`} className="link">
                          {job.jobNumber}
                        </Link>
                      </td>
                      <td className="max-w-[180px] truncate">{job.company?.name}</td>
                      <td className="max-w-[260px] truncate text-slate-600">
                        {job.title}
                        <PriorityBadge priority={job.priority} />
                      </td>
                      <td>
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className={`whitespace-nowrap ${overdue ? 'font-medium text-red-600' : 'text-slate-500'}`}>
                        {job.dueDate ? relative(job.dueDate) : '—'}
                      </td>
                      <td className="whitespace-nowrap text-slate-500">{job.owner?.name ?? '—'}</td>
                      {can('pricing:read') ? (
                        <td className="whitespace-nowrap text-right font-medium">{money(job.contractTotal)}</td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {jobs.data && jobs.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {jobs.data.page} of {jobs.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= jobs.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <NewJobModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    companyId: '',
    priority: 'NORMAL',
    dueDate: '',
    installRequired: false,
    description: '',
  });

  const companies = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => api.get<Page<Company>>('/companies', { pageSize: 200 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Job>('/jobs', {
        title: form.title,
        companyId: form.companyId,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        installRequired: form.installRequired,
        description: form.description || undefined,
      }),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job-board'] });
      onClose();
      navigate(`/jobs/${job.id}`);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New job"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.title || !form.companyId || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create job'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Most jobs come from accepting a quote. Use this for walk-ins and rework that never had one.
        </p>
        <Field label="Job title">
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label="Customer">
          <select
            className="input"
            value={form.companyId}
            onChange={(event) => setForm({ ...form, companyId: event.target.value })}
          >
            <option value="">Select a customer…</option>
            {(companies.data?.data ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <select
              className="input"
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
            >
              {['LOW', 'NORMAL', 'HIGH', 'RUSH'].map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0] + priority.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              className="input"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={form.installRequired}
            onChange={(event) => setForm({ ...form, installRequired: event.target.checked })}
          />
          Install required
        </label>
        <Field label="Description">
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
