import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import type { Permission } from './lib/types';

import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyDayPage } from './pages/MyDayPage';
import { PipelinePage } from './pages/crm/PipelinePage';
import { CompaniesPage } from './pages/crm/CompaniesPage';
import { CompanyDetailPage } from './pages/crm/CompanyDetailPage';
import { ContactsPage } from './pages/crm/ContactsPage';
import { QuotesPage } from './pages/quotes/QuotesPage';
import { QuoteDetailPage } from './pages/quotes/QuoteDetailPage';
import { JobBoardPage } from './pages/jobs/JobBoardPage';
import { JobsPage } from './pages/jobs/JobsPage';
import { JobDetailPage } from './pages/jobs/JobDetailPage';
import { SchedulePage } from './pages/production/SchedulePage';
import { InstallsPage } from './pages/production/InstallsPage';
import { InstallDetailPage } from './pages/production/InstallDetailPage';
import { MaterialsPage } from './pages/inventory/MaterialsPage';
import { MaterialDetailPage } from './pages/inventory/MaterialDetailPage';
import { VendorsPage } from './pages/inventory/VendorsPage';
import { PurchaseOrdersPage } from './pages/inventory/PurchaseOrdersPage';
import { PurchaseOrderDetailPage } from './pages/inventory/PurchaseOrderDetailPage';
import { InvoicesPage } from './pages/invoicing/InvoicesPage';
import { InvoiceDetailPage } from './pages/invoicing/InvoiceDetailPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { UsersPage } from './pages/settings/UsersPage';

/**
 * Guards a route by permission. Roles without dashboard access (install crew)
 * land on the screen that is actually useful to them instead of a 403.
 */
function Protected({ permission, children }: { permission?: Permission; children: JSX.Element }) {
  const { user, loading, can } = useAuth();
  if (loading) return <Spinner label="Loading your workspace…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/my-day" replace />;
  return children;
}

/** Where each role should land after signing in. */
function HomeRedirect() {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (can('report:read')) return <DashboardPage />;
  if (user.role === 'INSTALLER') return <Navigate to="/my-day" replace />;
  return <Navigate to="/jobs/board" replace />;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="my-day" element={<MyDayPage />} />

        <Route path="crm">
          <Route path="pipeline" element={<Protected permission="crm:read"><PipelinePage /></Protected>} />
          <Route path="companies" element={<Protected permission="crm:read"><CompaniesPage /></Protected>} />
          <Route path="companies/:id" element={<Protected permission="crm:read"><CompanyDetailPage /></Protected>} />
          <Route path="contacts" element={<Protected permission="crm:read"><ContactsPage /></Protected>} />
        </Route>

        <Route path="quotes" element={<Protected permission="quote:read"><QuotesPage /></Protected>} />
        <Route path="quotes/:id" element={<Protected permission="quote:read"><QuoteDetailPage /></Protected>} />

        <Route path="jobs" element={<Protected permission="job:read"><JobsPage /></Protected>} />
        <Route path="jobs/board" element={<Protected permission="job:read"><JobBoardPage /></Protected>} />
        <Route path="jobs/:id" element={<Protected permission="job:read"><JobDetailPage /></Protected>} />

        <Route path="production/schedule" element={<Protected permission="production:read"><SchedulePage /></Protected>} />
        <Route path="installs" element={<Protected permission="install:read"><InstallsPage /></Protected>} />
        <Route path="installs/:id" element={<Protected permission="install:read"><InstallDetailPage /></Protected>} />

        <Route path="inventory">
          <Route path="materials" element={<Protected permission="inventory:read"><MaterialsPage /></Protected>} />
          <Route path="materials/:id" element={<Protected permission="inventory:read"><MaterialDetailPage /></Protected>} />
          <Route path="vendors" element={<Protected permission="inventory:read"><VendorsPage /></Protected>} />
          <Route path="purchase-orders" element={<Protected permission="inventory:read"><PurchaseOrdersPage /></Protected>} />
          <Route path="purchase-orders/:id" element={<Protected permission="inventory:read"><PurchaseOrderDetailPage /></Protected>} />
        </Route>

        <Route path="invoices" element={<Protected permission="invoice:read"><InvoicesPage /></Protected>} />
        <Route path="invoices/:id" element={<Protected permission="invoice:read"><InvoiceDetailPage /></Protected>} />

        <Route path="reports" element={<Protected permission="report:read"><ReportsPage /></Protected>} />

        <Route path="settings" element={<Protected permission="settings:write"><SettingsPage /></Protected>} />
        <Route path="settings/users" element={<Protected permission="user:manage"><UsersPage /></Protected>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
