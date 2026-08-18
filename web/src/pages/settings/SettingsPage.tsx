import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, CardHeader, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { dateTime, humanize } from '../../lib/format';
import type { Page, Settings } from '../../lib/types';

interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  summary: string;
  createdAt: string;
  user?: { id: string; name: string } | null;
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Settings>>({});
  const [saved, setSaved] = useState(false);

  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<Page<AuditRow>>('/settings/audit', { pageSize: 40 }),
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.patch<Settings>('/settings', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (settings.isLoading) return <Spinner />;
  if (settings.error) return <ErrorNote error={settings.error} />;

  const set = (key: keyof Settings) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });
  const setNumber = (key: keyof Settings) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: Number(event.target.value) });

  return (
    <>
      <PageHeader
        title="Shop settings"
        subtitle="Defaults the quoting engine and invoicing use everywhere."
        actions={
          <>
            {saved ? <span className="text-sm font-medium text-emerald-600">Saved</span> : null}
            <button type="button" className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </>
        }
      />

      <ErrorNote error={save.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Shop identity" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Shop name" className="sm:col-span-2">
              <input className="input" value={form.shopName ?? ''} onChange={set('shopName')} />
            </Field>
            <Field label="Email">
              <input className="input" value={form.shopEmail ?? ''} onChange={set('shopEmail')} />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.shopPhone ?? ''} onChange={set('shopPhone')} />
            </Field>
            <Field label="Street" className="sm:col-span-2">
              <input className="input" value={form.shopStreet ?? ''} onChange={set('shopStreet')} />
            </Field>
            <Field label="City">
              <input className="input" value={form.shopCity ?? ''} onChange={set('shopCity')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="State">
                <input className="input" value={form.shopState ?? ''} onChange={set('shopState')} />
              </Field>
              <Field label="ZIP">
                <input className="input" value={form.shopZip ?? ''} onChange={set('shopZip')} />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pricing defaults" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Default markup %" hint="Applied to material, finishing and labor">
              <input
                type="number"
                step="1"
                className="input"
                value={form.defaultMarkupPct ?? 0}
                onChange={setNumber('defaultMarkupPct')}
              />
            </Field>
            <Field label="Minimum charge" hint="Floor per quote line">
              <input
                type="number"
                step="1"
                className="input"
                value={form.defaultMinimumCharge ?? 0}
                onChange={setNumber('defaultMinimumCharge')}
              />
            </Field>
            <Field label="Rush fee %">
              <input
                type="number"
                step="1"
                className="input"
                value={form.rushFeePct ?? 0}
                onChange={setNumber('rushFeePct')}
              />
            </Field>
            <Field label="Shop labor rate / hr">
              <input
                type="number"
                step="1"
                className="input"
                value={form.laborRate ?? 0}
                onChange={setNumber('laborRate')}
              />
            </Field>
            <Field label="Install rate / hr">
              <input
                type="number"
                step="1"
                className="input"
                value={form.installRate ?? 0}
                onChange={setNumber('installRate')}
              />
            </Field>
            <Field label="Deposit %" hint="Used by deposit invoices">
              <input
                type="number"
                step="1"
                className="input"
                value={form.depositPct ?? 0}
                onChange={setNumber('depositPct')}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Finishing charges" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Laminate / sq ft">
              <input
                type="number"
                step="0.05"
                className="input"
                value={form.laminateCostPerSqFt ?? 0}
                onChange={setNumber('laminateCostPerSqFt')}
              />
            </Field>
            <Field label="Mounting / sq ft">
              <input
                type="number"
                step="0.05"
                className="input"
                value={form.mountingCostPerSqFt ?? 0}
                onChange={setNumber('mountingCostPerSqFt')}
              />
            </Field>
            <Field label="Contour cut fee" hint="Per piece">
              <input
                type="number"
                step="1"
                className="input"
                value={form.contourCutFee ?? 0}
                onChange={setNumber('contourCutFee')}
              />
            </Field>
            <Field label="Grommet fee" hint="Per grommet, one every 24 inches">
              <input
                type="number"
                step="0.05"
                className="input"
                value={form.grommetFee ?? 0}
                onChange={setNumber('grommetFee')}
              />
            </Field>
            <Field label="Hem fee / linear ft" className="sm:col-span-2">
              <input
                type="number"
                step="0.05"
                className="input"
                value={form.hemFeePerLinearFt ?? 0}
                onChange={setNumber('hemFeePerLinearFt')}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tax and terms" />
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Default tax rate %" hint="Overridden per customer when set">
              <input
                type="number"
                step="0.125"
                className="input"
                value={form.defaultTaxRatePct ?? 0}
                onChange={setNumber('defaultTaxRatePct')}
              />
            </Field>
            <Field label="Tax jurisdiction">
              <input className="input" value={form.taxJurisdiction ?? ''} onChange={set('taxJurisdiction')} />
            </Field>
            <Field label="Quote valid for (days)">
              <input
                type="number"
                step="1"
                className="input"
                value={form.quoteValidDays ?? 30}
                onChange={setNumber('quoteValidDays')}
              />
            </Field>
            <Field label="Payment terms" hint='e.g. "Net 30" — drives invoice due dates'>
              <input className="input" value={form.paymentTerms ?? ''} onChange={set('paymentTerms')} />
            </Field>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 sm:col-span-2">
              Tax is a single flat rate per jurisdiction. Multi-jurisdiction and destination-based rates
              would mean a rate table keyed by ZIP — noted in docs/INTEGRATIONS.md.
            </p>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Audit log" />
        {audit.isLoading ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Entity</th>
                  <th>Action</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data?.data ?? []).map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-slate-500">{dateTime(row.createdAt)}</td>
                    <td className="text-slate-600">{row.user?.name ?? 'System'}</td>
                    <td className="text-slate-500">{row.entity}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-600">{humanize(row.action)}</span>
                    </td>
                    <td className="text-slate-700">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
