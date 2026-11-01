import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import type { Announcement, JobRole, Manager } from '../types';
import { CATEGORIES, JOB_ROLES } from '../types';
import {
  SUMMARY_MAX,
  TITLE_MAX,
  audienceSize,
  dueDateToIso,
  isoToDueDate,
  managerScope,
  recentAckRequests,
  validateDraft,
  type Draft,
  type DraftErrors,
} from '../lib/logic';
import { reviewDraft, suggest, type Suggestion } from '../lib/mockAi';
import { BackButton, CategoryChip } from '../components/ui';

function draftFrom(a: Announcement): Draft {
  return {
    title: a.title,
    body: a.body,
    summary: a.summary,
    category: a.category,
    storeIds: a.audience.storeIds,
    jobRoles: a.audience.jobRoles,
    requiresAck: a.requiresAck,
    dueDate: isoToDueDate(a.dueAt),
  };
}

export function Composer({
  manager,
  editId,
  onCancel,
  onDone,
}: {
  manager: Manager;
  editId?: string;
  onCancel: () => void;
  onDone: (id: string, message: string) => void;
}) {
  const { state, dispatch } = useApp();
  const scope = managerScope(manager, state);
  const editing = editId ? state.announcements.find((a) => a.id === editId) : undefined;

  const [draft, setDraft] = useState<Draft>(() =>
    editing
      ? draftFrom(editing)
      : { title: '', body: '', summary: '', category: 'general', storeIds: scope, jobRoles: [...JOB_ROLES], requiresAck: false, dueDate: '' },
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [ai, setAi] = useState<{ status: 'idle' | 'loading' | 'done'; s?: Suggestion; applied?: boolean; forText?: string }>({ status: 'idle' });
  const [askReconfirm, setAskReconfirm] = useState(false);
  const [changeNote, setChangeNote] = useState('');

  const now = new Date();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k as keyof DraftErrors]) setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const reach = audienceSize(draft, state.employees, manager.id);
  const checks = useMemo(() => reviewDraft(draft, state.stores), [draft, state.stores]);
  const recentAcks = recentAckRequests(state.announcements, manager.id, now, editId);
  const aiStale = ai.status === 'done' && ai.forText !== `${draft.title}
${draft.body}`;
  const originalDueDate = editing ? isoToDueDate(editing.dueAt) : undefined;
  const existingAcks = editing ? Object.values(editing.acks).filter((x) => x.version === editing.version).length : 0;

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const runAi = async () => {
    setAi({ status: 'loading' });
    const forText = `${draft.title}
${draft.body}`;
    const s = await suggest(draft.title, draft.body);
    setAi({ status: 'done', s, forText });
  };

  const applyAi = () => {
    if (!ai.s) return;
    setDraft((d) => ({ ...d, summary: ai.s!.summary, category: ai.s!.category, requiresAck: ai.s!.requiresAck }));
    setAi({ ...ai, applied: true });
  };

  const submit = (reconfirm?: boolean) => {
    const errs = validateDraft(draft, state.employees, now, { authorId: manager.id, originalDueDate });
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;

    const fields = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      summary: draft.summary.trim(),
      category: draft.category,
      audience: { storeIds: draft.storeIds, jobRoles: draft.jobRoles },
      requiresAck: draft.requiresAck,
      dueAt: draft.requiresAck ? dueDateToIso(draft.dueDate) : null,
    };

    if (editing) {
      // People already confirmed: ask whether this change is big enough to need their confirmation again.
      if (editing.requiresAck && draft.requiresAck && existingAcks > 0 && reconfirm === undefined) {
        setAskReconfirm(true);
        return;
      }
      dispatch({ type: 'update', id: editing.id, changes: fields, reconfirm: !!reconfirm, changeNote, at: new Date().toISOString() });
      onDone(editing.id, reconfirm ? `Updated. ${existingAcks} people will be asked to confirm again.` : 'Changes saved.');
      return;
    }

    const id = `a-${Date.now().toString(36)}`;
    dispatch({
      type: 'create',
      announcement: {
        id,
        ...fields,
        authorId: manager.id,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        version: 1,
        acks: {},
        reads: {},
        reminders: [],
        archived: false,
      },
    });
    onDone(id, `Posted to ${reach} people.`);
  };

  const warnChecks = checks.filter((c) => c.level === 'warn').length;

  return (
    <div className="page composer">
      <BackButton onClick={onCancel} label="Cancel" />
      <h1>{editing ? 'Edit announcement' : 'New announcement'}</h1>

      <div className="composer-grid">
        <div className="composer-form">
          <Field label="Title" error={errors.title} counter={`${draft.title.length}/${TITLE_MAX}`}>
            <input value={draft.title} maxLength={TITLE_MAX + 20} placeholder="e.g. New box cutter procedure starts Monday" onChange={(e) => set('title', e.target.value)} />
          </Field>

          <Field label="Message" error={errors.body}>
            <textarea
              rows={8}
              value={draft.body}
              placeholder="What's changing, when, and what people need to do."
              onChange={(e) => set('body', e.target.value)}
            />
          </Field>

          <div className="ai-box">
            <div className="ai-head">
              <div>
                <strong>✨ AI assist</strong> <span className="muted small">(simulated)</span>
                <div className="muted small">Drafts a one-line summary, suggests a category, and says whether this needs confirmation.</div>
              </div>
              <button className="btn btn-sm" disabled={draft.body.trim().length < 20 || ai.status === 'loading'} onClick={runAi}>
                {ai.status === 'loading' ? 'Thinking…' : ai.status === 'done' ? 'Run again' : 'Suggest'}
              </button>
            </div>
            {ai.status === 'done' && ai.s && (
              <div className={`ai-result ${aiStale ? 'is-stale' : ''}`}>
                {aiStale && <div className="notice notice-warn small">You've changed the message since this suggestion. Run it again before using it.</div>}
                <div>
                  <span className="muted small">Summary</span>
                  <div>{ai.s.summary || <em className="muted">Couldn't find a clear key sentence.</em>}</div>
                </div>
                <div>
                  <span className="muted small">Category</span>
                  <div>
                    <CategoryChip category={ai.s.category} />{' '}
                    {ai.s.matched.length > 0 && <span className="muted small">because it mentions “{ai.s.matched.slice(0, 3).join('”, “')}”</span>}
                  </div>
                </div>
                <div>
                  <span className="muted small">Confirmation</span>
                  <div>
                    <strong>{ai.s.requiresAck ? 'Ask people to confirm' : 'No confirmation'}</strong>. <span className="muted">{ai.s.ackReason}</span>
                  </div>
                </div>
                <div className="ai-actions">
                  <button className="btn btn-sm btn-primary" onClick={applyAi} disabled={ai.applied || aiStale}>
                    {ai.applied && !aiStale ? 'Applied ✓' : 'Use these'}
                  </button>
                  <span className="muted small">You're the author. Review and edit before posting.</span>
                </div>
              </div>
            )}
          </div>

          <Field label="Summary (what people see in the list)" error={errors.summary} counter={`${draft.summary.length}/${SUMMARY_MAX}`}>
            <textarea rows={2} value={draft.summary} placeholder="Optional. One line: what to do and when." onChange={(e) => set('summary', e.target.value)} />
          </Field>

          <Field label="Category">
            <div className="choices">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" className={`choice ${draft.category === c.id ? 'on' : ''}`} onClick={() => set('category', c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Who should see this" error={errors.audience}>
            {scope.length > 1 ? (
              <div className="choices">
                <button
                  type="button"
                  className={`choice ${draft.storeIds.length === scope.length ? 'on' : ''}`}
                  onClick={() => set('storeIds', draft.storeIds.length === scope.length ? [] : scope)}
                >
                  All stores
                </button>
                {state.stores
                  .filter((s) => scope.includes(s.id))
                  .map((s) => (
                    <button key={s.id} type="button" className={`choice ${draft.storeIds.includes(s.id) ? 'on' : ''}`} onClick={() => set('storeIds', toggle(draft.storeIds, s.id))}>
                      {s.name}
                    </button>
                  ))}
              </div>
            ) : (
              <div className="muted small">{state.stores.find((s) => s.id === scope[0])?.name} (your store)</div>
            )}
            <div className="choices">
              {JOB_ROLES.map((r) => (
                <button key={r} type="button" className={`choice ${draft.jobRoles.includes(r) ? 'on' : ''}`} onClick={() => set('jobRoles', toggle<JobRole>(draft.jobRoles, r))}>
                  {r}
                </button>
              ))}
            </div>
            <div className="reach">
              Reaches <strong>{reach}</strong> {reach === 1 ? 'person' : 'people'}
            </div>
          </Field>

          <div className={`ack-toggle ${draft.requiresAck ? 'on' : ''}`}>
            <label className="switch">
              <input type="checkbox" checked={draft.requiresAck} onChange={(e) => set('requiresAck', e.target.checked)} />
              <span>
                <strong>Needs confirmation</strong>
                <span className="muted small block">
                  Employees tap “I've read this” and you can see who hasn't. Use this for safety and policy, not everyday updates.
                </span>
                <span className="small block notify-hint">
                  {draft.requiresAck
                    ? '🔔 Employees get one notification. It stays at the top of their feed until they confirm.'
                    : '🔕 No notification. It just appears in their feed, with nothing to tap.'}
                </span>
              </span>
            </label>
            {draft.requiresAck && (
              <>
                <Field label="Confirm by (optional)" error={errors.dueDate}>
                  <input type="date" value={draft.dueDate} min={originalDueDate && originalDueDate < isoToDueDate(now.toISOString()) ? originalDueDate : isoToDueDate(now.toISOString())} onChange={(e) => set('dueDate', e.target.value)} />
                </Field>
                {recentAcks >= 2 && (
                  <div className="notice notice-warn small">
                    You've already asked for confirmation on {recentAcks} posts this week. If everything is “important”, nothing is.
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="composer-side">
          <div className="side-block">
            <h3 className="sub">Before you post {warnChecks > 0 && <span className="count count-warn">{warnChecks}</span>}</h3>
            {draft.body.trim().length < 20 ? (
              <div className="muted small">Checks appear once you've written the message.</div>
            ) : checks.length === 0 ? (
              <div className="text-ok small">✓ Looks good. Nothing to flag.</div>
            ) : (
              <ul className="checks">
                {checks.map((c, i) => (
                  <li key={i} className={`check check-${c.level}`}>
                    {c.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="side-block">
            <h3 className="sub">Preview on a phone</h3>
            <div className={`card feed-card preview ${draft.requiresAck ? 'is-pending' : ''}`}>
              <div className="card-top">
                <CategoryChip category={draft.category} />
                <span className="spacer" />
                <span className="dot" />
                <span className="muted small">just now</span>
              </div>
              <div className="card-title bold">{draft.title || <span className="muted">Your title</span>}</div>
              <div className="card-summary">{draft.summary || draft.body.slice(0, 140) || <span className="muted">Summary shows here</span>}</div>
              <div className="card-foot">
                <span className="muted small">{manager.name}</span>
                {draft.requiresAck && <span className="small text-warn">Needs confirmation</span>}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {askReconfirm ? (
        <div className="reconfirm-box">
          <strong>{existingAcks} people already confirmed this post.</strong>
          <p className="muted small">Is this a small fix (typo, wording) or a real change people need to know about?</p>
          <div className="field">
            <div className="field-label">
              <span>If it's a real change: what changed? (employees see this)</span>
            </div>
            <input
              value={changeNote}
              maxLength={140}
              placeholder="e.g. Gift receipts now get store credit only"
              onChange={(e) => setChangeNote(e.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn" onClick={() => submit(false)}>
              Small fix: keep their confirmations
            </button>
            <button className="btn btn-primary" onClick={() => submit(true)}>
              Real change: ask everyone to confirm again
            </button>
            <button className="btn btn-ghost" onClick={() => setAskReconfirm(false)}>
              Back to editing
            </button>
          </div>
        </div>
      ) : (
        <div className="submit-bar">
          {Object.values(errors).some(Boolean) && <span className="text-bad small">Fix the highlighted fields first.</span>}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => submit()}>
            {editing ? 'Save changes' : `Post to ${reach} ${reach === 1 ? 'person' : 'people'}`}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, error, counter, children }: { label: string; error?: string; counter?: string; children: ReactNode }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <div className="field-label">
        <span>{label}</span>
        {counter && <span className="muted tiny">{counter}</span>}
      </div>
      {children}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
