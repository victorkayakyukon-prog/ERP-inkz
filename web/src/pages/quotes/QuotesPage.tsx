import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, QuoteStatusBadge, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, money } from '../../lib/format';
import type { Company, Contact, Opportunity, Page, Quote, QuoteStatus } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const STATUS_FILTERS: Array<{ value: '' | QuoteStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
];

export function QuotesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState<'' | QuoteStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const quotes = useQuery({
    queryKey: ['quotes', status, search, page],
    queryFn: () =>
      api.get<Page<Quote>>('/quotes', {
        status: status || undefined,
        q: search || undefined,
        page,
        pageSize: 25,
      }),
  });

  return (
    <>
      <PageHeader
        title="Quotes"
        subtitle={quotes.data ? `${quotes.data.total} quotes` : undefined}
        actions={
          can('quote:write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              New quote
            </button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-xs"
            placeholder="Search quote number, title or customer…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setStatus(filter.value);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  status === filter.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {quotes.isLoading ? (
          <Spinner />
        ) : quotes.error ? (
          <div className="p-4">
            <ErrorNote error={quotes.error} />
          </div>
        ) : quotes.data!.data.length === 0 ? (
          <EmptyState title="No quotes here" hint="Start one from a customer or an opportunity." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quote</th>
                  <th>Customer</th>
                  <th>Title</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {quotes.data!.data.map((quote) => (
                  <tr key={quote.id}>
                    <td className="whitespace-nowrap">
                      <Link to={`/quotes/${quote.id}`} className="link">
                        {quote.number}
                      </Link>
                      {quote.version > 1 ? (
                        <span className="ml-1 text-xs text-slate-400">v{quote.version}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[180px] truncate">
                      <Link to={`/crm/companies/${quote.companyId}`} className="link">
                        {quote.company?.name}
                      </Link>
                    </td>
                    <td className="max-w-[240px] truncate text-slate-600">{quote.title}</td>
                    <td className="text-right text-slate-500">{quote._count?.items ?? '—'}</td>
                    <td className="whitespace-nowrap text-right font-medium">{money(quote.total)}</td>
                    <td>
                      <QuoteStatusBadge status={quote.status} />
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{date(quote.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {quotes.data && quotes.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {quotes.data.page} of {quotes.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= quotes.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <NewQuoteModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewQuoteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', companyId: '', contactId: '', opportunityId: '' });

  const companies = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => api.get<Page<Company>>('/companies', { pageSize: 200 }),
    enabled: open,
  });
  const contacts = useQuery({
    queryKey: ['contacts', form.companyId],
    queryFn: () => api.get<Page<Contact>>('/contacts', { companyId: form.companyId, pageSize: 100 }),
    enabled: open && !!form.companyId,
  });
  const opportunities = useQuery({
    queryKey: ['opportunities', 'for-quote'],
    queryFn: () => api.get<Opportunity[]>('/opportunities'),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Quote>('/quotes', {
        title: form.title,
        companyId: form.companyId,
        contactId: form.contactId || undefined,
        opportunityId: form.opportunityId || undefined,
        items: [],
      }),
    onSuccess: (quote) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onClose();
      navigate(`/quotes/${quote.id}`);
    },
  });

  const companyOpportunities = (opportunities.data ?? []).filter(
    (opportunity) => opportunity.companyId === form.companyId,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New quote"
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
            {create.isPending ? 'Creating…' : 'Create and add lines'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Quote title">
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Storefront channel letters"
          />
        </Field>
        <Field label="Customer">
          <select
            className="input"
            value={form.companyId}
            onChange={(event) => setForm({ ...form, companyId: event.target.value, contactId: '', opportunityId: '' })}
          >
            <option value="">Select a customer…</option>
            {(companies.data?.data ?? []).map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </Field>
        {form.companyId ? (
          <>
            <Field label="Contact">
              <select
                className="input"
                value={form.contactId}
                onChange={(event) => setForm({ ...form, contactId: event.target.value })}
              >
                <option value="">—</option>
                {(contacts.data?.data ?? []).map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                  </option>
                ))}
              </select>
            </Field>
            {companyOpportunities.length ? (
              <Field label="Link to opportunity" hint="Moves the lead to Quoted">
                <select
                  className="input"
                  value={form.opportunityId}
                  onChange={(event) => setForm({ ...form, opportunityId: event.target.value })}
                >
                  <option value="">—</option>
                  {companyOpportunities.map((opportunity) => (
                    <option key={opportunity.id} value={opportunity.id}>
                      {opportunity.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </>
        ) : null}
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
