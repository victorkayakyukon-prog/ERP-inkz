import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, humanize, money } from '../../lib/format';
import type { Material, Page, PurchaseOrder, Vendor } from '../../lib/types';
import { useAuth } from '../../lib/auth';

const PO_TONES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIAL: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function PurchaseOrdersPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const orders = useQuery({
    queryKey: ['purchase-orders', status],
    queryFn: () => api.get<Page<PurchaseOrder>>('/purchase-orders', { status: status || undefined, pageSize: 100 }),
  });

  return (
    <>
      <PageHeader
        title="Purchase orders"
        subtitle={orders.data ? `${orders.data.total} orders` : undefined}
        actions={
          can('inventory:write') ? (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              New purchase order
            </button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-4 py-3">
          {['', 'DRAFT', 'SENT', 'PARTIAL', 'RECEIVED'].map((entry) => (
            <button
              key={entry || 'all'}
              type="button"
              onClick={() => setStatus(entry)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status === entry ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {entry ? humanize(entry) : 'All'}
            </button>
          ))}
        </div>

        {orders.isLoading ? (
          <Spinner />
        ) : orders.error ? (
          <div className="p-4">
            <ErrorNote error={orders.error} />
          </div>
        ) : orders.data!.data.length === 0 ? (
          <EmptyState title="No purchase orders" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Total</th>
                  <th>Ordered</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {orders.data!.data.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link to={`/inventory/purchase-orders/${order.id}`} className="link">
                        {order.number}
                      </Link>
                    </td>
                    <td>{order.vendor?.name}</td>
                    <td>
                      <span className={`badge ${PO_TONES[order.status]}`}>{humanize(order.status)}</span>
                    </td>
                    <td className="text-right text-slate-500">{order._count?.items ?? order.items?.length ?? 0}</td>
                    <td className="text-right font-medium">{money(order.total)}</td>
                    <td className="whitespace-nowrap text-slate-500">{order.orderedAt ? date(order.orderedAt) : '—'}</td>
                    <td className="whitespace-nowrap text-slate-500">{order.expectedAt ? date(order.expectedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NewPurchaseOrderModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewPurchaseOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [lines, setLines] = useState<Array<{ materialId: string; quantityOrdered: string }>>([
    { materialId: '', quantityOrdered: '' },
  ]);

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors'), enabled: open });
  const materials = useQuery({
    queryKey: ['materials', 'all'],
    queryFn: () => api.get<Page<Material>>('/materials', { pageSize: 200 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<PurchaseOrder>('/purchase-orders', {
        vendorId,
        expectedAt: expectedAt || undefined,
        items: lines
          .filter((line) => line.materialId && Number(line.quantityOrdered) > 0)
          .map((line) => ({
            materialId: line.materialId,
            quantityOrdered: Number(line.quantityOrdered),
          })),
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onClose();
      navigate(`/inventory/purchase-orders/${order.id}`);
    },
  });

  // Only offer materials this vendor supplies, falling back to everything.
  const vendorMaterials = (materials.data?.data ?? []).filter(
    (material) => !vendorId || material.vendorId === vendorId,
  );
  const options = vendorMaterials.length ? vendorMaterials : materials.data?.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="New purchase order"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!vendorId || create.isPending} onClick={() => create.mutate()}>
            Create PO
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendor">
            <select className="input" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
              <option value="">Select a vendor…</option>
              {(vendors.data ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected">
            <input
              type="date"
              className="input"
              value={expectedAt}
              onChange={(event) => setExpectedAt(event.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="label">Lines</p>
          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex gap-2">
                <select
                  className="input flex-1"
                  value={line.materialId}
                  onChange={(event) => {
                    const next = [...lines];
                    next[index] = { ...line, materialId: event.target.value };
                    setLines(next);
                  }}
                >
                  <option value="">Select a material…</option>
                  {options.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.sku} — {material.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="input w-28"
                  placeholder="Qty"
                  value={line.quantityOrdered}
                  onChange={(event) => {
                    const next = [...lines];
                    next[index] = { ...line, quantityOrdered: event.target.value };
                    setLines(next);
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost px-2"
                  onClick={() => setLines(lines.filter((_, position) => position !== index))}
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary mt-2 py-1 text-xs"
            onClick={() => setLines([...lines, { materialId: '', quantityOrdered: '' }])}
          >
            Add line
          </button>
        </div>
        <ErrorNote error={create.error} />
      </div>
    </Modal>
  );
}
