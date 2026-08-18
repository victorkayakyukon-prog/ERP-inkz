import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { humanize, money, number } from '../../lib/format';
import type { Material, Page, Vendor } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const CATEGORIES = ['SUBSTRATE', 'VINYL', 'INK', 'LAMINATE', 'HARDWARE', 'PAINT', 'ELECTRICAL', 'OTHER'];
const UNITS = ['SQFT', 'EACH', 'ROLL', 'SHEET', 'LINEAR_FT', 'LITER', 'GALLON'];

export function MaterialsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Material | 'new' | null>(null);

  const materials = useQuery({
    queryKey: ['materials', search, category, lowOnly],
    queryFn: () =>
      api.get<Page<Material>>('/materials', {
        q: search || undefined,
        category: category || undefined,
        lowStock: lowOnly || undefined,
        pageSize: 200,
      }),
  });

  const suggestPos = useMutation({
    mutationFn: () => api.post<{ message: string }>('/purchase-orders/suggest'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });

  const lowCount = (materials.data?.data ?? []).filter((material) => material.lowStock).length;

  return (
    <>
      <PageHeader
        title="Materials"
        subtitle={
          lowCount > 0
            ? `${lowCount} item${lowCount === 1 ? '' : 's'} at or below the reorder point`
            : 'Stock levels look healthy'
        }
        actions={
          can('inventory:write') ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                disabled={suggestPos.isPending}
                onClick={() => suggestPos.mutate()}
              >
                {suggestPos.isPending ? 'Building…' : 'Draft POs for low stock'}
              </button>
              <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
                New material
              </button>
            </>
          ) : null
        }
      />

      {suggestPos.data ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {suggestPos.data.message}{' '}
          <Link to="/inventory/purchase-orders" className="font-semibold underline">
            View purchase orders →
          </Link>
        </div>
      ) : null}
      <ErrorNote error={suggestPos.error} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-xs"
            placeholder="Search SKU or name…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input w-auto"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {humanize(entry)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={lowOnly}
              onChange={(event) => setLowOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Low stock only
          </label>
        </div>

        {materials.isLoading ? (
          <Spinner />
        ) : materials.error ? (
          <div className="p-4">
            <ErrorNote error={materials.error} />
          </div>
        ) : materials.data!.data.length === 0 ? (
          <EmptyState title="No materials found" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th className="text-right">On hand</th>
                  <th className="text-right">Reorder at</th>
                  <th className="text-right">Cost</th>
                  <th className="text-right">Sell / sq ft</th>
                  <th>Vendor</th>
                </tr>
              </thead>
              <tbody>
                {materials.data!.data.map((material) => (
                  <tr key={material.id} className={material.lowStock ? 'bg-amber-50' : ''}>
                    <td className="whitespace-nowrap">
                      <Link to={`/inventory/materials/${material.id}`} className="link">
                        {material.sku}
                      </Link>
                    </td>
                    <td className="max-w-[260px] truncate">{material.name}</td>
                    <td className="text-slate-500">{humanize(material.category)}</td>
                    <td className="whitespace-nowrap text-right">
                      <span className={material.lowStock ? 'font-semibold text-amber-700' : ''}>
                        {number(material.stockQty, 2)}
                      </span>
                      <span className="ml-1 text-xs text-slate-400">{humanize(material.unit)}</span>
                    </td>
                    <td className="text-right text-slate-500">{number(material.reorderPoint, 0)}</td>
                    <td className="text-right text-slate-600">{money(material.unitCost)}</td>
                    <td className="text-right text-slate-600">
                      {material.pricePerSqFt > 0 ? money(material.pricePerSqFt) : '—'}
                    </td>
                    <td className="max-w-[140px] truncate text-slate-500">{material.vendor?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <MaterialModal
          onClose={() => setEditing(null)}
          material={editing === 'new' ? undefined : editing}
        />
      ) : null}
    </>
  );
}

export function MaterialModal({ material, onClose }: { material?: Material; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    sku: material?.sku ?? '',
    name: material?.name ?? '',
    category: material?.category ?? 'SUBSTRATE',
    unit: material?.unit ?? 'SHEET',
    unitCost: String(material?.unitCost ?? ''),
    pricePerSqFt: String(material?.pricePerSqFt ?? ''),
    minimumCharge: String(material?.minimumCharge ?? 0),
    sheetWidthIn: String(material?.sheetWidthIn ?? ''),
    sheetHeightIn: String(material?.sheetHeightIn ?? ''),
    stockQty: String(material?.stockQty ?? 0),
    reorderPoint: String(material?.reorderPoint ?? 0),
    reorderQty: String(material?.reorderQty ?? 0),
    vendorId: material?.vendorId ?? '',
    notes: material?.notes ?? '',
  });

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        sku: form.sku,
        name: form.name,
        category: form.category,
        unit: form.unit,
        unitCost: Number(form.unitCost || 0),
        pricePerSqFt: Number(form.pricePerSqFt || 0),
        minimumCharge: Number(form.minimumCharge || 0),
        sheetWidthIn: form.sheetWidthIn ? Number(form.sheetWidthIn) : null,
        sheetHeightIn: form.sheetHeightIn ? Number(form.sheetHeightIn) : null,
        reorderPoint: Number(form.reorderPoint || 0),
        reorderQty: Number(form.reorderQty || 0),
        vendorId: form.vendorId || null,
        notes: form.notes || null,
      };
      return material
        ? api.patch(`/materials/${material.id}`, payload)
        : api.post('/materials', { ...payload, stockQty: Number(form.stockQty || 0) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      queryClient.invalidateQueries({ queryKey: ['material'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={material ? `Edit ${material.sku}` : 'New material'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.sku || !form.name || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SKU">
          <input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </Field>
        <Field label="Category">
          <select
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((entry) => (
              <option key={entry} value={entry}>
                {humanize(entry)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Stock unit">
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {humanize(unit)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor">
          <select
            className="input"
            value={form.vendorId}
            onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
          >
            <option value="">—</option>
            {(vendors.data ?? []).map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cost per unit" hint="What you pay the vendor">
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
        </Field>
        <Field label="Sell price per sq ft" hint="Default used by the quote builder">
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.pricePerSqFt}
            onChange={(e) => setForm({ ...form, pricePerSqFt: e.target.value })}
          />
        </Field>
        <Field label="Sheet width (in)" hint="Lets sq ft convert into sheets">
          <input
            type="number"
            step="0.25"
            className="input"
            value={form.sheetWidthIn}
            onChange={(e) => setForm({ ...form, sheetWidthIn: e.target.value })}
          />
        </Field>
        <Field label="Sheet height (in)">
          <input
            type="number"
            step="0.25"
            className="input"
            value={form.sheetHeightIn}
            onChange={(e) => setForm({ ...form, sheetHeightIn: e.target.value })}
          />
        </Field>
        {!material ? (
          <Field label="Opening stock">
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.stockQty}
              onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            />
          </Field>
        ) : null}
        <Field label="Reorder point">
          <input
            type="number"
            step="1"
            className="input"
            value={form.reorderPoint}
            onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })}
          />
        </Field>
        <Field label="Reorder quantity">
          <input
            type="number"
            step="1"
            className="input"
            value={form.reorderQty}
            onChange={(e) => setForm({ ...form, reorderQty: e.target.value })}
          />
        </Field>
        <Field label="Minimum charge" hint="Line-item floor when this material is used">
          <input
            type="number"
            step="1"
            className="input"
            value={form.minimumCharge}
            onChange={(e) => setForm({ ...form, minimumCharge: e.target.value })}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error} />
        </div>
      </div>
    </Modal>
  );
}
