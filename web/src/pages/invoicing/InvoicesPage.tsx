import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, InvoiceStatusBadge, PageHeader, Spinner, Stat } from '../../components/ui';
import { date, humanize, money, relative } from '../../lib/format';
import type { Invoice, Page } from '../../lib/types';

export function InvoicesPage() {
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const invoices = useQuery({
    queryKey: ['invoices', status, overdue, search, page],
    queryFn: () =>
      api.get<Page<Invoice>>('/invoices', {
        status: status || undefined,
        overdue: overdue || undefined,
        q: search || undefined,
        page,
        pageSize: 25,
      }),
  });

  const rows = invoices.data?.data ?? [];
  const outstanding = rows.reduce((sum, invoice) => sum + invoice.balance, 0);
  const overdueTotal = rows
    .filter((invoice) => invoice.overdue)
    .reduce((sum, invoice) => sum + invoice.balance, 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle={invoices.data ? `${invoices.data.total} invoices` : undefined} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shown on this page" value={rows.length} />
        <Stat label="Outstanding" value={money(outstanding)} />
        <Stat label="Overdue" value={money(overdueTotal)} tone={overdueTotal > 0 ? 'danger' : 'default'} />
        <Stat
          label="Paid"
          value={rows.filter((invoice) => invoice.status === 'PAID').length}
          tone="positive"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-xs"
            placeholder="Search invoice number, customer or job…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex flex-wrap gap-1">
            {['', 'DRAFT', 'SENT', 'PARTIAL', 'PAID'].map((entry) => (
              <button
                key={entry || 'all'}
                type="button"
                onClick={() => {
                  setStatus(entry);
                  setOverdue(false);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  status === entry && !overdue
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {entry ? humanize(entry) : 'All'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOverdue(true);
                setStatus('');
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                overdue ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              Overdue
            </button>
          </div>
        </div>

        {invoices.isLoading ? (
          <Spinner />
        ) : invoices.error ? (
          <div className="p-4">
            <ErrorNote error={invoices.error} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No invoices here" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Job</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="whitespace-nowrap">
                      <Link to={`/invoices/${invoice.id}`} className="link">
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="max-w-[180px] truncate">{invoice.company?.name}</td>
                    <td>
                      {invoice.job ? (
                        <Link to={`/jobs/${invoice.job.id}`} className="link">
                          {invoice.job.jobNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-slate-500">{humanize(invoice.type)}</td>
                    <td>
                      <InvoiceStatusBadge status={invoice.status} overdue={invoice.overdue} />
                    </td>
                    <td
                      className={`whitespace-nowrap ${invoice.overdue ? 'font-medium text-red-600' : 'text-slate-500'}`}
                    >
                      {invoice.dueDate ? relative(invoice.dueDate) : '—'}
                    </td>
                    <td className="whitespace-nowrap text-right">{money(invoice.total)}</td>
                    <td className="whitespace-nowrap text-right font-medium">{money(invoice.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {invoices.data && invoices.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {invoices.data.page} of {invoices.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= invoices.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
