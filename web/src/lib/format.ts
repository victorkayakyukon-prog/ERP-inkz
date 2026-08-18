const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export const money = (value?: number | null): string =>
  value === undefined || value === null ? '—' : currencyFormatter.format(value);

/** Compact form for dashboard tiles: $12.4k rather than $12,400.00. */
export const moneyShort = (value?: number | null): string => {
  if (value === undefined || value === null) return '—';
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  }
  return currencyFormatter.format(value);
};

export const number = (value?: number | null, digits = 2): string =>
  value === undefined || value === null
    ? '—'
    : value.toLocaleString('en-US', { maximumFractionDigits: digits });

export const date = (value?: string | Date | null): string => {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const dateShort = (value?: string | Date | null): string => {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const dateTime = (value?: string | Date | null): string => {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return parsed.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

/** "3 days ago" / "in 2 days" — used across timelines and due dates. */
export const relative = (value?: string | Date | null): string => {
  if (!value) return '—';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  const diffDays = Math.round((parsed.getTime() - Date.now()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
};

export const dateInput = (value?: string | Date | null): string => {
  if (!value) return '';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

export const today = (): string => new Date().toISOString().slice(0, 10);

export const addDays = (isoDate: string, days: number): string =>
  new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Turns SCREAMING_SNAKE enums into human text. */
export const humanize = (value?: string | null): string =>
  !value ? '—' : value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const dimensions = (widthIn?: number | null, heightIn?: number | null): string => {
  if (!widthIn && !heightIn) return '—';
  const feet = (inches: number) => (inches >= 12 ? ` (${(inches / 12).toFixed(2).replace(/\.?0+$/, '')}')` : '');
  return `${number(widthIn, 2)}"${feet(widthIn ?? 0)} × ${number(heightIn, 2)}"${feet(heightIn ?? 0)}`;
};

export const fileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const initials = (name: string): string =>
  name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
