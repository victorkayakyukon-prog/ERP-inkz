import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import type { Company, CurrentUser, Page } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function CompaniesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const companies = useQuery({
    queryKey: ['companies', search, page],
    queryFn: () => api.get<Page<Company>>('/companies', { q: search || undefined, page, pageSize: 25 }),
  });

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={companies.data ? `${companies.data.total} on file` : undefined}
        actions={
          can('crm:write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              New customer
            </button>
          ) : null
        }
      />

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-sm"
            placeholder="Search by name, email, phone or contact…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {companies.isLoading ? (
          <Spinner />
        ) : companies.error ? (
          <div className="p-4">
            <ErrorNote error={companies.error} />
          </div>
        ) : companies.data!.data.length === 0 ? (
          <EmptyState
            title="No customers found"
            hint={search ? `Nothing matches “${search}”.` : 'Add your first customer to get started.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact info</th>
                  <th>Tags</th>
                  <th>Rep</th>
                  <th className="text-right">Jobs</th>
                </tr>
              </thead>
              <tbody>
                {companies.data!.data.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <Link to={`/crm/companies/${company.id}`} className="link">
                        {company.name}
                      </Link>
                      {company.industry ? (
                        <p className="text-xs text-slate-400">{company.industry}</p>
                      ) : null}
                    </td>
                    <td className="text-slate-600">
                      <p>{company.phone ?? '—'}</p>
                      <p className="text-xs text-slate-400">{company.email ?? ''}</p>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {company.tags.map((tag) => (
                          <span key={tag} className="badge bg-slate-100 text-slate-600">
                            {tag}
                          </span>
                        ))}
                        {company.taxExempt ? (
                          <span className="badge bg-purple-100 text-purple-700">tax exempt</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-slate-600">{company.owner?.name ?? '—'}</td>
                    <td className="text-right text-slate-600">{company._count?.jobs ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {companies.data && companies.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {companies.data.page} of {companies.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= companies.data.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <CompanyModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function CompanyModal({
  open,
  onClose,
  company,
}: {
  open: boolean;
  onClose: () => void;
  company?: Company;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: company?.name ?? '',
    industry: company?.industry ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
    website: company?.website ?? '',
    tags: company?.tags.join(', ') ?? '',
    billingStreet: company?.billingStreet ?? '',
    billingCity: company?.billingCity ?? '',
    billingState: company?.billingState ?? '',
    billingZip: company?.billingZip ?? '',
    taxExempt: company?.taxExempt ?? false,
    ownerId: company?.ownerId ?? '',
    notes: company?.notes ?? '',
  });

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<CurrentUser[]>('/auth/users'),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        ownerId: form.ownerId || null,
      };
      return company
        ? api.patch(`/companies/${company.id}`, payload)
        : api.post('/companies', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={company ? `Edit ${company.name}` : 'New customer'}
      wide
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.name || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" className="sm:col-span-2">
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Industry">
          <input
            className="input"
            value={form.industry}
            onChange={(event) => setForm({ ...form, industry: event.target.value })}
          />
        </Field>
        <Field label="Assigned rep">
          <select
            className="input"
            value={form.ownerId}
            onChange={(event) => setForm({ ...form, ownerId: event.target.value })}
          >
            <option value="">Unassigned</option>
            {(users.data ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input
            className="input"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Website" className="sm:col-span-2">
          <input
            className="input"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
          />
        </Field>
        <Field label="Street" className="sm:col-span-2">
          <input
            className="input"
            value={form.billingStreet}
            onChange={(event) => setForm({ ...form, billingStreet: event.target.value })}
          />
        </Field>
        <Field label="City">
          <input
            className="input"
            value={form.billingCity}
            onChange={(event) => setForm({ ...form, billingCity: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State">
            <input
              className="input"
              value={form.billingState}
              onChange={(event) => setForm({ ...form, billingState: event.target.value })}
            />
          </Field>
          <Field label="ZIP">
            <input
              className="input"
              value={form.billingZip}
              onChange={(event) => setForm({ ...form, billingZip: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Tags" hint="Comma separated" className="sm:col-span-2">
          <input
            className="input"
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder="repeat, wraps, ada"
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.taxExempt}
            onChange={(event) => setForm({ ...form, taxExempt: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          Tax exempt (quotes and invoices bill at 0%)
        </label>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error} />
        </div>
      </div>
    </Modal>
  );
}
