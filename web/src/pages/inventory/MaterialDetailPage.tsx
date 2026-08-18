import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, CardHeader, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { MaterialModal } from './MaterialsPage';
import { dateTime, humanize, money, number } from '../../lib/format';
import type { Material, StockMovement } from '../../lib/types';
import { useAuth } from '../../lib/auth';

type MaterialDetail = Material & { stockMovements: StockMovement[] };

export function MaterialDetailPage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const material = useQuery({
    queryKey: ['material', id],
    queryFn: () => api.get<MaterialDetail>(`/materials/${id}`),
  });

  if (material.isLoading) return <Spinner />;
  if (material.error) return <ErrorNote error={material.error} />;
  const record = material.data!;

  const sheetSqFt =
    record.sheetWidthIn && record.sheetHeightIn
      ? (record.sheetWidthIn * record.sheetHeightIn) / 144
      : null;

  return (
    <>
      <PageHeader
        title={`${record.sku} — ${record.name}`}
        subtitle={`${humanize(record.category)} · ${record.vendor?.name ?? 'No vendor'}`}
        actions={
          can('inventory:write') ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => setAdjusting(true)}>
                Adjust stock
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit
              </button>
            </>
          ) : null
        }
      />

      {record.lowStock ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          At or below the reorder point — {number(record.stockQty, 2)} {humanize(record.unit)} on hand,
          reorder at {number(record.reorderPoint, 0)}.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Stock movements" />
          {record.stockMovements.length === 0 ? (
            <EmptyState title="No movements recorded" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Balance</th>
                    <th>Job</th>
                    <th>By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {record.stockMovements.map((movement) => (
                    <tr key={movement.id}>
                      <td className="whitespace-nowrap text-slate-500">{dateTime(movement.createdAt)}</td>
                      <td>
                        <span
                          className={`badge ${
                            movement.quantity < 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {humanize(movement.type)}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap text-right font-medium ${
                          movement.quantity < 0 ? 'text-red-600' : 'text-emerald-600'
                        }`}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {number(movement.quantity, 3)}
                      </td>
                      <td className="text-right text-slate-600">{number(movement.balanceAfter, 3)}</td>
                      <td>
                        {movement.job ? (
                          <Link to={`/jobs/${movement.job.id}`} className="link">
                            {movement.job.jobNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-slate-500">{movement.user?.name ?? '—'}</td>
                      <td className="max-w-[200px] truncate text-slate-500">{movement.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Details" />
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="On hand" value={`${number(record.stockQty, 2)} ${humanize(record.unit)}`} />
            <Row label="Reorder point" value={number(record.reorderPoint, 0)} />
            <Row label="Reorder qty" value={number(record.reorderQty, 0)} />
            <Row label="Unit cost" value={money(record.unitCost)} />
            <Row label="Sell / sq ft" value={record.pricePerSqFt > 0 ? money(record.pricePerSqFt) : '—'} />
            {sheetSqFt ? (
              <>
                <Row label="Sheet size" value={`${record.sheetWidthIn}" × ${record.sheetHeightIn}"`} />
                <Row label="Sq ft per unit" value={number(sheetSqFt)} />
                <Row label="Cost per sq ft" value={money(record.unitCost / sheetSqFt)} />
              </>
            ) : null}
            <Row label="Stock value" value={money(record.stockQty * record.unitCost)} />
            <Row label="Vendor" value={record.vendor?.name ?? '—'} />
          </dl>
          {record.notes ? (
            <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{record.notes}</p>
          ) : null}
        </Card>
      </div>

      {editing ? <MaterialModal material={record} onClose={() => setEditing(false)} /> : null}
      {adjusting ? <AdjustModal material={record} onClose={() => setAdjusting(false)} /> : null}
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

function AdjustModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [type, setType] = useState('ADJUSTMENT');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const adjust = useMutation({
    mutationFn: () =>
      api.post('/stock-movements', {
        materialId: material.id,
        type,
        quantity: Number(quantity),
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material', material.id] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${material.sku}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!quantity || adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            Record
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          On hand: <strong>{number(material.stockQty, 2)} {humanize(material.unit)}</strong>
        </p>
        <Field label="Movement type">
          <select className="input" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="ADJUSTMENT">Adjustment — cycle count correction</option>
            <option value="RECEIPT">Receipt — stock arriving outside a PO</option>
            <option value="USAGE">Usage — pulled for a job</option>
            <option value="WASTE">Waste — scrapped material</option>
            <option value="RETURN">Return — back on the shelf</option>
          </select>
        </Field>
        <Field
          label="Quantity"
          hint={
            type === 'USAGE' || type === 'WASTE'
              ? 'Always reduces stock'
              : 'Use a negative number to reduce stock'
          }
        >
          <input
            type="number"
            step="0.01"
            className="input"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <ErrorNote error={adjust.error} />
      </div>
    </Modal>
  );
}
