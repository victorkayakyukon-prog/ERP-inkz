import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { money, moneyShort, relative } from '../../lib/format';
import type { Company, CurrentUser, Opportunity, PipelineStage } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const STAGES: Array<{ key: PipelineStage; label: string; accent: string }> = [
  { key: 'NEW', label: 'New', accent: 'border-t-slate-400' },
  { key: 'CONTACTED', label: 'Contacted', accent: 'border-t-blue-500' },
  { key: 'QUOTED', label: 'Quoted', accent: 'border-t-amber-500' },
  { key: 'WON', label: 'Won', accent: 'border-t-emerald-500' },
  { key: 'LOST', label: 'Lost', accent: 'border-t-red-400' },
];

/**
 * Lead pipeline as a kanban board. Drag-and-drop uses the native HTML5 API so
 * there is no extra dependency; on touch devices each card also carries a
 * stage dropdown, which is what actually gets used on a phone.
 */
export function PipelinePage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<PipelineStage | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('');

  const opportunities = useQuery({
    queryKey: ['opportunities', ownerFilter],
    queryFn: () => api.get<Opportunity[]>('/opportunities', { ownerId: ownerFilter || undefined }),
  });
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<CurrentUser[]>('/auth/users'),
  });

  const move = useMutation({
    mutationFn: (input: { id: string; stage: PipelineStage; position: number }) =>
      api.post(`/opportunities/${input.id}/move`, { stage: input.stage, position: input.position }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const columns = useMemo(() => {
    const grouped = new Map<PipelineStage, Opportunity[]>();
    for (const stage of STAGES) grouped.set(stage.key, []);
    for (const opportunity of opportunities.data ?? []) {
      grouped.get(opportunity.stage)?.push(opportunity);
    }
    return grouped;
  }, [opportunities.data]);

  const handleDrop = (stage: PipelineStage) => {
    if (!dragging) return;
    const current = (opportunities.data ?? []).find((entry) => entry.id === dragging);
    setDragOver(null);
    setDragging(null);
    if (!current || current.stage === stage) return;
    move.mutate({ id: dragging, stage, position: 0 });
  };

  if (opportunities.isLoading) return <Spinner label="Loading pipeline…" />;
  if (opportunities.error) return <ErrorNote error={opportunities.error} />;

  const totalOpen = (opportunities.data ?? [])
    .filter((entry) => !['WON', 'LOST'].includes(entry.stage))
    .reduce((sum, entry) => sum + entry.estimatedValue, 0);

  return (
    <>
      <PageHeader
        title="Lead pipeline"
        subtitle={`${money(totalOpen)} in open opportunities`}
        actions={
          <>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="input w-auto py-1.5"
              aria-label="Filter by owner"
            >
              <option value="">All reps</option>
              {(users.data ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            {can('crm:write') ? (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                New opportunity
              </button>
            ) : null}
          </>
        }
      />

      <ErrorNote error={move.error} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {STAGES.map((stage) => {
          const cards = columns.get(stage.key) ?? [];
          const value = cards.reduce((sum, card) => sum + card.estimatedValue, 0);
          return (
            <div
              key={stage.key}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(stage.key);
              }}
              onDragLeave={() => setDragOver((current) => (current === stage.key ? null : current))}
              onDrop={() => handleDrop(stage.key)}
              className={`flex min-h-[140px] flex-col rounded-xl border border-t-4 bg-slate-50 ${stage.accent} ${
                dragOver === stage.key ? 'border-brand-400 bg-brand-50' : 'border-slate-200'
              }`}
            >
              <div className="flex items-baseline justify-between px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                <span className="text-xs text-slate-500">
                  {cards.length} · {moneyShort(value)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {cards.map((card) => (
                  <article
                    key={card.id}
                    draggable={can('crm:write')}
                    onDragStart={() => setDragging(card.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`card cursor-grab p-3 active:cursor-grabbing ${
                      dragging === card.id ? 'opacity-40' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900">{card.title}</p>
                    <Link
                      to={`/crm/companies/${card.companyId}`}
                      className="mt-0.5 block truncate text-xs text-brand-700 hover:underline"
                    >
                      {card.company?.name}
                    </Link>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{money(card.estimatedValue)}</span>
                      <span className="text-slate-400">{card.owner?.name.split(' ')[0]}</span>
                    </div>
                    {card.expectedCloseDate && !['WON', 'LOST'].includes(card.stage) ? (
                      <p className="mt-1 text-xs text-slate-400">
                        Close {relative(card.expectedCloseDate)}
                      </p>
                    ) : null}
                    {card.lostReason ? (
                      <p className="mt-1 text-xs italic text-red-500">{card.lostReason}</p>
                    ) : null}
                    {can('crm:write') ? (
                      <select
                        value={card.stage}
                        onChange={(event) =>
                          move.mutate({
                            id: card.id,
                            stage: event.target.value as PipelineStage,
                            position: 0,
                          })
                        }
                        className="mt-2 w-full rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-600 xl:hidden"
                        aria-label={`Move ${card.title}`}
                      >
                        {STAGES.map((option) => (
                          <option key={option.key} value={option.key}>
                            Move to {option.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </article>
                ))}
                {cards.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-slate-400">
                    {can('crm:write') ? 'Drop a card here' : 'Nothing here'}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <NewOpportunityModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewOpportunityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    companyId: '',
    estimatedValue: '',
    source: '',
    expectedCloseDate: '',
    description: '',
  });

  const companies = useQuery({
    queryKey: ['companies', 'all'],
    queryFn: () => api.get<{ data: Company[] }>('/companies', { pageSize: 200 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/opportunities', {
        title: form.title,
        companyId: form.companyId,
        estimatedValue: Number(form.estimatedValue || 0),
        source: form.source || undefined,
        expectedCloseDate: form.expectedCloseDate || undefined,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setForm({ title: '', companyId: '', estimatedValue: '', source: '', expectedCloseDate: '', description: '' });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New opportunity"
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
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="What is the job?">
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
          <Field label="Estimated value">
            <input
              type="number"
              className="input"
              value={form.estimatedValue}
              onChange={(event) => setForm({ ...form, estimatedValue: event.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Expected close">
            <input
              type="date"
              className="input"
              value={form.expectedCloseDate}
              onChange={(event) => setForm({ ...form, expectedCloseDate: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Source">
          <input
            className="input"
            value={form.source}
            onChange={(event) => setForm({ ...form, source: event.target.value })}
            placeholder="Referral, walk-in, website…"
          />
        </Field>
        <Field label="Notes">
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
