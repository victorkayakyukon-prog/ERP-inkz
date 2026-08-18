import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { GlobalSearch } from './GlobalSearch';
import { initials } from '../lib/format';
import type { Permission } from '../lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  permission?: Permission;
  end?: boolean;
}

const NAV_SECTIONS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: '▦', permission: 'report:read', end: true },
      { to: '/my-day', label: 'My Day', icon: '☑' },
    ],
  },
  {
    heading: 'Sales',
    items: [
      { to: '/crm/pipeline', label: 'Pipeline', icon: '⑃', permission: 'crm:read' },
      { to: '/crm/companies', label: 'Customers', icon: '⌂', permission: 'crm:read' },
      { to: '/crm/contacts', label: 'Contacts', icon: '☏', permission: 'crm:read' },
      { to: '/quotes', label: 'Quotes', icon: '$', permission: 'quote:read' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { to: '/jobs/board', label: 'Job Board', icon: '▤', permission: 'job:read' },
      { to: '/jobs', label: 'Jobs', icon: '⚑', permission: 'job:read', end: true },
      { to: '/production/schedule', label: 'Shop Schedule', icon: '▭', permission: 'production:read' },
      { to: '/installs', label: 'Installs', icon: '⛟', permission: 'install:read' },
    ],
  },
  {
    heading: 'Inventory',
    items: [
      { to: '/inventory/materials', label: 'Materials', icon: '▣', permission: 'inventory:read' },
      { to: '/inventory/vendors', label: 'Vendors', icon: '⚏', permission: 'inventory:read' },
      { to: '/inventory/purchase-orders', label: 'Purchase Orders', icon: '⇄', permission: 'inventory:read' },
    ],
  },
  {
    heading: 'Money',
    items: [
      { to: '/invoices', label: 'Invoices', icon: '≡', permission: 'invoice:read' },
      { to: '/reports', label: 'Reports', icon: '◔', permission: 'report:read' },
    ],
  },
  {
    heading: 'Admin',
    items: [
      { to: '/settings', label: 'Settings', icon: '⚙', permission: 'settings:write' },
      { to: '/settings/users', label: 'Users', icon: '☺', permission: 'user:manage' },
    ],
  },
];

export function Layout() {
  const { user, logout, can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  const nav = (
    <nav className="flex flex-col gap-5 px-3 py-4">
      {sections.map((section) => (
        <div key={section.heading}>
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {section.heading}
          </p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={navClass}
                onClick={() => setMenuOpen(false)}
              >
                <span aria-hidden className="w-4 text-center text-slate-400">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 lg:flex">
        <div className="border-b border-slate-800 px-5 py-4">
          <p className="text-sm font-semibold text-white">Sign Shop ERP</p>
          <p className="text-xs text-slate-400">Lead to install, one system</p>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-semibold text-white">Sign Shop ERP</p>
              <button
                type="button"
                className="px-2 py-1 text-slate-400 hover:text-white"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-5">
          <button
            type="button"
            className="btn-ghost px-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">{user?.name}</p>
              <p className="text-xs capitalize leading-tight text-slate-500">
                {user?.role.toLowerCase()}
              </p>
            </div>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
              title={user?.email}
            >
              {initials(user?.name ?? '?')}
            </div>
            <button type="button" onClick={logout} className="btn-ghost px-2" title="Sign out">
              ⏻
            </button>
          </div>
        </header>

        <main key={location.pathname} className="flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
