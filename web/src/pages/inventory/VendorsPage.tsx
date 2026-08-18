import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import type { Vendor } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function VendorsPage() {
  const { can } = useAuth();
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);

  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle={`${vendors.data?.length ?? 0} suppliers`}
        actions={
          can('inventory:write') ? (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              New vendor
            </button>
          ) : null
        }
      />

      <Card>
        {vendors.isLoading ? (
          <Spinner />
        ) : vendors.error ? (
          <div className="p-4">
            <ErrorNote error={vendors.error} />
          </div>
        ) : (vendors.data ?? []).length === 0 ? (
          <EmptyState title="No vendors yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className="text-right">Materials</th>
                  <th className="text-right">POs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(vendors.data ?? []).map((vendor) => (
                  <tr key={vendor.id}>
                    <td className="font-medium text-slate-800">{vendor.name}</td>
                    <td className="text-slate-600">{vendor.contactName ?? '—'}</td>
                    <td className="whitespace-nowrap text-slate-600">{vendor.phone ?? '—'}</td>
                    <td className="text-slate-600">{vendor.email ?? '—'}</td>
                    <td className="text-right text-slate-500">{vendor._count?.materials ?? 0}</td>
                    <td className="text-right text-slate-500">{vendor._count?.purchaseOrders ?? 0}</td>
                    <td className="text-right">
                      {can('inventory:write') ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-slate-700"
                          onClick={() => setEditing(vendor)}
                        >
                          Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <VendorModal onClose={() => setEditing(null)} vendor={editing === 'new' ? undefined : editing} />
      ) : null}
    </>
  );
}

function VendorModal({ vendor, onClose }: { vendor?: Vendor; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: vendor?.name ?? '',
    contactName: vendor?.contactName ?? '',
    email: vendor?.email ?? '',
    phone: vendor?.phone ?? '',
    website: vendor?.website ?? '',
    street: vendor?.street ?? '',
    city: vendor?.city ?? '',
    state: vendor?.state ?? '',
    zip: vendor?.zip ?? '',
    notes: vendor?.notes ?? '',
  });

  const save = useMutation({
    mutationFn: () => (vendor ? api.patch(`/vendors/${vendor.id}`, form) : api.post('/vendors', form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={vendor ? `Edit ${vendor.name}` : 'New vendor'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={!form.name || save.isPending} onClick={() => save.mutate()}>
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vendor name" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Contact name">
          <input
            className="input"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Website">
          <input className="input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </Field>
        <Field label="Street" className="sm:col-span-2">
          <input className="input" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
        </Field>
        <Field label="City">
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State">
            <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </Field>
          <Field label="ZIP">
            <input className="input" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <ErrorNote error={save.error} />
        </div>
      </div>
    </Modal>
  );
}
