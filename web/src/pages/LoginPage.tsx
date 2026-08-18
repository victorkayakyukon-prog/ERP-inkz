import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { ErrorNote } from '../components/ui';

const DEMO_ACCOUNTS = [
  { email: 'admin@inkzsigns.test', label: 'Admin — everything' },
  { email: 'owner@inkzsigns.test', label: 'Owner / Manager — reporting' },
  { email: 'sales@inkzsigns.test', label: 'Sales rep — CRM & quoting' },
  { email: 'shop@inkzsigns.test', label: 'Shop floor — no pricing' },
  { email: 'install@inkzsigns.test', label: 'Install crew — mobile view' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@inkzsigns.test');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-white">Sign Shop ERP</h1>
          <p className="mt-1 text-sm text-slate-400">
            Leads, quotes, jobs, production, installs and invoices in one place.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-5">
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              autoComplete="username"
              required
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
              autoComplete="current-password"
              required
            />
          </label>
          <ErrorNote error={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Demo accounts — password123
          </p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword('password123');
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-slate-700"
              >
                <span className="font-mono">{account.email}</span>
                <span className="shrink-0 text-slate-500">{account.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
