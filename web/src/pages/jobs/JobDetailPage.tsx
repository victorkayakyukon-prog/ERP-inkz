import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, fileContentUrl } from '../../lib/api';
import {
  Card, CardHeader, EmptyState, ErrorNote, Field, InvoiceStatusBadge, JobStatusBadge,
  PageHeader, PriorityBadge, Spinner, jobStatusLabel,
} from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, dateTime, dimensions, fileSize, humanize, money, number, relative } from '../../lib/format';
import type { FileAsset, Job, JobStatus, Proof } from '../../lib/types';
import { useAuth } from '../../lib/auth';

type Tab = 'overview' | 'artwork' | 'checklist' | 'activity';

export function JobDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [statusModal, setStatusModal] = useState(false);
  const [proofModal, setProofModal] = useState(false);
  const [decisionProof, setDecisionProof] = useState<Proof | null>(null);
  const [invoiceModal, setInvoiceModal] = useState(false);

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.get<Job>(`/jobs/${id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['job', id] });
    queryClient.invalidateQueries({ queryKey: ['job-board'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
  };

  const comment = useMutation({
    mutationFn: (body: string) => api.post(`/jobs/${id}/comments`, { body }),
    onSuccess: invalidate,
  });
  const toggleChecklist = useMutation({
    mutationFn: (input: { itemId: string; done: boolean }) =>
      api.patch(`/jobs/${id}/checklist/${input.itemId}`, { done: input.done }),
    onSuccess: invalidate,
  });
  const consume = useMutation({
    mutationFn: () => api.post(`/jobs/${id}/consume`, { fromItems: true }),
    onSuccess: invalidate,
  });

  if (job.isLoading) return <Spinner />;
  if (job.error) return <ErrorNote error={job.error} />;
  const record = job.data!;

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'artwork', label: 'Artwork & proofs', count: record.proofs.length + record.files.length },
    {
      key: 'checklist',
      label: 'Checklist',
      count: record.checklist.filter((item) => !item.done).length,
    },
    { key: 'activity', label: 'Activity', count: record.comments.length },
  ];

  const overdue = record.dueDate && new Date(record.dueDate) < new Date() && record.status !== 'CLOSED';

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {record.jobNumber}
            <JobStatusBadge status={record.status} />
            <PriorityBadge priority={record.priority} />
          </span>
        }
        subtitle={
          <>
            {record.title} ·{' '}
            {can('crm:read') ? (
              <Link to={`/crm/companies/${record.companyId}`} className="link">
                {record.company.name}
              </Link>
            ) : (
              record.company.name
            )}
            {record.quote && can('quote:read') ? (
              <>
                {' · from '}
                <Link to={`/quotes/${record.quote.id}`} className="link">
                  {record.quote.number}
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {can('job:stage') ? (
              <button type="button" className="btn-primary" onClick={() => setStatusModal(true)}>
                Move stage
              </button>
            ) : null}
            {can('invoice:write') ? (
              <button type="button" className="btn-secondary" onClick={() => setInvoiceModal(true)}>
                Create invoice
              </button>
            ) : null}
          </>
        }
      />

      {record.onHoldReason ? (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <strong>On hold:</strong> {record.onHoldReason}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === entry.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {entry.label}
            {entry.count ? (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
                {entry.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {tab === 'overview' ? (
            <>
              <Card>
                <CardHeader
                  title="Items"
                  actions={
                    can('inventory:write') && record.items.some((item) => item.materialId) ? (
                      <button
                        type="button"
                        className="btn-secondary py-1"
                        disabled={consume.isPending}
                        onClick={() => consume.mutate()}
                      >
                        {consume.isPending ? 'Deducting…' : 'Deduct material from stock'}
                      </button>
                    ) : null
                  }
                />
                {record.items.length === 0 ? (
                  <EmptyState title="No items on this job" />
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Size</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Sq ft</th>
                          <th>Material</th>
                          {can('pricing:read') ? <th className="text-right">Total</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {record.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <p className="font-medium text-slate-800">{item.description}</p>
                              <p className="text-xs text-slate-400">{humanize(item.signType)}</p>
                            </td>
                            <td className="whitespace-nowrap text-slate-600">
                              {dimensions(item.widthIn, item.heightIn)}
                            </td>
                            <td className="text-right">{item.quantity}</td>
                            <td className="text-right text-slate-600">{number(item.areaSqFt)}</td>
                            <td className="max-w-[160px] truncate text-slate-500">
                              {item.material?.name ?? '—'}
                            </td>
                            {can('pricing:read') ? (
                              <td className="whitespace-nowrap text-right font-medium">
                                {money(item.lineTotal)}
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <ErrorNote error={consume.error} />
              </Card>

              {record.stockMovements.length ? (
                <Card>
                  <CardHeader title="Material used" />
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th className="text-right">Qty</th>
                          <th>Type</th>
                          <th>When</th>
                          <th>By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.stockMovements.map((movement) => (
                          <tr key={movement.id}>
                            <td>
                              <Link to={`/inventory/materials/${movement.material?.id}`} className="link">
                                {movement.material?.sku}
                              </Link>
                              <p className="text-xs text-slate-400">{movement.material?.name}</p>
                            </td>
                            <td className="whitespace-nowrap text-right">
                              {number(Math.abs(movement.quantity), 3)} {movement.material?.unit}
                            </td>
                            <td className="text-slate-500">{humanize(movement.type)}</td>
                            <td className="whitespace-nowrap text-slate-500">{date(movement.createdAt)}</td>
                            <td className="text-slate-500">{movement.user?.name ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}

              {record.installs.length ? (
                <Card>
                  <CardHeader title="Installs" />
                  <ul className="divide-y divide-slate-100">
                    {record.installs.map((install) => (
                      <li key={install.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div>
                          <Link to={`/installs/${install.id}`} className="link text-sm">
                            {date(install.scheduledDate)}
                            {install.windowStart ? ` · ${install.windowStart}–${install.windowEnd}` : ''}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {[install.street, install.city, install.state].filter(Boolean).join(', ')}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <span className="badge bg-slate-100 text-slate-600">{humanize(install.status)}</span>
                          <p className="mt-1 text-slate-400">{install.crew?.name ?? 'Unassigned'}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              {can('invoice:read') && record.invoices.length ? (
                <Card>
                  <CardHeader title="Invoices" />
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th className="text-right">Total</th>
                          <th className="text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.invoices.map((invoice) => (
                          <tr key={invoice.id}>
                            <td>
                              <Link to={`/invoices/${invoice.id}`} className="link">
                                {invoice.number}
                              </Link>
                            </td>
                            <td className="text-slate-500">{humanize(invoice.type)}</td>
                            <td>
                              <InvoiceStatusBadge status={invoice.status} />
                            </td>
                            <td className="text-right">{money(invoice.total)}</td>
                            <td className="text-right font-medium">{money(invoice.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === 'artwork' ? (
            <ArtworkTab job={record} onDecide={setDecisionProof} onNewProof={() => setProofModal(true)} />
          ) : null}

          {tab === 'checklist' ? (
            <Card>
              <CardHeader title="Stage checklist" />
              <ChecklistView
                job={record}
                editable={can('job:stage')}
                onToggle={(itemId, done) => toggleChecklist.mutate({ itemId, done })}
              />
            </Card>
          ) : null}

          {tab === 'activity' ? (
            <>
              <Card>
                <CardHeader title="Internal comments" />
                <div className="border-b border-slate-100 p-4">
                  <CommentBox onSubmit={(body) => comment.mutate(body)} pending={comment.isPending} />
                </div>
                {record.comments.length === 0 ? (
                  <EmptyState title="No comments yet" hint="Notes here stay internal to the shop." />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {record.comments.map((entry) => (
                      <li key={entry.id} className="px-4 py-3">
                        <p className="text-sm text-slate-800">{entry.body}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {entry.user?.name ?? 'System'} · {dateTime(entry.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Status history" />
                <ol className="divide-y divide-slate-100">
                  {record.statusEvents.map((event) => (
                    <li key={event.id} className="px-4 py-2.5 text-sm">
                      <p className="text-slate-800">
                        {event.fromStatus ? (
                          <>
                            <span className="text-slate-500">{jobStatusLabel(event.fromStatus)}</span>
                            <span className="mx-1.5 text-slate-400">→</span>
                          </>
                        ) : (
                          <span className="text-slate-500">Created at </span>
                        )}
                        <span className="font-medium">{jobStatusLabel(event.toStatus)}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {event.user?.name ?? 'System'} · {dateTime(event.createdAt)}
                        {event.note ? ` · ${event.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Status" value={jobStatusLabel(record.status)} />
              <Row
                label="Due"
                value={record.dueDate ? `${date(record.dueDate)} (${relative(record.dueDate)})` : '—'}
                tone={overdue ? 'danger' : undefined}
              />
              <Row label="Owner" value={record.owner?.name ?? '—'} />
              <Row
                label="Contact"
                value={record.contact ? `${record.contact.firstName} ${record.contact.lastName}` : '—'}
              />
              {can('pricing:read') ? (
                <>
                  <Row label="Contract" value={money(record.contractTotal)} />
                  <Row label="Quoted material" value={money(record.quotedMaterialCost)} />
                </>
              ) : null}
              <Row label="Created" value={date(record.createdAt)} />
            </dl>
          </Card>

          {record.installRequired ? (
            <Card>
              <CardHeader title="Install site" />
              <div className="px-4 py-3 text-sm text-slate-700">
                <p>{record.installStreet ?? '—'}</p>
                <p>
                  {[record.installCity, record.installState, record.installZip].filter(Boolean).join(', ')}
                </p>
                {record.installNotes ? (
                  <p className="mt-2 text-xs text-slate-500">{record.installNotes}</p>
                ) : null}
                {record.installStreet ? (
                  <a
                    className="link mt-2 inline-block text-xs"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://maps.google.com/?q=${encodeURIComponent(
                      [record.installStreet, record.installCity, record.installState, record.installZip]
                        .filter(Boolean)
                        .join(' '),
                    )}`}
                  >
                    Open in maps →
                  </a>
                ) : null}
              </div>
            </Card>
          ) : null}

          {record.scheduleEntries.length ? (
            <Card>
              <CardHeader title="Shop schedule" />
              <ul className="divide-y divide-slate-100 text-sm">
                {record.scheduleEntries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span>
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: entry.resource?.color }}
                      />
                      {entry.resource?.name}
                    </span>
                    <span className="text-slate-500">{date(entry.scheduledDate)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>

      <StatusModal
        job={record}
        open={statusModal}
        onClose={() => setStatusModal(false)}
        onDone={invalidate}
      />
      <ProofModal jobId={record.id} open={proofModal} onClose={() => setProofModal(false)} />
      {decisionProof ? (
        <ProofDecisionModal
          jobId={record.id}
          proof={decisionProof}
          onClose={() => setDecisionProof(null)}
        />
      ) : null}
      <InvoiceModal job={record} open={invoiceModal} onClose={() => setInvoiceModal(false)} />
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right font-medium ${tone === 'danger' ? 'text-red-600' : 'text-slate-800'}`}>
        {value}
      </dd>
    </div>
  );
}

function CommentBox({ onSubmit, pending }: { onSubmit: (body: string) => void; pending: boolean }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <textarea
        className="input flex-1"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Add a note for the shop…"
      />
      <button
        type="button"
        className="btn-primary sm:self-end"
        disabled={!value.trim() || pending}
        onClick={() => {
          onSubmit(value.trim());
          setValue('');
        }}
      >
        Post
      </button>
    </div>
  );
}

