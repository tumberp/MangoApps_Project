import { useEffect, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { Announcement, Manager } from '../types';
import { isOverdue, isOverdueFor, managerScope, scopedRecipients, tally, visibleToManager } from '../lib/logic';
import { dueLabel, relTime } from '../lib/time';
import { CategoryChip, Empty, Progress, toneFor } from '../components/ui';
import { ManagerDetail } from './ManagerDetail';
import { Composer } from './Composer';

type Screen = { name: 'home' } | { name: 'detail'; id: string } | { name: 'compose'; editId?: string };

export function ManagerApp({ manager }: { manager: Manager }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => setScreen({ name: 'home' }), [manager.id]);
  // Every screen change starts at the top of the page.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="manager">
      {flash && (
        <div className="toast" role="status">
          {flash}
        </div>
      )}
      {screen.name === 'home' && (
        <ManagerHome manager={manager} onOpen={(id) => setScreen({ name: 'detail', id })} onCompose={() => setScreen({ name: 'compose' })} />
      )}
      {screen.name === 'detail' && (
        <ManagerDetail
          manager={manager}
          id={screen.id}
          onBack={() => setScreen({ name: 'home' })}
          onEdit={() => setScreen({ name: 'compose', editId: screen.id })}
          onFlash={setFlash}
        />
      )}
      {screen.name === 'compose' && (
        <Composer
          manager={manager}
          editId={screen.editId}
          onCancel={() => setScreen(screen.editId ? { name: 'detail', id: screen.editId } : { name: 'home' })}
          onDone={(id, message) => {
            setFlash(message);
            setScreen({ name: 'detail', id });
          }}
        />
      )}
    </div>
  );
}

function ManagerHome({ manager, onOpen, onCompose }: { manager: Manager; onOpen: (id: string) => void; onCompose: () => void }) {
  const { state } = useApp();
  const now = new Date();
  const scope = managerScope(manager, state);
  const visible = state.announcements.filter((a) => visibleToManager(a, manager)).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const active = visible.filter((a) => !a.archived);
  const archived = visible.filter((a) => a.archived);
  const tracked = active.filter((a) => a.requiresAck);
  const other = active.filter((a) => !a.requiresAck);

  const headcount = state.employees.filter((e) => scope.includes(e.storeId)).length;
  const pendingPeople = new Set<string>();
  let overduePeople = 0;
  for (const a of tracked) {
    for (const p of scopedRecipients(a, state.employees, scope)) {
      if (a.acks[p.id]?.version === a.version) continue;
      pendingPeople.add(p.id);
      if (isOverdueFor(a, p, now)) overduePeople++;
    }
  }
  const storeLabel = manager.storeId ? state.stores.find((s) => s.id === manager.storeId)?.name : `All ${state.stores.length} stores`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Announcements</h1>
          <div className="muted">
            {manager.name} · {storeLabel} · {headcount} employees
          </div>
        </div>
        <button className="btn btn-primary" onClick={onCompose}>
          + New announcement
        </button>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="kpi-num">{pendingPeople.size}</div>
          <div className="kpi-label">people still need to confirm something</div>
        </div>
        <div className={`kpi ${overduePeople ? 'kpi-bad' : ''}`}>
          <div className="kpi-num">{overduePeople}</div>
          <div className="kpi-label">confirmations overdue</div>
        </div>
        <div className="kpi">
          <div className="kpi-num">{active.length}</div>
          <div className="kpi-label">active posts</div>
        </div>
      </div>

      {active.length === 0 && (
        <Empty icon="📣" title="No announcements yet">
          Post your first update. Use “Needs confirmation” only for safety and policy changes.
        </Empty>
      )}

      {tracked.length > 0 && (
        <section>
          <h2 className="section-title">Needs confirmation</h2>
          <div className="grid">
            {tracked.map((a) => (
              <TrackedCard key={a.id} a={a} scope={scope} now={now} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section>
          <h2 className="section-title">Other updates</h2>
          <div className="list">
            {other.map((a) => {
              const t = tally(a, scopedRecipients(a, state.employees, scope));
              return (
                <button key={a.id} className="card row-card" onClick={() => onOpen(a.id)}>
                  <CategoryChip category={a.category} />
                  <span className="row-title">{a.title}</span>
                  <span className="muted small nowrap">
                    Seen by {t.done}/{t.total}
                  </span>
                  <span className="muted small nowrap hide-sm">{relTime(a.createdAt, now)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <details className="archived">
          <summary>Archived ({archived.length})</summary>
          <div className="list">
            {archived.map((a) => (
              <button key={a.id} className="card row-card" onClick={() => onOpen(a.id)}>
                <CategoryChip category={a.category} />
                <span className="row-title">{a.title}</span>
                <span className="muted small">{relTime(a.createdAt, now)}</span>
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TrackedCard({ a, scope, now, onOpen }: { a: Announcement; scope: string[]; now: Date; onOpen: (id: string) => void }) {
  const { state } = useApp();
  const t = tally(a, scopedRecipients(a, state.employees, scope));
  const overdue = isOverdue(a, now);
  const due = a.dueAt ? dueLabel(a.dueAt, now) : null;
  const pending = t.total - t.confirmed;

  return (
    <button className="card tracked-card" onClick={() => onOpen(a.id)}>
      <div className="card-top">
        <CategoryChip category={a.category} />
        {a.updatedAt && a.version > 1 && <span className="chip chip-updated">v{a.version}</span>}
        <span className="spacer" />
        <span className="muted small">{relTime(a.createdAt, now)}</span>
      </div>
      <div className="card-title">{a.title}</div>
      <div className="tracked-stats">
        <span className="big">{t.pct}%</span>
        <span className="muted">
          {t.confirmed} of {t.total} confirmed
        </span>
      </div>
      <Progress pct={t.pct} tone={toneFor(t.pct, overdue)} />
      <div className="card-foot">
        <span className={`small ${pending ? (overdue ? 'text-bad' : 'text-warn') : 'text-ok'}`}>
          {pending ? `${pending} still pending` : '✓ Everyone confirmed'}
        </span>
        {due && pending > 0 && <span className={`small ${due.overdue ? 'text-bad' : 'muted'}`}>{due.text}</span>}
      </div>
    </button>
  );
}
