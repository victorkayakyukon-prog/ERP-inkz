import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, CardHeader, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { date, humanize, money, number } from '../../lib/format';
import type { PurchaseOrder } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [receiving, setReceiving] = useState(false);

  const order = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: () => api.get<PurchaseOrder>(`/purchase-orders/${id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  const send = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/send`),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${id}/cancel`),
    onSuccess: invalidate,
  });

  if (order.isLoading) return <Spinner />;
  if (order.error) return <ErrorNote error={order.error} />;
  const record = order.data!;

  const outstanding = record.items.some(
    (item) => item.quantityReceived < item.quantityOrdered,
  );

  return (
    <>
      <PageHeader
        title={record.number}
        subtitle={`${record.vendor?.name} · ${humanize(record.status)}`}
        actions={
          can('inventory:write') ? (
            <>
              {record.status === 'DRAFT' ? (
                <button type="button" className="btn-primary" disabled={send.isPending} onClick={() => send.mutate()}>
                  Mark as sent
                </button>
              ) : null}
              {(record.status === 'SENT' || record.status === 'PARTIAL') && outstanding ? (
                <button type="button" className="btn-primary" onClick={() => setReceiving(true)}>
                  Receive stock
                </button>
              ) : null}
              {record.status !== 'RECEIVED' && record.status !== 'CANCELLED' ? (
                <button type="button" className="btn-danger" onClick={() => cancel.mutate()}>
                  Cancel PO
                </button>
              ) : null}
            </>
          ) : null
        }
      />

      <ErrorNote error={send.error ?? cancel.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="text-right">Ordered</th>
                  <th className="text-right">Received</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right">Line total</th>
                </tr>
              </thead>
              <tbody>
                {record.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/inventory/materials/${item.materialId}`} className="link">
                        {item.material?.sku}
                      </Link>
                      <p className="text-xs text-slate-400">{item.material?.name}</p>
                    </td>
                    <td className="text-right">{number(item.quantityOrdered, 2)}</td>
                    <td
                      className={`text-right ${
                        item.quantityReceived >= item.quantityOrdered
                          ? 'text-emerald-600'
                          : item.quantityReceived > 0
                            ? 'text-amber-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {number(item.quantityReceived, 2)}
                    </td>
                    <td className="text-right text-slate-600">{money(item.unitCost)}</td>
                    <td className="text-right font-medium">{money(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-right text-sm font-medium">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-base font-semibold">{money(record.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Details" />
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Vendor" value={record.vendor?.name ?? '—'} />
            <Row label="Status" value={humanize(record.status)} />
            <Row label="Ordered" value={record.orderedAt ? date(record.orderedAt) : '—'} />
            <Row label="Expected" value={record.expectedAt ? date(record.expectedAt) : '—'} />
            <Row label="Received" value={record.receivedAt ? date(record.receivedAt) : '—'} />
          </dl>
          {record.notes ? (
            <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{record.notes}</p>
          ) : null}
        </Card>
      </div>

      {receiving ? (
        <ReceiveModal order={record} onClose={() => setReceiving(false)} onDone={invalidate} />
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

function ReceiveModal({
  order,
  onClose,
  onDone,
}: {
  order: PurchaseOrder;
  onClose: () => void;
  onDone: () => void;
}) {
  // Default each line to whatever is still outstanding — the common case.
  const [quantities, setQuantities] = useState<Record<string, string>>(
    Object.fromEntries(
      order.items.map((item) => [
        item.id,
        String(Math.max(0, item.quantityOrdered - item.quantityReceived)),
      ]),
    ),
  );

  const receive = useMutation({
    mutationFn: () =>
      api.post(`/purchase-orders/${order.id}/receive`, {
        lines: Object.entries(quantities)
          .filter(([, quantity]) => Number(quantity) > 0)
          .map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity) })),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });

  const anything = Object.values(quantities).some((quantity) => Number(quantity) > 0);

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Receive ${order.number}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!anything || receive.isPending} onClick={() => receive.mutate()}>
            {receive.isPending ? 'Receiving…' : 'Receive into stock'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Enter what actually arrived. Stock increases and a receipt movement is logged per line.
        </p>
        {order.items.map((item) => {
          const outstanding = item.quantityOrdered - item.quantityReceived;
          return (
            <div key={item.id} className="flex items-end gap-3 border-b border-slate-100 pb-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{item.material?.sku}</p>
                <p className="truncate text-xs text-slate-500">{item.material?.name}</p>
                <p className="text-xs text-slate-400">
                  {number(item.quantityReceived, 2)} of {number(item.quantityOrdered, 2)} received
                </p>
              </div>
              <Field label="Receiving" className="w-28">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={outstanding}
                  className="input"
                  value={quantities[item.id] ?? ''}
                  onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })}
                />
              </Field>
            </div>
          );
        })}
        <ErrorNote error={receive.error} />
      </div>
    </Modal>
  );
}