function ChecklistView({
  job,
  editable,
  onToggle,
}: {
  job: Job;
  editable: boolean;
  onToggle: (itemId: string, done: boolean) => void;
}) {
  const stages = [...new Set(job.checklist.map((item) => item.stage))];
  if (!stages.length) return <EmptyState title="No checklist on this job" />;

  return (
    <div className="divide-y divide-slate-100">
      {stages.map((stage) => {
        const items = job.checklist.filter((item) => item.stage === stage);
        const done = items.filter((item) => item.done).length;
        return (
          <section key={stage} className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className={`text-sm font-semibold ${stage === job.status ? 'text-brand-700' : 'text-slate-700'}`}>
                {jobStatusLabel(stage as JobStatus)}
                {stage === job.status ? (
                  <span className="badge ml-2 bg-brand-100 text-brand-700">Current</span>
                ) : null}
              </h3>
              <span className="text-xs text-slate-400">
                {done}/{items.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!editable}
                      onChange={(event) => onToggle(item.id, event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600"
                    />
                    <span className={item.done ? 'text-slate-400 line-through' : 'text-slate-700'}>
                      {item.label}
                      {item.done && item.completedBy ? (
                        <span className="ml-1 text-xs text-slate-400">
                          — {item.completedBy.name}, {date(item.completedAt)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ArtworkTab({
  job,
  onDecide,
  onNewProof,
}: {
  job: Job;
  onDecide: (proof: Proof) => void;
  onNewProof: () => void;
}) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (files: FileList) => api.upload<FileAsset[]>('/files', files, { jobId: job.id, kind: 'artwork' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', job.id] }),
  });
  const sendProof = useMutation({
    mutationFn: (proofId: string) => api.post(`/jobs/${job.id}/proofs/${proofId}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['job-board'] });
    },
  });

  return (
    <>
      <Card>
        <CardHeader
          title="Proofs"
          actions={
            can('job:write') ? (
              <button type="button" className="btn-secondary py-1" onClick={onNewProof}>
                New proof version
              </button>
            ) : null
          }
        />
        {job.proofs.length === 0 ? (
          <EmptyState title="No proofs yet" hint="Upload artwork, then create a proof version to send." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {job.proofs.map((proof) => (
              <li key={proof.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="flex gap-3">
                  {proof.file?.previewable ? (
                    <img
                      src={fileContentUrl(proof.file.id)}
                      alt={proof.file.originalName}
                      className="h-16 w-16 rounded border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded border border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-400">
                      {proof.file?.originalName.split('.').pop() ?? 'v' + proof.version}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">Version {proof.version}</p>
                    <p className="text-xs text-slate-500">
                      {proof.sentAt ? `Sent ${date(proof.sentAt)}` : 'Not sent yet'}
                      {proof.decidedAt
                        ? ` · ${humanize(proof.status)} by ${proof.decidedByName} on ${date(proof.decidedAt)}`
                        : ''}
                    </p>
                    {proof.clientNote ? (
                      <p className="mt-1 text-sm italic text-slate-600">“{proof.clientNote}”</p>
                    ) : null}
                    {proof.notes ? <p className="mt-1 text-xs text-slate-400">{proof.notes}</p> : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`badge ${
                      proof.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : proof.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {humanize(proof.status)}
                  </span>
                  {can('job:write') && proof.status === 'PENDING' ? (
                    <div className="flex gap-2 text-xs">
                      {!proof.sentAt ? (
                        <button
                          type="button"
                          className="link"
                          disabled={sendProof.isPending}
                          onClick={() => sendProof.mutate(proof.id)}
                        >
                          Mark sent
                        </button>
                      ) : null}
                      <button type="button" className="link" onClick={() => onDecide(proof)}>
                        Record decision
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={sendProof.error} />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Files"
          actions={
            can('job:write') ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".ai,.pdf,.eps,.svg,.psd,.cdr,.png,.jpg,.jpeg,.gif,.webp,.zip,.dxf,.plt"
                  onChange={(event) => {
                    if (event.target.files?.length) upload.mutate(event.target.files);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary py-1"
                  disabled={upload.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {upload.isPending ? 'Uploading…' : 'Upload files'}
                </button>
              </>
            ) : null
          }
        />
        {job.files.length === 0 ? (
          <EmptyState title="No files yet" hint="AI, PDF, EPS, PNG and JPG are all accepted." />
        ) : (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {job.files.map((file) => (
              <li key={file.id} className="rounded-lg border border-slate-200 p-2">
                <a href={fileContentUrl(file.id)} target="_blank" rel="noreferrer" className="block">
                  {file.previewable ? (
                    <img
                      src={fileContentUrl(file.id)}
                      alt={file.originalName}
                      className="h-28 w-full rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center rounded bg-slate-50 text-lg font-semibold uppercase text-slate-400">
                      {file.originalName.split('.').pop()}
                    </div>
                  )}
                  <p className="mt-1.5 truncate text-xs font-medium text-slate-700">{file.originalName}</p>
                  <p className="text-xs text-slate-400">
                    {fileSize(file.size)} · {file.uploadedBy?.name ?? 'Unknown'}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={upload.error} />
      </Card>
    </>
  );
}

function StatusModal({
  job,
  open,
  onClose,
  onDone,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [note, setNote] = useState('');

  const move = useMutation({
    mutationFn: () => api.post(`/jobs/${job.id}/status`, { status, note: note || undefined }),
    onSuccess: () => {
      onDone();
      setStatus('');
      setNote('');
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move job stage"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!status || move.isPending} onClick={() => move.mutate()}>
            {move.isPending ? 'Moving…' : 'Move'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Currently at <strong>{jobStatusLabel(job.status)}</strong>. Every move is recorded with your name
          and the time.
        </p>
        <Field label="Move to">
          <select className="input" value={status} onChange={(event) => setStatus(event.target.value as JobStatus)}>
            <option value="">Select a stage…</option>
            {(job.allowedTransitions ?? []).map((option) => (
              <option key={option.status} value={option.status}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note" hint="Required context for a hold or a send-back">
          <textarea className="input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <ErrorNote error={move.error} />
      </div>
    </Modal>
  );
}

function ProofModal({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      // Upload the artwork first so the proof can point at a stored file.
      let fileId: string | undefined;
      if (file) {
        const uploaded = await api.upload<FileAsset[]>('/files', [file], { jobId, kind: 'proof' });
        fileId = uploaded[0]?.id;
      }
      return api.post(`/jobs/${jobId}/proofs`, { fileId, notes: notes || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      setNotes('');
      setFile(null);
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New proof version"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create proof'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Proof file" hint="PDF or image the customer will see">
          <input
            type="file"
            className="input"
            accept=".pdf,.png,.jpg,.jpeg,.ai,.eps"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Internal notes">
          <textarea className="input" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}

function ProofDecisionModal({
  jobId,
  proof,
  onClose,
}: {
  jobId: string;
  proof: Proof;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decidedByName, setDecidedByName] = useState('');
  const [clientNote, setClientNote] = useState('');

  const decide = useMutation({
    mutationFn: () =>
      api.post(`/jobs/${jobId}/proofs/${proof.id}/decision`, {
        status,
        decidedByName,
        clientNote: clientNote || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-board'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Proof v${proof.version} decision`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!decidedByName || decide.isPending}
            onClick={() => decide.mutate()}
          >
            Record decision
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Decision">
          <select
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value as 'APPROVED' | 'REJECTED')}
          >
            <option value="APPROVED">Approved — proceed to production</option>
            <option value="REJECTED">Changes requested — back to design</option>
          </select>
        </Field>
        <Field label="Who approved it?">
          <input
            className="input"
            value={decidedByName}
            onChange={(event) => setDecidedByName(event.target.value)}
            placeholder="Customer contact name"
          />
        </Field>
        <Field label="Customer comments">
          <textarea
            className="input"
            rows={3}
            value={clientNote}
            onChange={(event) => setClientNote(event.target.value)}
            placeholder="Logo needs to be 20% larger"
          />
        </Field>
        <ErrorNote error={decide.error} />
      </div>
    </Modal>
  );
}

function InvoiceModal({ job, open, onClose }: { job: Job; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<'DEPOSIT' | 'MILESTONE' | 'FINAL' | 'FULL'>('FULL');
  const [percentage, setPercentage] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>(`/jobs/${job.id}/invoice`, {
        type,
        percentage: type === 'MILESTONE' && percentage ? Number(percentage) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create invoice"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create invoice'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Invoice type">
          <select className="input" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
            <option value="FULL">Full — one line per job item</option>
            <option value="DEPOSIT">Deposit — shop default percentage</option>
            <option value="MILESTONE">Milestone — a percentage of the contract</option>
            <option value="FINAL">Final — contract less what is already billed</option>
          </select>
        </Field>
        {type === 'MILESTONE' ? (
          <Field label="Percentage of contract">
            <input
              type="number"
              className="input"
              value={percentage}
              onChange={(event) => setPercentage(event.target.value)}
              placeholder="30"
            />
          </Field>
        ) : null}
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Contract value: <strong>{money(job.contractTotal)}</strong>. Invoices start as drafts — send one to
          start tracking payment against it.
        </p>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
