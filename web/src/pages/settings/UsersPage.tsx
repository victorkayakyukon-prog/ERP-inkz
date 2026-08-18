import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, Field, PageHeader, Spinner } from '../../components/ui';
import { Modal } from '../../components/Modal';
import type { CurrentUser, Role } from '../../lib/types';

const ROLE_NOTES: Record<Role, string> = {
  ADMIN: 'Everything, including user management',
  MANAGER: 'All modules and reporting',
  SALES: 'CRM, quoting, jobs and invoicing',
  PRODUCTION: 'Job board, inventory — no pricing visible',
  INSTALLER: 'Install schedule and completion only',
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CurrentUser | 'new' | null>(null);

  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<CurrentUser[]>('/auth/users') });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.post(`/auth/users/${id}/deactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Roles decide what each person sees — the shop floor never sees pricing."
        actions={
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
            New user
          </button>
        }
      />

      <ErrorNote error={deactivate.error} />

      <Card>
        {users.isLoading ? (
          <Spinner />
        ) : (users.data ?? []).length === 0 ? (
          <EmptyState title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Access</th>
                  <th>Phone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium text-slate-800">{user.name}</td>
                    <td className="text-slate-600">{user.email}</td>
                    <td>
                      <span className="badge bg-slate-100 text-slate-700">{user.role}</span>
                    </td>
                    <td className="max-w-[280px] text-xs text-slate-500">{ROLE_NOTES[user.role]}</td>
                    <td className="whitespace-nowrap text-slate-500">{user.phone ?? '—'}</td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        type="button"
                        className="mr-3 text-xs text-slate-400 hover:text-slate-700"
                        onClick={() => setEditing(user)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => deactivate.mutate(user.id)}
                      >
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing ? (
        <UserModal onClose={() => setEditing(null)} user={editing === 'new' ? undefined : editing} />
      ) : null}
    </>
  );
}

function UserModal({ user, onClose }: { user?: CurrentUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: (user?.role ?? 'SALES') as Role,
    phone: user?.phone ?? '',
    password: '',
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || undefined,
        ...(form.password ? { password: form.password } : {}),
      };
      return user ? api.patch(`/auth/users/${user.id}`, payload) : api.post('/auth/users', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'New user'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.name || !form.email || (!user && form.password.length < 8) || save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label="Role" hint={ROLE_NOTES[form.role]}>
          <select
            className="input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            {(Object.keys(ROLE_NOTES) as Role[]).map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone">
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field
          label={user ? 'New password' : 'Password'}
          hint={user ? 'Leave blank to keep the current password' : 'At least 8 characters'}
        >
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
