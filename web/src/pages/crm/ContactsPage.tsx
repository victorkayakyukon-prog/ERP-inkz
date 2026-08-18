import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Card, EmptyState, ErrorNote, PageHeader, Spinner } from '../../components/ui';
import { ContactModal } from './CompanyDetailPage';
import type { Contact, Page } from '../../lib/types';
import { useAuth } from '../../lib/auth';

export function ContactsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);

  const contacts = useQuery({
    queryKey: ['contacts', search, page],
    queryFn: () => api.get<Page<Contact>>('/contacts', { q: search || undefined, page, pageSize: 25 }),
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={contacts.data ? `${contacts.data.total} people across your customers` : undefined}
        actions={
          can('crm:write') ? (
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              New contact
            </button>
          ) : null
        }
      />

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            className="input max-w-sm"
            placeholder="Search by name, email or phone…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        {contacts.isLoading ? (
          <Spinner />
        ) : contacts.error ? (
          <div className="p-4">
            <ErrorNote error={contacts.error} />
          </div>
        ) : contacts.data!.data.length === 0 ? (
          <EmptyState title="No contacts found" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Customer</th>
                  <th>Title</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contacts.data!.data.map((contact) => (
                  <tr key={contact.id}>
                    <td className="font-medium text-slate-800">
                      {contact.firstName} {contact.lastName}
                      {contact.isPrimary ? (
                        <span className="badge ml-2 bg-brand-100 text-brand-700">Primary</span>
                      ) : null}
                    </td>
                    <td>
                      {contact.company ? (
                        <Link to={`/crm/companies/${contact.company.id}`} className="link">
                          {contact.company.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-slate-600">{contact.title ?? '—'}</td>
                    <td>
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="link">
                          {contact.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{contact.phone ?? contact.mobile ?? '—'}</td>
                    <td className="text-right">
                      {can('crm:write') ? (
                        <button
                          type="button"
                          className="text-xs text-slate-400 hover:text-slate-700"
                          onClick={() => setEditing(contact)}
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

        {contacts.data && contacts.data.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">
              Page {contacts.data.page} of {contacts.data.totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= contacts.data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {editing ? (
        <ContactModal
          open
          onClose={() => setEditing(null)}
          contact={editing === 'new' ? undefined : editing}
        />
      ) : null}
    </>
  );
}
