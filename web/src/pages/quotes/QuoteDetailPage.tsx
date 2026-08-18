import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Card, CardHeader, EmptyState, ErrorNote, Field, PageHeader, QuoteStatusBadge, Spinner,
} from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, dimensions, humanize, money, number } from '../../lib/format';
import type { Material, Page, Quote, QuoteItem, SignType } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const SIGN_TYPES: SignType[] = [
  'BANNER', 'VEHICLE_WRAP', 'CHANNEL_LETTERS', 'MONUMENT', 'ADA', 'DECAL',
  'TRADE_SHOW', 'YARD_SIGN', 'WINDOW_GRAPHIC', 'DIMENSIONAL_LETTERS', 'WAYFINDING', 'OTHER',
];

const FINISHING: Array<{ key: keyof QuoteItem; label: string }> = [
  { key: 'laminate', label: 'Laminate' },
  { key: 'mounting', label: 'Mounting' },
  { key: 'contourCut', label: 'Contour cut' },
  { key: 'grommets', label: 'Grommets' },
  { key: 'hemmed', label: 'Hemmed' },
];

export function QuoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [editingItem, setEditingItem] = useState<QuoteItem | 'new' | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const quote = useQuery({
    queryKey: ['quote', id],
    queryFn: () => api.get<Quote>(`/quotes/${id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['quote', id] });
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
  };

  const updateQuote = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/quotes/${id}`, patch),
    onSuccess: invalidate,
  });
  const send = useMutation({
    mutationFn: () => api.post(`/quotes/${id}/send`),
    onSuccess: invalidate,
  });
  const newVersion = useMutation({
    mutationFn: () => api.post<Quote>(`/quotes/${id}/new-version`),
    onSuccess: (created) => {
      invalidate();
      navigate(`/quotes/${created.id}`);
    },
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/quotes/${id}/items/${itemId}`),
    onSuccess: invalidate,
  });

  if (quote.isLoading) return <Spinner />;
  if (quote.error) return <ErrorNote error={quote.error} />;
  const record = quote.data!;
  const locked = record.status === 'ACCEPTED' || record.status === 'EXPIRED';
  const editable = can('quote:write') && !locked;

  const marginPct =
    record.subtotal > 0
      ? Math.round(((record.subtotal - record.materialCost) / record.subtotal) * 1000) / 10
      : 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {record.number}
            {record.version > 1 ? (
              <span className="text-base font-normal text-slate-400">version {record.version}</span>
            ) : null}
            <QuoteStatusBadge status={record.status} />
          </span>
        }
        subtitle={
          <>
            {record.title} ·{' '}
            <Link to={`/crm/companies/${record.companyId}`} className="link">
              {record.company.name}
            </Link>
            {record.validUntil ? ` · valid until ${date(record.validUntil)}` : null}
          </>
        }
        actions={
          can('quote:write') ? (
            <>
              {record.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!record.items.length || send.isPending}
                  onClick={() => send.mutate()}
                >
                  Mark as sent
                </button>
              ) : null}
              {record.status === 'SENT' ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setRejecting(true)}>
                    Mark lost
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setAccepting(true)}>
                    Accept &amp; create job
                  </button>
                </>
              ) : null}
              {record.status !== 'DRAFT' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={newVersion.isPending}
                  onClick={() => newVersion.mutate()}
                >
                  New version
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      <ErrorNote error={send.error ?? newVersion.error ?? removeItem.error} />

      {record.jobs?.length ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Converted to job{' '}
          {record.jobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="font-semibold underline">
              {job.jobNumber}
            </Link>
          ))}
          {record.signedName ? ` · accepted by ${record.signedName}` : null}
        </div>
      ) : null}
      {record.rejectedReason ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Lost: {record.rejectedReason}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Line items"
              actions={
                editable ? (
                  <button type="button" className="btn-primary py-1" onClick={() => setEditingItem('new')}>
                    Add line
                  </button>
                ) : null
              }
            />
            {record.items.length === 0 ? (
              <EmptyState
                title="No lines yet"
                hint="Add a sign to price it — dimensions, material and finishing drive the total."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {record.items.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{item.description}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {humanize(item.signType)} · {dimensions(item.widthIn, item.heightIn)} ·{' '}
                          qty {item.quantity} · {number(item.areaSqFt)} sq ft
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {item.material?.name ?? 'No material'} @ {money(item.pricePerSqFt)}/sq ft
                          {item.laborHours > 0 ? ` · ${item.laborHours}h labor` : ''}
                          {item.installRequired ? ` · ${item.installHours}h install` : ''}
                          {item.markupPct > 0 ? ` · ${item.markupPct}% markup` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {FINISHING.filter((option) => item[option.key]).map((option) => (
                            <span key={option.label} className="badge bg-slate-100 text-slate-600">
                              {option.label}
                            </span>
                          ))}
                          {item.installRequired ? (
                            <span className="badge bg-blue-100 text-blue-700">Install</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{money(item.lineTotal)}</p>
                        <p className="text-xs text-slate-400">cost {money(item.materialCost)}</p>
                        {editable ? (
                          <div className="mt-1 flex justify-end gap-2 text-xs">
                            <button
                              type="button"
                              className="text-slate-500 hover:text-slate-800"
                              onClick={() => setEditingItem(item)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => removeItem.mutate(item.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Notes and terms" />
            <div className="space-y-3 p-4">
              <Field label="Customer-facing notes">
                <textarea
                  className="input"
                  rows={3}
                  defaultValue={record.notes ?? ''}
                  disabled={!editable}
                  onBlur={(event) => {
                    if (event.target.value !== (record.notes ?? '')) {
                      updateQuote.mutate({ notes: event.target.value });
                    }
                  }}
                />
              </Field>
              <Field label="Terms">
                <input
                  className="input"
                  defaultValue={record.terms ?? ''}
                  disabled={!editable}
                  onBlur={(event) => {
                    if (event.target.value !== (record.terms ?? '')) {
                      updateQuote.mutate({ terms: event.target.value });
                    }
                  }}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Pricing" />
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Discount %">
                  <input
                    type="number"
                    step="0.5"
                    className="input"
                    defaultValue={record.discountPct}
                    disabled={!editable}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== record.discountPct) updateQuote.mutate({ discountPct: value });
                    }}
                  />
                </Field>
                <Field label="Rush %">
                  <input
                    type="number"
                    step="0.5"
                    className="input"
                    defaultValue={record.rushFeePct}
                    disabled={!editable}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== record.rushFeePct) updateQuote.mutate({ rushFeePct: value });
                    }}
                  />
                </Field>
                <Field label="Tax %">
                  <input
                    type="number"
                    step="0.125"
                    className="input"
                    defaultValue={record.taxRatePct}
                    disabled={!editable}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== record.taxRatePct) updateQuote.mutate({ taxRatePct: value });
                    }}
                  />
                </Field>
              </div>

              <dl className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                <Line label="Subtotal" value={money(record.subtotal)} />
                {record.discount > 0 ? (
                  <Line label={`Discount (${record.discountPct}%)`} value={`−${money(record.discount)}`} />
                ) : null}
                {record.rushFee > 0 ? (
                  <Line label={`Rush fee (${record.rushFeePct}%)`} value={money(record.rushFee)} />
                ) : null}
                <Line label={`Tax (${record.taxRatePct}%)`} value={money(record.taxAmount)} />
                <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{money(record.total)}</dd>
                </div>
              </dl>

              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <p className="flex justify-between">
                  <span>Material cost</span>
                  <span className="font-medium">{money(record.materialCost)}</span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span>Gross margin on material</span>
                  <span className={`font-medium ${marginPct < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {marginPct}%
                  </span>
                </p>
              </div>
              <ErrorNote error={updateQuote.error} />
            </div>
          </Card>

          {record.versions && record.versions.length > 1 ? (
            <Card>
              <CardHeader title="Versions" />
              <ul className="divide-y divide-slate-100 text-sm">
                {record.versions.map((version) => (
                  <li key={version.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <Link
                      to={`/quotes/${version.id}`}
                      className={version.id === record.id ? 'font-semibold text-slate-900' : 'link'}
                    >
                      v{version.version} · {version.number}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{money(version.total)}</span>
                      <QuoteStatusBadge status={version.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Customer" value={record.company.name} />
              <Row
                label="Contact"
                value={record.contact ? `${record.contact.firstName} ${record.contact.lastName}` : '—'}
              />
              <Row label="Prepared by" value={record.createdBy?.name ?? '—'} />
              <Row label="Created" value={date(record.createdAt)} />
              <Row label="Sent" value={record.sentAt ? date(record.sentAt) : '—'} />
              {record.signedName ? <Row label="Signed by" value={record.signedName} /> : null}
            </dl>
          </Card>
        </div>
      </div>

      {editingItem ? (
        <LineItemModal
          quoteId={record.id}
          item={editingItem === 'new' ? undefined : editingItem}
          onClose={() => setEditingItem(null)}
        />
      ) : null}
      <AcceptModal quoteId={record.id} open={accepting} onClose={() => setAccepting(false)} />
      <RejectModal quoteId={record.id} open={rejecting} onClose={() => setRejecting(false)} />
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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

/**
 * Line-item editor. Material selection snapshots price/cost onto the line, and
 * the server re-prices the whole quote on every save.
 */
function LineItemModal({
  quoteId,
  item,
  onClose,
}: {
  quoteId: string;
  item?: QuoteItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    signType: item?.signType ?? ('OTHER' as SignType),
    description: item?.description ?? '',
    widthIn: String(item?.widthIn ?? ''),
    heightIn: String(item?.heightIn ?? ''),
    quantity: String(item?.quantity ?? 1),
    materialId: item?.materialId ?? '',
    pricePerSqFt: item ? String(item.pricePerSqFt) : '',
    minimumCharge: item ? String(item.minimumCharge) : '',
    laminate: item?.laminate ?? false,
    mounting: item?.mounting ?? false,
    contourCut: item?.contourCut ?? false,
    grommets: item?.grommets ?? false,
    hemmed: item?.hemmed ?? false,
    laborHours: String(item?.laborHours ?? 0),
    markupPct: item ? String(item.markupPct) : '',
    installRequired: item?.installRequired ?? false,
    installHours: String(item?.installHours ?? 0),
    notes: item?.notes ?? '',
  });

  const materials = useQuery({
    queryKey: ['materials', 'all'],
    queryFn: () => api.get<Page<Material>>('/materials', { pageSize: 200 }),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        signType: form.signType,
        description: form.description,
        widthIn: Number(form.widthIn || 0),
        heightIn: Number(form.heightIn || 0),
        quantity: Number(form.quantity || 1),
        materialId: form.materialId || null,
        // Blank means "use the material or shop default" — the server resolves it.
        pricePerSqFt: form.pricePerSqFt === '' ? undefined : Number(form.pricePerSqFt),
        minimumCharge: form.minimumCharge === '' ? undefined : Number(form.minimumCharge),
        markupPct: form.markupPct === '' ? undefined : Number(form.markupPct),
        laminate: form.laminate,
        mounting: form.mounting,
        contourCut: form.contourCut,
        grommets: form.grommets,
        hemmed: form.hemmed,
        laborHours: Number(form.laborHours || 0),
        installRequired: form.installRequired,
        installHours: Number(form.installHours || 0),
        notes: form.notes || undefined,
      };
      return item
        ? api.patch(`/quotes/${quoteId}/items/${item.id}`, payload)
        : api.post(`/quotes/${quoteId}/items`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
      onClose();
    },
  });

  const selected = (materials.data?.data ?? []).find((material) => material.id === form.materialId);
  const areaSqFt =
    (Number(form.widthIn || 0) * Number(form.heightIn || 0) * Number(form.quantity || 1)) / 144;

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={item ? 'Edit line item' : 'Add line item'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.description || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save line'}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sign type">
          <select
            className="input"
            value={form.signType}
            onChange={(event) => setForm({ ...form, signType: event.target.value as SignType })}
          >
            {SIGN_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input
            type="number"
            min="1"
            className="input"
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: event.target.value })}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input
            className="input"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder='3x8 vinyl banner — "Grand Opening"'
          />
        </Field>
        <Field label="Width (inches)">
          <input
            type="number"
            step="0.25"
            className="input"
            value={form.widthIn}
            onChange={(event) => setForm({ ...form, widthIn: event.target.value })}
          />
        </Field>
        <Field label="Height (inches)">
          <input
            type="number"
            step="0.25"
            className="input"
            value={form.heightIn}
            onChange={(event) => setForm({ ...form, heightIn: event.target.value })}
          />
        </Field>

        <Field label="Material" className="sm:col-span-2" hint={`${number(areaSqFt)} sq ft total`}>
          <select
            className="input"
            value={form.materialId}
            onChange={(event) => setForm({ ...form, materialId: event.target.value, pricePerSqFt: '' })}
          >
            <option value="">No material (price manually)</option>
            {(materials.data?.data ?? []).map((material) => (
              <option key={material.id} value={material.id}>
                {material.sku} — {material.name} ({money(material.pricePerSqFt)}/sq ft)
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Price per sq ft"
          hint={selected ? `Catalog: ${money(selected.pricePerSqFt)}` : 'Leave blank for the default'}
        >
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.pricePerSqFt}
            onChange={(event) => setForm({ ...form, pricePerSqFt: event.target.value })}
            placeholder={selected ? String(selected.pricePerSqFt) : '0.00'}
          />
        </Field>
        <Field label="Minimum charge" hint="Floor for this line">
          <input
            type="number"
            step="1"
            className="input"
            value={form.minimumCharge}
            onChange={(event) => setForm({ ...form, minimumCharge: event.target.value })}
            placeholder="Shop default"
          />
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="label">Finishing</legend>
          <div className="flex flex-wrap gap-3">
            {FINISHING.map((option) => (
              <label key={option.label} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                  checked={Boolean(form[option.key as keyof typeof form])}
                  onChange={(event) => setForm({ ...form, [option.key]: event.target.checked })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Shop labor (hours)">
          <input
            type="number"
            step="0.25"
            className="input"
            value={form.laborHours}
            onChange={(event) => setForm({ ...form, laborHours: event.target.value })}
          />
        </Field>
        <Field label="Markup %" hint="Leave blank for the shop default">
          <input
            type="number"
            step="1"
            className="input"
            value={form.markupPct}
            onChange={(event) => setForm({ ...form, markupPct: event.target.value })}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={form.installRequired}
            onChange={(event) => setForm({ ...form, installRequired: event.target.checked })}
          />
          Install required
        </label>
        {form.installRequired ? (
          <Field label="Install hours">
            <input
              type="number"
              step="0.5"
              className="input"
              value={form.installHours}
              onChange={(event) => setForm({ ...form, installHours: event.target.value })}
            />
          </Field>
        ) : null}

        <Field label="Internal notes" className="sm:col-span-2">
          <input
            className="input"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error} />
        </div>
      </div>
    </Modal>
  );
}

function AcceptModal({
  quoteId,
  open,
  onClose,
}: {
  quoteId: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signedName, setSignedName] = useState('');
  const [createJob, setCreateJob] = useState(true);

  const accept = useMutation({
    mutationFn: () => api.post<{ job: { id: string } | null }>(`/quotes/${quoteId}/accept`, { signedName, createJob }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      onClose();
      if (result.job) navigate(`/jobs/${result.job.id}`);
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Accept quote"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!signedName || accept.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? 'Accepting…' : 'Accept quote'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Record who approved this quote. Accepting locks the quote and, by default, opens a job at the
          Design / Proof stage.
        </p>
        <Field label="Approved by" hint="Name of the person who signed off">
          <input
            className="input"
            value={signedName}
            onChange={(event) => setSignedName(event.target.value)}
            placeholder="Jesse Ramirez"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-brand-600"
            checked={createJob}
            onChange={(event) => setCreateJob(event.target.checked)}
          />
          Create the job now
        </label>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          This is a typed-name record, not a legally binding e-signature. Wiring up DocuSign or Dropbox
          Sign is a documented next step.
        </p>
        <ErrorNote error={accept.error} />
      </div>
    </Modal>
  );
}

function RejectModal({
  quoteId,
  open,
  onClose,
}: {
  quoteId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const reject = useMutation({
    mutationFn: () => api.post(`/quotes/${quoteId}/reject`, { reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', quoteId] });
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark quote as lost"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={reject.isPending} onClick={() => reject.mutate()}>
            Mark lost
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Why was it lost?" hint="Feeds the lost-reason report">
          <textarea
            className="input"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Lost on price to a national vendor"
          />
        </Field>
        <ErrorNote error={reject.error} />
      </div>
    </Modal>
  );
}
