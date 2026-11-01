import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext';
import type { Announcement, Employee } from '../types';
import { dueFor, employeeFeed, lastRemindedAt, personName, statusFor } from '../lib/logic';
import { dateTime, dueLabel, relTime } from '../lib/time';
import { BackButton, CategoryChip, Empty } from '../components/ui';

export function EmployeeApp({ employee }: { employee: Employee }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { state } = useApp();
  const open = state.announcements.find((a) => a.id === openId);
  const phoneRef = useRef<HTMLDivElement>(null);
  const feedScroll = useRef({ page: 0, phone: 0 });

  // Switching persona: go back to the feed.
  useEffect(() => setOpenId(null), [employee.id]);

  // A post opens at its top; going back returns to where you were in the feed.
  const openPost = (id: string) => {
    feedScroll.current = { page: window.scrollY, phone: phoneRef.current?.scrollTop ?? 0 };
    setOpenId(id);
  };
  useLayoutEffect(() => {
    const { page, phone } = openId ? { page: 0, phone: 0 } : feedScroll.current;
    window.scrollTo(0, page);
    if (phoneRef.current) phoneRef.current.scrollTop = phone;
  }, [openId]);

  return (
    <div className="phone" ref={phoneRef}>
      {open ? (
        <EmployeeDetail a={open} employee={employee} onBack={() => setOpenId(null)} />
      ) : (
        <EmployeeFeed employee={employee} onOpen={openPost} />
      )}
    </div>
  );
}

function EmployeeFeed({ employee, onOpen }: { employee: Employee; onOpen: (id: string) => void }) {
  const { state } = useApp();
  const now = new Date();
  const { action, rest } = employeeFeed(state.announcements, employee);
  const store = state.stores.find((s) => s.id === employee.storeId)?.name;
  const unread = rest.filter((a) => !a.reads[employee.id]).length;

  return (
    <div className="feed">
      <div className="feed-head">
        <div className="hello">Hi {employee.name.split(' ')[0]}</div>
        <div className="muted">
          {store} · {employee.jobRole}
        </div>
      </div>

      {action.length > 0 ? (
        <section className="feed-section">
          <h2 className="section-title">
            Please confirm <span className="count">{action.length}</span>
          </h2>
          <p className="hint">Only safety and policy updates ask for this. One tap each.</p>
          {action.map((a) => (
            <FeedCard key={a.id} a={a} employee={employee} now={now} onOpen={onOpen} />
          ))}
        </section>
      ) : (
        <div className="caught-up">✓ You're all caught up on required updates.</div>
      )}

      <section className="feed-section">
        <h2 className="section-title">
          Updates {unread > 0 && <span className="count count-soft">{unread} new</span>}
        </h2>
        {rest.length === 0 ? (
          <Empty icon="📭" title="No updates yet">
            When your store or the ops team posts something for you, it shows up here.
          </Empty>
        ) : (
          rest.map((a) => <FeedCard key={a.id} a={a} employee={employee} now={now} onOpen={onOpen} />)
        )}
      </section>
    </div>
  );
}

function FeedCard({ a, employee, now, onOpen }: { a: Announcement; employee: Employee; now: Date; onOpen: (id: string) => void }) {
  const { state } = useApp();
  const status = statusFor(a, employee.id);
  const unread = !a.reads[employee.id] && status !== 'reconfirm';
  const pending = a.requiresAck && status !== 'confirmed';
  const dueAt = dueFor(a, employee);
  const due = pending && dueAt ? dueLabel(dueAt, now) : null;
  const reminded = pending && lastRemindedAt(a, employee.id);

  return (
    <button className={`card feed-card ${pending ? 'is-pending' : ''}`} onClick={() => onOpen(a.id)}>
      <div className="card-top">
        <CategoryChip category={a.category} />
        {status === 'reconfirm' && <span className="chip chip-updated">Updated</span>}
        {reminded && <span className="chip chip-reminder">Reminder</span>}
        <span className="spacer" />
        {unread && <span className="dot" aria-label="Unread" />}
        {/* Posted time, not edited time: a typo fix shouldn't make an old post look new. */}
        <span className="muted small">{relTime(a.createdAt, now)}</span>
      </div>
      <div className={`card-title ${unread ? 'bold' : ''}`}>{a.title}</div>
      <div className="card-summary">
        {status === 'reconfirm' && a.changeNote ? <><strong>What changed:</strong> {a.changeNote}</> : a.summary || a.body.slice(0, 140)}
      </div>
      <div className="card-foot">
        <span className="muted small">{personName(state, a.authorId)}</span>
        {due && <span className={`small ${due.overdue ? 'text-bad' : 'text-warn'}`}>{due.text}</span>}
        {a.requiresAck && status === 'confirmed' && <span className="small text-ok">✓ Confirmed</span>}
      </div>
    </button>
  );
}

function EmployeeDetail({ a, employee, onBack }: { a: Announcement; employee: Employee; onBack: () => void }) {
  const { state, dispatch } = useApp();
  const now = new Date();
  const status = statusFor(a, employee.id);
  const ack = a.acks[employee.id];
  const dueAt = dueFor(a, employee);

  useEffect(() => {
    dispatch({ type: 'read', id: a.id, employeeId: employee.id, at: new Date().toISOString() });
  }, [a.id, employee.id, dispatch]);

  const confirm = () => dispatch({ type: 'ack', id: a.id, employeeId: employee.id, at: new Date().toISOString() });

  return (
    <article className="detail">
      <BackButton onClick={onBack} label="Updates" />
      <div className="card-top">
        <CategoryChip category={a.category} />
      </div>
      <h1 className="detail-title">{a.title}</h1>
      <div className="muted small">
        {personName(state, a.authorId)} · {relTime(a.createdAt, now)}
        {a.updatedAt && ` · edited ${relTime(a.updatedAt, now)}`}
      </div>

      {status === 'reconfirm' && (
        <div className="notice notice-warn">
          This was updated after you confirmed it {relTime(ack.at, now)}.
          {a.changeNote ? (
            <>
              {' '}
              <strong>What changed:</strong> {a.changeNote}
            </>
          ) : (
            ' Please read it again.'
          )}
        </div>
      )}

      {a.summary && <p className="detail-summary">{a.summary}</p>}
      <div className="detail-body">{a.body}</div>

      {a.requiresAck && (
        <div className="ack-bar">
          {status === 'confirmed' ? (
            <div className="ack-done">
              {ack.recordedBy
                ? `✓ ${personName(state, ack.recordedBy)} recorded that you confirmed this in person, ${dateTime(ack.at)}`
                : `✓ You confirmed this ${dateTime(ack.at)}`}
            </div>
          ) : (
            <>
              {dueAt && <div className="small muted center">{dueLabel(dueAt, now).text}</div>}
              <button className="btn btn-primary btn-block btn-lg" onClick={confirm}>
                {status === 'reconfirm' ? 'I’ve read the update' : 'I’ve read this'}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
