import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, fileContentUrl } from '../../lib/api';
import { Card, CardHeader, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, dimensions, humanize } from '../../lib/format';
import type { FileAsset, Install } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const NEXT_STATUS: Record<string, { next: string; label: string } | undefined> = {
  SCHEDULED: { next: 'EN_ROUTE', label: "I'm on the way" },
  EN_ROUTE: { next: 'IN_PROGRESS', label: 'Start install' },
};

/**
 * The install crew's screen. Everything a crew needs on a phone at the site:
 * address with a maps link, tap-to-call contact, the item list, one-tap status
 * updates and photo upload on completion.
 */
export function InstallDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const photoInput = useRef<HTMLInputElement>(null);
  const [completing, setCompleting] = useState(false);

  const install = useQuery({
    queryKey: ['install', id],
    queryFn: () => api.get<Install>(`/installs/${id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['install', id] });
    queryClient.invalidateQueries({ queryKey: ['installs'] });
  };

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/installs/${id}`, { status }),
    onSuccess: invalidate,
  });
  const uploadPhotos = useMutation({
    mutationFn: (files: FileList) =>
      api.upload<FileAsset[]>('/files', files, { installId: id, kind: 'install_photo' }),
    onSuccess: invalidate,
  });

  if (install.isLoading) return <Spinner />;
  if (install.error) return <ErrorNote error={install.error} />;
  const record = install.data!;

  const address = [record.street, record.city, record.state, record.zip].filter(Boolean).join(', ');
  const advance = NEXT_STATUS[record.status];

  return (
    <>
      <PageHeader
        title={record.job?.company?.name ?? 'Install'}
        subtitle={
          <>
            <Link to={`/jobs/${record.jobId}`} className="link">
              {record.job?.jobNumber}
            </Link>
            {' · '}
            {record.job?.title}
          </>
        }
        actions={
          <span className="badge bg-slate-100 text-slate-700">{humanize(record.status)}</span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Where and when" />
            <div className="space-y-3 p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Date</p>
                <p className="text-lg font-semibold text-slate-900">
                  {new Date(record.scheduledDate).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-slate-600">
                  {record.windowStart ? `${record.windowStart} – ${record.windowEnd}` : 'No time window set'}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Address</p>
                <p className="text-base text-slate-900">{address || 'No address on file'}</p>
                {address ? (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary mt-2 w-full sm:w-auto"
                  >
                    Open in maps
                  </a>
                ) : null}
              </div>
              {record.contactName || record.contactPhone ? (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Site contact</p>
                  <p className="text-base text-slate-900">{record.contactName ?? '—'}</p>
                  {record.contactPhone ? (
                    <a href={`tel:${record.contactPhone}`} className="btn-secondary mt-2 w-full sm:w-auto">
                      Call {record.contactPhone}
                    </a>
                  ) : null}
                </div>
              ) : null}
              {record.notes ? (
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Notes for the crew
                  </p>
                  <p className="mt-0.5 text-sm text-amber-900">{record.notes}</p>
                </div>
              ) : null}
            </div>
          </Card>

          {record.job?.items?.length ? (
            <Card>
              <CardHeader title="What we're installing" />
              <ul className="divide-y divide-slate-100">
                {record.job.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.description}</p>
                      <p className="text-xs text-slate-500">{dimensions(item.widthIn, item.heightIn)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-700">×{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={`Site photos (${record.photos.length})`}
              actions={
                can('install:write') ? (
                  <>
                    <input
                      ref={photoInput}
                      type="file"
                      multiple
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files?.length) uploadPhotos.mutate(event.target.files);
                        event.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary py-1"
                      disabled={uploadPhotos.isPending}
                      onClick={() => photoInput.current?.click()}
                    >
                      {uploadPhotos.isPending ? 'Uploading…' : 'Add photos'}
                    </button>
                  </>
                ) : null
              }
            />
            {record.photos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                No photos yet — snap the finished install before you leave.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                {record.photos.map((photo) => (
                  <li key={photo.id}>
                    <a href={fileContentUrl(photo.id)} target="_blank" rel="noreferrer">
                      <img
                        src={fileContentUrl(photo.id)}
                        alt={photo.originalName}
                        className="h-32 w-full rounded-lg border border-slate-200 object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <ErrorNote error={uploadPhotos.error} />
          </Card>
        </div>

        <div className="space-y-4">
          {can('install:write') && record.status !== 'COMPLETED' && record.status !== 'CANCELLED' ? (
            <Card>
              <CardHeader title="Update status" />
              <div className="flex flex-col gap-2 p-4">
                {advance ? (
                  <button
                    type="button"
                    className="btn-secondary py-3 text-base"
                    disabled={setStatus.isPending}
                    onClick={() => setStatus.mutate(advance.next)}
                  >
                    {advance.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-primary py-3 text-base"
                  onClick={() => setCompleting(true)}
                >
                  Mark install complete
                </button>
                <ErrorNote error={setStatus.error} />
              </div>
            </Card>
          ) : null}

          {record.completedAt ? (
            <Card>
              <CardHeader title="Completed" />
              <div className="p-4 text-sm">
                <p className="text-slate-700">{date(record.completedAt)}</p>
                {record.completionNotes ? (
                  <p className="mt-1 text-slate-600">{record.completionNotes}</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Crew" />
            <div className="p-4 text-sm">
              <p className="font-medium text-slate-800">{record.crew?.name ?? 'Unassigned'}</p>
              {record.crew?.crewMembers?.length ? (
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {record.crew.crewMembers.map((member) => (
                    <li key={member.id}>{member.user.name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <CompleteModal installId={record.id} open={completing} onClose={() => setCompleting(false)} onDone={invalidate} />
    </>
  );
}

function CompleteModal({
  installId,
  open,
  onClose,
  onDone,
}: {
  installId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const complete = useMutation({
    mutationFn: async () => {
      if (files?.length) {
        await api.upload('/files', files, { installId, kind: 'install_photo' });
      }
      return api.post(`/installs/${installId}/complete`, { completionNotes: notes || undefined });
    },
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete install"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate()}>
            {complete.isPending ? 'Saving…' : 'Mark complete'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Completion photos" hint="Shot of the finished install">
          <input
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            className="input"
            onChange={(event) => setFiles(event.target.files)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className="input"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything the office should know — damage, changes, customer sign-off…"
          />
        </Field>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          When every install on the job is done, the job moves to Installed automatically.
        </p>
        <ErrorNote error={complete.error} />
      </div>
    </Modal>
  );
}
