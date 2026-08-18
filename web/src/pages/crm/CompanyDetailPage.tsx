import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Card, CardHeader, EmptyState, ErrorNote, Field, InvoiceStatusBadge,
  JobStatusBadge, PageHeader, QuoteStatusBadge, Spinner, StageBadge,
} from '../../components/ui';
import { Modal } from '../../components/Modal';
import { CompanyModal } from './CompaniesPage';
import { date, dateTime, humanize, money } from '../../lib/format';
import type { Company, Contact, Invoice, Job, Opportunity, Quote } from '../../lib/types';
import { useAuth } from '../../lib/auth';

interface TimelineEntry {
  id: string;
  kind: 'activity' | 'quote' | 'job' | 'invoice' | 'task';
  at: string;
  title: string;
  subtitle: string;
  body?: string | null;
  user?: string | null;
}

type CompanyDetail = Company & {
  contacts: Contact[];
  opportunities: Opportunity[];
  quotes: Quote[];
  jobs: Job[];
  invoices: Invoice[];
};

const KIND_STYLES: Record<TimelineEntry['kind'], string> = {
  activity: 'bg-slate-100 text-slate-600',
  quote: 'bg-amber-100 text-amber-700',
  job: 'bg-blue-100 text-blue-700',
  invoice: 'bg-emerald-100 text-emerald-700',
  task: 'bg-purple-100 text-purple-700',
};

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [addingContact, setAddingContact] = useState<Contact | 'new' | null>(null);

  const company = useQuery({
    queryKey: ['company', id],
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}`),
  });
  const timeline = useQuery({
    queryKey: ['company', id, 'timeline'],
    queryFn: () => api.get<TimelineEntry[]>(`/companies/${id}/timeline`),
  });

  if (company.isLoading) return <Spinner />;
  if (company.error) return <ErrorNote error={company.error} />;
  const record = company.data!;

  const address = [record.billingStreet, record.billingCity, record.billingState, record.billingZip]
    .filter(Boolean)
    .join(', ');
  const openBalance = record.invoices
    .filter((invoice) => invoice.status === 'SENT' || invoice.status === 'PARTIAL')
    .reduce((sum, invoice) => sum + invoice.balance, 0);

  return (
    <>
      <PageHeader
        title={record.name}
        subtitle={
          <>
            {record.industry ? `${record.industry} · ` : ''}
            {address || 'No address on file'}
          </>
        }
        actions={
          can('crm:write') ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => setLoggingActivity(true)}>
                Log activity
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Contacts"
              actions={
                can('crm:write') ? (
                  <button type="button" className="btn-secondary py-1" onClick={() => setAddingContact('new')}>
                    Add contact
                  </button>
                ) : null
              }
            />
            {record.contacts.length === 0 ? (
              <EmptyState title="No contacts yet" hint="Add the person you actually talk to." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {record.contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {contact.firstName} {contact.lastName}
                        {contact.isPrimary ? (
                          <span className="badge ml-2 bg-brand-100 text-brand-700">Primary</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">{contact.title ?? '—'}</p>
                    </div>
                    <div className="text-right text-xs text-slate-600">
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="block link">
                          {contact.email}
                        </a>
                      ) : null}
                      {contact.phone ? (
                        <a href={`tel:${contact.phone}`} className="block">
                          {contact.phone}
                        </a>
                      ) : null}
                      {can('crm:write') ? (
                        <button
                          type="button"
                          className="mt-1 text-xs text-slate-400 hover:text-slate-700"
                          onClick={() => setAddingContact(contact)}
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Activity timeline" />
            {timeline.isLoading ? (
              <Spinner />
            ) : (timeline.data ?? []).length === 0 ? (
              <EmptyState title="Nothing logged yet" />
            ) : (
              <ol className="divide-y divide-slate-100">
                {(timeline.data ?? []).slice(0, 40).map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="flex gap-3 px-4 py-3">
                    <span
                      className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLES[entry.kind]}`}
                    >
                      {entry.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{entry.title}</p>
                      <p className="text-xs text-slate-500">
                        {humanize(entry.subtitle)} · {dateTime(entry.at)}
                        {entry.user ? ` · ${entry.user}` : ''}
                      </p>
                      {entry.body ? <p className="mt-1 text-sm text-slate-600">{entry.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="At a glance" />
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Rep" value={record.owner?.name ?? 'Unassigned'} />
              <Row label="Phone" value={record.phone ?? '—'} />
              <Row label="Email" value={record.email ?? '—'} />
              <Row label="Open balance" value={money(openBalance)} />
              <Row
                label="Tax"
                value={record.taxExempt ? 'Exempt' : record.taxRatePct ? `${record.taxRatePct}%` : 'Shop default'}
              />
            </dl>
            {record.tags.length ? (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 px-4 py-3">
                {record.tags.map((tag) => (
                  <span key={tag} className="badge bg-slate-100 text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {record.notes ? (
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{record.notes}</p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Opportunities" />
            {record.opportunities.length === 0 ? (
              <EmptyState title="No opportunities" />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {record.opportunities.map((opportunity) => (
                  <li key={opportunity.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="min-w-0 truncate">{opportunity.title}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-slate-500">{money(opportunity.estimatedValue)}</span>
                      <StageBadge stage={opportunity.stage} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {can('quote:read') ? (
            <Card>
              <CardHeader title="Quotes" />
              {record.quotes.length === 0 ? (
                <EmptyState title="No quotes yet" />
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {record.quotes.map((quote) => (
                    <li key={quote.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <Link to={`/quotes/${quote.id}`} className="link truncate">
                        {quote.number}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-slate-500">{money(quote.total)}</span>
                        <QuoteStatusBadge status={quote.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Jobs" />
            {record.jobs.length === 0 ? (
              <EmptyState title="No jobs yet" />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {record.jobs.map((job) => (
                  <li key={job.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <Link to={`/jobs/${job.id}`} className="link truncate">
                      {job.jobNumber}
                    </Link>
                    <JobStatusBadge status={job.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {can('invoice:read') ? (
            <Card>
              <CardHeader title="Invoices" />
              {record.invoices.length === 0 ? (
                <EmptyState title="No invoices yet" />
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {record.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                      <Link to={`/invoices/${invoice.id}`} className="link">
                        {invoice.number}
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-slate-500">{money(invoice.balance)}</span>
                        <InvoiceStatusBadge status={invoice.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}
        </div>
      </div>

      {editing ? (
        <CompanyModal open onClose={() => setEditing(false)} company={record} />
      ) : null}
      <ActivityModal
        open={loggingActivity}
        onClose={() => setLoggingActivity(false)}
        companyId={record.id}
        contacts={record.contacts}
      />
      {addingContact ? (
        <ContactModal
          open
          onClose={() => setAddingContact(null)}
          companyId={record.id}
          contact={addingContact === 'new' ? undefined : addingContact}
        />
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

function ActivityModal({
  open,
  onClose,
  companyId,
  contacts,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  contacts: Contact[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ type: 'CALL', subject: '', body: '', contactId: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/activities', {
        type: form.type,
        subject: form.subject,
        body: form.body || undefined,
        companyId,
        contactId: form.contactId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] });
      setForm({ type: 'CALL', subject: '', body: '', contactId: '' });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log an activity"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.subject || create.isPending}
            onClick={() => create.mutate()}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select
              className="input"
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
            >
              {['CALL', 'EMAIL', 'MEETING', 'SITE_VISIT', 'NOTE'].map((type) => (
                <option key={type} value={type}>
                  {humanize(type)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contact">
            <select
              className="input"
              value={form.contactId}
              onChange={(event) => setForm({ ...form, contactId: event.target.value })}
            >
              <option value="">—</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.firstName} {contact.lastName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Subject">
          <input
            className="input"
            value={form.subject}
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
            placeholder="Called about the monument sign proof"
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="input"
            rows={4}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}

export function ContactModal({
  open,
  onClose,
  companyId,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  companyId?: string;
  contact?: Contact;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    title: contact?.title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    mobile: contact?.mobile ?? '',
    isPrimary: contact?.isPrimary ?? false,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, companyId: contact?.companyId ?? companyId };
      return contact ? api.patch(`/contacts/${contact.id}`, payload) : api.post('/contacts', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={contact ? 'Edit contact' : 'New contact'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.firstName || !form.lastName || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <input
            className="input"
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
          />
        </Field>
        <Field label="Last name">
          <input
            className="input"
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
          />
        </Field>
        <Field label="Title" className="sm:col-span-2">
          <input
            className="input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <input
            className="input"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Phone">
          <input
            className="input"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </Field>
        <Field label="Mobile">
          <input
            className="input"
            value={form.mobile}
            onChange={(event) => setForm({ ...form, mobile: event.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(event) => setForm({ ...form, isPrimary: event.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
          />
          Primary contact for this customer
        </label>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error} />
        </div>
      </div>
    </Modal>
  );
}
