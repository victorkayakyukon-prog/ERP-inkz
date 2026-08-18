import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Hit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_LABELS: Record<string, string> = {
  company: 'Customer',
  contact: 'Contact',
  job: 'Job',
  quote: 'Quote',
  invoice: 'Invoice',
  material: 'Material',
};

/** Search across customers, job numbers, quotes, invoices and materials. */
export function GlobalSearch() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ['search', term],
    queryFn: () => api.get<{ hits: Hit[] }>('/search', { q: term }),
    enabled: term.trim().length >= 2,
    staleTime: 10_000,
  });

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl+K jumps straight to search from anywhere.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const hits = data?.hits ?? [];

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        ref={inputRef}
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, jobs, invoices…  ⌘K"
        className="input py-1.5"
        aria-label="Global search"
      />
      {open && term.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {isFetching && !hits.length ? (
            <p className="px-3 py-3 text-sm text-slate-500">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">No matches for “{term}”</p>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.type}-${hit.id}`}
                type="button"
                onClick={() => {
                  navigate(hit.href);
                  setOpen(false);
                  setTerm('');
                }}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {TYPE_LABELS[hit.type] ?? hit.type}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{hit.title}</span>
                  <span className="block truncate text-xs text-slate-500">{hit.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
