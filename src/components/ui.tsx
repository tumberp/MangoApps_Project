import type { ReactNode } from 'react';
import type { Category } from '../types';
import { CATEGORIES } from '../types';
import type { PersonStatus } from '../lib/logic';

export function CategoryChip({ category }: { category: Category }) {
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  return <span className={`chip chip-${category}`}>{label}</span>;
}

export function ImportantChip() {
  return <span className="chip chip-important">Needs confirmation</span>;
}

export function Progress({ pct, tone = 'ok' }: { pct: number; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-fill tone-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function toneFor(pct: number, overdue: boolean): 'ok' | 'warn' | 'bad' {
  if (pct >= 95) return 'ok';
  return overdue || pct < 50 ? 'bad' : 'warn';
}

const ACK_LABEL: Record<PersonStatus, string> = {
  confirmed: 'Confirmed',
  reconfirm: 'Needs re-confirm',
  opened: 'Opened, not confirmed',
  unopened: 'Not opened',
};

export function statusLabel(status: PersonStatus, requiresAck: boolean): string {
  if (!requiresAck) return status === 'opened' ? 'Seen' : 'Not seen';
  return ACK_LABEL[status];
}

export function StatusPill({ status, requiresAck }: { status: PersonStatus; requiresAck: boolean }) {
  const tone = !requiresAck && status === 'opened' ? 'confirmed' : status;
  return <span className={`pill pill-${tone}`}>{statusLabel(status, requiresAck)}</span>;
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button className="back" onClick={onClick}>
      ← {label}
    </button>
  );
}
