import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Card, CardHeader, EmptyState, ErrorNote, Field, InvoiceStatusBadge, PageHeader, Spinner,
} from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, dateTime, humanize, money, number, relative } from '../../lib/format';
import type { Invoice } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [addingLine, setAddingLine] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);

  const invoice = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<Invoice>(`/invoices/${id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const send = useMutation({ mutationFn: () => api.post(`/invoices/${id}/send`), onSuccess: invalidate });
  const voidInvoice = useMutation({ mutationFn: () => api.post(`/invoices/${id}/void`), onSuccess: invalidate });
  const removeLine = useMutation({
    mutationFn: (itemId: string) => api.delete(`/invoices/${id}/items/${itemId}`),
    onSuccess: invalidate,
  });
  const removePayment = useMutation({
    mutationFn: (paymentId: string) => api.delete(`/invoices/${id}/payments/${paymentId}`),
    onSuccess: invalidate,
  });

  if (invoice.isLoading) return <Spinner />;
  if (invoice.error) return <ErrorNote error={invoice.error} />;
  const record = invoice.data!;
  const editable = can('invoice:write') && record.status === 'DRAFT';

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {record.number}
            <InvoiceStatusBadge status={record.status} overdue={record.overdue} />
          </span>
        }
        subtitle={
          <>
            <Link to={`/crm/companies/${record.companyId}`} className="link">
              {record.company.name}
            </Link>
            {record.job ? (
              <>
                {' · '}
                <Link to={`/jobs/${record.job.id}`} className="link">
                  {record.job.jobNumber}
                </Link>
              </>
            ) : null}
            {' · '}
            {humanize(record.type)} invoice
          </>
        }
        actions={
          can('invoice:write') ? (
            <>
              {record.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!record.items.length || send.isPending}
                  onClick={() => send.mutate()}
                >
                  Send invoice
                </button>
              ) : null}
              {record.balance > 0 && record.status !== 'DRAFT' && record.status !== 'VOID' ? (
                <button type="button" className="btn-primary" onClick={() => setRecordingPayment(true)}>
                  Record payment
                </button>
              ) : null}
              {record.status !== 'PAID' && record.status !== 'VOID' && !record.payments.length ? (
                <button type="button" className="btn-danger" onClick={() => voidInvoice.mutate()}>
                  Void
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      {record.overdue ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Overdue — {money(record.balance)} was due {relative(record.dueDate)}.
        </div>
      ) : null}
      <ErrorNote error={send.error ?? voidInvoice.error ?? removeLine.error ?? removePayment.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Lines"
              actions={
                editable ? (
                  <button type="button" className="btn-secondary py-1" onClick={() => setAddingLine(true)}>
                    Add line
                  </button>
                ) : null
              }
            />
            {record.items.length === 0 ? (
              <EmptyState title="No lines yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Unit price</th>
                      <th className="text-right">Amount</th>
                      {editable ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {record.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.description}
                          {!item.taxable ? (
                            <span className="badge ml-2 bg-slate-100 text-slate-500">non-taxable</span>
                          ) : null}
                        </td>
                        <td className="text-right">{number(item.quantity, 2)}</td>
                        <td className="text-right text-slate-600">{money(item.unitPrice)}</td>
                        <td className="text-right font-medium">{money(item.amount)}</td>
                        {editable ? (
                          <td className="text-right">
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-700"
                              onClick={() => removeLine.mutate(item.id)}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <dl className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal</dt>
                <dd>{money(record.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Tax ({record.taxRatePct}%)</dt>
                <dd>{money(record.taxAmount)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(record.total)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Paid</dt>
                <dd>−{money(record.amountPaid)}</dd>
              </div>
              <div
                className={`flex justify-between text-base font-semibold ${
                  record.balance > 0 ? 'text-slate-900' : 'text-emerald-600'
                }`}
              >
                <dt>Balance due</dt>
                <dd>{money(record.balance)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            {record.payments.length === 0 ? (
              <EmptyState title="No payments recorded" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th className="text-right">Amount</th>
                      <th>Recorded by</th>
                      {can('invoice:write') ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {record.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="whitespace-nowrap">{date(payment.receivedAt)}</td>
                        <td>{humanize(payment.method)}</td>
                        <td className="text-slate-500">{payment.reference ?? '—'}</td>
                        <td className="text-right font-medium">{money(payment.amount)}</td>
                        <td className="text-slate-500">{payment.user?.name ?? '—'}</td>
                        {can('invoice:write') ? (
                          <td className="text-right">
                            <button
                              type="button"
                              className="text-xs text-red-500 hover:text-red-700"
                              onClick={() => removePayment.mutate(payment.id)}
                            >
                              Remove
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Issued" value={date(record.issueDate)} />
              <Row label="Due" value={record.dueDate ? date(record.dueDate) : '—'} />
              <Row label="Terms" value={record.terms ?? '—'} />
              <Row label="Sent" value={record.sentAt ? dateTime(record.sentAt) : 'Not sent'} />
              <Row label="Paid in full" value={record.paidAt ? date(record.paidAt) : '—'} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Bill to" />
            <div className="px-4 py-3 text-sm text-slate-700">
              <p className="font-medium">{record.company.name}</p>
              <p>{record.company.billingStreet}</p>
              <p>
                {[record.company.billingCity, record.company.billingState, record.company.billingZip]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {record.company.email ? <p className="mt-1 text-slate-500">{record.company.email}</p> : null}
            </div>
          </Card>

          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            Emailing invoices and taking card payments online are integration points, not built-in — see
            docs/INTEGRATIONS.md for the Stripe and QuickBooks hooks.
          </p>
        </div>
      </div>

      {addingLine ? <LineModal invoiceId={record.id} onClose={() => setAddingLine(false)} /> : null}
      {recordingPayment ? (
        <PaymentModal invoice={record} onClose={() => setRecordingPayment(false)} />
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function LineModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ description: '', quantity: '1', unitPrice: '', taxable: true });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoiceId}/items`, {
        description: form.description,
        quantity: Number(form.quantity || 1),
        unitPrice: Number(form.unitPrice || 0),
        taxable: form.taxable,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Add invoice line"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.description || create.isPending}
            onClick={() => create.mutate()}
          >
            Add
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Description">
          <input
            className="input"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.quantity}
              onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            />
          </Field>
          <Field label="Unit price">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.unitPrice}
              onChange={(event) => setForm({ ...form, unitPrice: event.target.value })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.taxable}
            onChange={(event) => setForm({ ...form, taxable: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          Taxable
        </label>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}

function PaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    amount: String(invoice.balance),
    method: 'CHECK',
    reference: '',
    receivedAt: new Date().toISOString().slice(0, 10),
  });

  const record = useMutation({
    mutationFn: () =>
      api.post(`/invoices/${invoice.id}/payments`, {
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference || undefined,
        receivedAt: form.receivedAt || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!Number(form.amount) || record.isPending}
            onClick={() => record.mutate()}
          >
            Record payment
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Balance due: <strong>{money(invoice.balance)}</strong>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </Field>
          <Field label="Method">
            <select
              className="input"
              value={form.method}
              onChange={(event) => setForm({ ...form, method: event.target.value })}
            >
              {['CHECK', 'CARD', 'ACH', 'CASH', 'OTHER'].map((method) => (
                <option key={method} value={method}>
                  {humanize(method)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Received">
            <input
              type="date"
              className="input"
              value={form.receivedAt}
              onChange={(event) => setForm({ ...form, receivedAt: event.target.value })}
            />
          </Field>
          <Field label="Reference" hint="Check number, transaction id">
            <input
              className="input"
              value={form.reference}
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </Field>
        </div>
        <ErrorNote error={record.error} />
      </div>
    </Modal>
  );
}
