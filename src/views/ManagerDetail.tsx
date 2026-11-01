import { useMemo, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { Manager } from '../types';
import {
  REMINDER_COOLDOWN_HOURS,
  describeAudience,
  dueFor,
  isDone,
  isOverdue,
  lastRemindedAt,
  managerScope,
  personName,
  remindable,
  scopedRecipients,
  statusFor,
  tally,
  toCsv,
} from '../lib/logic';
import { dateTime, dueLabel, relTime, shortDate } from '../lib/time';
import { BackButton, CategoryChip, Empty, ImportantChip, Progress, StatusPill, statusLabel, toneFor } from '../components/ui';

type Filter = 'pending' | 'done' | 'all';

export function ManagerDetail({
  manager,
  id,
  onBack,
  onEdit,
  onFlash,
}: {
  manager: Manager;
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onFlash: (msg: string) => void;
}) {
  const { state, dispatch } = useApp();
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [showBody, setShowBody] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const now = new Date();

  const a = state.announcements.find((x) => x.id === id);
  const scope = managerScope(manager, state);
  const people = useMemo(() => (a ? scopedRecipients(a, state.employees, scope) : []), [a, state.employees, scope.join()]);

  if (!a) {
    return (
      <div className="page">
        <BackButton onClick={onBack} />
        <Empty icon="🔍" title="This announcement no longer exists" />
      </div>
    );
  }

  const t = tally(a, people);
  const overdue = isOverdue(a, now);
  const storesInScope = state.stores.filter((s) => scope.includes(s.id) && a.audience.storeIds.includes(s.id));
  const storeOrder = (sid: string) => state.stores.findIndex((s) => s.id === sid);
  const storeName = (sid: string) => state.stores.find((s) => s.id === sid)?.name ?? sid;
  const canEdit = a.authorId === manager.id;
  const narrowed = people
    .filter((p) => storeFilter === 'all' || p.storeId === storeFilter)
    .filter((p) => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const isNarrowed = narrowed.length !== people.length;
  const toRemind = remindable(a, narrowed, now);
  const pendingCount = narrowed.filter((p) => !isDone(a, p.id)).length;
  const totalPending = t.total - t.done;

  const rows = narrowed
    .filter((p) => (filter === 'all' ? true : filter === 'done' ? isDone(a, p.id) : !isDone(a, p.id)))
    .sort((x, y) => storeOrder(x.storeId) - storeOrder(y.storeId) || x.name.localeCompare(y.name));

  const remind = () => {
    dispatch({
      type: 'remind',
      id: a.id,
      reminder: { at: new Date().toISOString(), by: manager.id, employeeIds: toRemind.map((p) => p.id) },
    });
    onFlash(`Reminder sent to ${toRemind.length} ${toRemind.length === 1 ? 'person' : 'people'}. (In production: a push or text with a link to this post.)`);
  };

  const recordInPerson = (employeeId: string) => {
    dispatch({ type: 'ack', id: a.id, employeeId, at: new Date().toISOString(), recordedBy: manager.id });
    setRecordingId(null);
    onFlash(`Recorded: ${personName(state, employeeId)} confirmed in person.`);
  };

  const exportCsv = () => {
    const csv = toCsv([
      ['Name', 'Store', 'Role', 'Status', 'Confirmed / seen at', 'Last reminded'],
      ...rows.map((p) => [
        p.name,
        storeName(p.storeId),
        p.jobRole,
        statusLabel(statusFor(a, p.id), a.requiresAck) +
          (statusFor(a, p.id) === 'confirmed' && a.acks[p.id].recordedBy ? ` (in person, recorded by ${personName(state, a.acks[p.id].recordedBy!)})` : ''),
        statusFor(a, p.id) === 'confirmed' ? dateTime(a.acks[p.id].at) : !a.requiresAck && a.reads[p.id] ? dateTime(a.reads[p.id]) : '',
        lastRemindedAt(a, p.id) ? dateTime(lastRemindedAt(a, p.id)!) : '',
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${filter}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page">
      <BackButton onClick={onBack} label="All announcements" />

      <div className="detail-head">
        <div className="card-top">
          <CategoryChip category={a.category} />
          {a.requiresAck && <ImportantChip />}
          {a.archived && <span className="chip">Archived</span>}
        </div>
        <h1>{a.title}</h1>
        <div className="muted small">
          {personName(state, a.authorId)} · posted {dateTime(a.createdAt)}
          {a.updatedAt && ` · edited ${relTime(a.updatedAt, now)}${a.version > 1 ? ` (version ${a.version})` : ''}`}
        </div>
        <div className="muted small">To: {describeAudience(a.audience, state)}</div>
        <div className="actions">
          {canEdit && !a.archived && (
            <button className="btn btn-sm" onClick={onEdit}>
              Edit
            </button>
          )}
          {canEdit && (
            <button className="btn btn-sm btn-ghost" onClick={() => dispatch({ type: 'archive', id: a.id, archived: !a.archived })}>
              {a.archived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          {!canEdit && <span className="muted small">Posted by {personName(state, a.authorId)}. Only they can edit it.</span>}
        </div>
      </div>

      <div className="card">
        <div className="detail-summary">{a.summary || a.body.slice(0, 160)}</div>
        <button className="link" onClick={() => setShowBody(!showBody)}>
          {showBody ? 'Hide full post' : 'Show full post'}
        </button>
        {showBody && <div className="detail-body">{a.body}</div>}
      </div>

      <section className="card tracker">
        <div className="tracker-head">
          <div>
            <div className="tracker-big">
              {t.done} <span className="muted">/ {t.total}</span>
            </div>
            <div className="muted">
              {a.requiresAck ? 'confirmed' : 'have seen it'}
              {scope.length === 1 && ` at ${storeName(scope[0])}`}
            </div>
          </div>
          {a.dueAt && a.requiresAck && (
            <div className={`due ${overdue && pendingCount ? 'text-bad' : 'muted'}`}>{dueLabel(a.dueAt, now).text}</div>
          )}
        </div>
        <Progress pct={t.pct} tone={a.requiresAck ? toneFor(t.pct, overdue) : 'ok'} />
        {a.requiresAck && (
          <div className="legend">
            <span>
              <i className="sw sw-confirmed" /> Confirmed {t.confirmed}
            </span>
            <span>
              <i className="sw sw-opened" /> Opened, not confirmed {t.opened}
            </span>
            {t.reconfirm > 0 && (
              <span>
                <i className="sw sw-reconfirm" /> Confirmed an older version {t.reconfirm}
              </span>
            )}
            <span>
              <i className="sw sw-unopened" /> Not opened {t.unopened}
            </span>
          </div>
        )}

        {storesInScope.length > 1 && (
          <div className="by-store">
            <h3 className="sub">By store</h3>
            {storesInScope
              .map((s) => ({ s, st: tally(a, people.filter((p) => p.storeId === s.id)) }))
              .sort((x, y) => x.st.pct - y.st.pct)
              .map(({ s, st }) => (
                <button
                  key={s.id}
                  className={`store-row ${storeFilter === s.id ? 'active' : ''}`}
                  onClick={() => setStoreFilter(storeFilter === s.id ? 'all' : s.id)}
                  aria-label={`Show only ${s.name}: ${st.done} of ${st.total}`}
                >
                  <span className="store-name">{s.name}</span>
                  <Progress pct={st.pct} tone={a.requiresAck ? toneFor(st.pct, overdue) : 'ok'} />
                  <span className="small nowrap">
                    {st.done}/{st.total}
                  </span>
                </button>
              ))}
          </div>
        )}
      </section>

      <section className="card people">
        <div className="people-toolbar">
          <div className="segmented" role="tablist">
            {(['pending', 'done', 'all'] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {f === 'pending' ? (a.requiresAck ? 'Not confirmed' : 'Not seen') : f === 'done' ? (a.requiresAck ? 'Confirmed' : 'Seen') : 'Everyone'}
              </button>
            ))}
          </div>
          <input className="search" placeholder="Search name…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {storeFilter !== 'all' && (
            <button className="chip chip-filter" onClick={() => setStoreFilter('all')}>
              {storeName(storeFilter)} ✕
            </button>
          )}
        </div>

        {a.requiresAck && !a.archived && totalPending > 0 && (
          <div className="remind-bar">
            <button className="btn btn-primary btn-sm" disabled={toRemind.length === 0} onClick={remind}>
              {toRemind.length === 0
                ? pendingCount === 0 ? 'Nobody to remind' : 'All reminded'
                : `Remind ${toRemind.length} ${toRemind.length === 1 ? 'person' : 'people'}${storeFilter !== 'all' ? ` at ${storeName(storeFilter)}` : isNarrowed ? ' shown' : ''}`}
            </button>
            <span className="muted small">
              {pendingCount === 0
                ? 'Everyone in this view has confirmed.'
                : toRemind.length === 0
                ? `Everyone pending was reminded in the last ${REMINDER_COOLDOWN_HOURS}h. We limit this so reminders don't turn into noise.`
                : toRemind.length < pendingCount
                  ? `${pendingCount - toRemind.length} were already reminded in the last ${REMINDER_COOLDOWN_HOURS}h and are skipped.`
                  : 'One reminder per person per day, max.'}
            </span>
            <span className="spacer" />
            <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
              Export list (CSV)
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          query || storeFilter !== 'all' ? (
            <Empty icon="🔍" title="No one matches" />
          ) : filter === 'pending' ? (
            <Empty icon="🎉" title={a.requiresAck ? 'Everyone has confirmed' : 'Everyone has seen this'} />
          ) : (
            <Empty icon="⏳" title={a.requiresAck ? 'No confirmations yet' : 'No one has opened this yet'} />
          )
        ) : (
          <ul className="people-list">
            {rows.map((p) => {
              const st = statusFor(a, p.id);
              const reminded = lastRemindedAt(a, p.id);
              const joinedAfter = p.startedAt > a.createdAt;
              return (
                <li key={p.id}>
                  <div className="person">
                    <div className="person-name">{p.name}</div>
                    <div className="muted small">
                      {p.jobRole}
                      {scope.length > 1 && ` · ${storeName(p.storeId)}`}
                      {joinedAfter && <span className="chip chip-new">New hire</span>}
                    </div>
                  </div>
                  <div className="person-status">
                    <StatusPill status={st} requiresAck={a.requiresAck} />
                    <div className="muted tiny">
                      {st === 'confirmed' &&
                        (a.acks[p.id].recordedBy
                          ? `In person · ${shortDate(a.acks[p.id].at)} · ${personName(state, a.acks[p.id].recordedBy!).split(' ')[0]}`
                          : shortDate(a.acks[p.id].at))}
                      {!a.requiresAck && st === 'opened' && shortDate(a.reads[p.id])}
                      {!isDone(a, p.id) && reminded && `Reminded ${relTime(reminded, now)}`}
                      {a.requiresAck && !isDone(a, p.id) && joinedAfter && dueFor(a, p) && (
                        <div className={new Date(dueFor(a, p)!) < now ? 'text-bad' : ''}>
                          {new Date(dueFor(a, p)!) < now ? 'Was due' : 'Has until'} {shortDate(dueFor(a, p)!)}
                        </div>
                      )}
                    </div>
                    {a.requiresAck && !a.archived && st !== 'confirmed' && recordingId !== p.id && (
                      <button className="link tiny" onClick={() => setRecordingId(p.id)}>
                        Confirmed in person?
                      </button>
                    )}
                  </div>
                  {recordingId === p.id && (
                    <div className="record-box">
                      <span className="small">
                        Record that {p.name.split(' ')[0]} confirmed this in person (huddle, printed sign-off)? It shows as “in person” with your name.
                      </span>
                      <div className="actions">
                        <button className="btn btn-sm btn-primary" onClick={() => recordInPerson(p.id)}>
                          Yes, record it
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setRecordingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
