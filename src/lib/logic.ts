import type { Announcement, AppState, Employee, JobRole, Manager, Category } from '../types';

export const REMINDER_COOLDOWN_HOURS = 24;
export const TITLE_MAX = 80;
export const SUMMARY_MAX = 160;
export const BODY_MIN = 20;
export const BODY_MAX = 2000;

const HOUR = 3600 * 1000;

/** The author is never counted as a recipient of their own post. */
export function isRecipient(a: Announcement, e: Employee): boolean {
  return e.id !== a.authorId && a.audience.storeIds.includes(e.storeId) && a.audience.jobRoles.includes(e.jobRole);
}

export function recipients(a: Announcement, employees: Employee[]): Employee[] {
  return employees.filter((e) => isRecipient(a, e));
}

/** Store ids a manager is responsible for. */
export function managerScope(m: Manager, state: Pick<AppState, 'stores'>): string[] {
  return m.storeId ? [m.storeId] : state.stores.map((s) => s.id);
}

export function visibleToManager(a: Announcement, m: Manager): boolean {
  return m.storeId === null || a.audience.storeIds.includes(m.storeId);
}

/** Recipients of an announcement that fall inside a manager's stores. */
export function scopedRecipients(a: Announcement, employees: Employee[], scope: string[]): Employee[] {
  return recipients(a, employees).filter((e) => scope.includes(e.storeId));
}

/**
 * confirmed  – acknowledged the current version
 * reconfirm  – acknowledged an earlier version; post changed materially since
 * opened     – opened but not (yet) confirmed
 * unopened   – never opened
 */
export type PersonStatus = 'confirmed' | 'reconfirm' | 'opened' | 'unopened';

export function statusFor(a: Announcement, employeeId: string): PersonStatus {
  if (a.requiresAck) {
    const ack = a.acks[employeeId];
    if (ack && ack.version === a.version) return 'confirmed';
    if (ack) return 'reconfirm';
  }
  return a.reads[employeeId] ? 'opened' : 'unopened';
}

/** "Done" means confirmed for required posts, opened for everything else. */
export function isDone(a: Announcement, employeeId: string): boolean {
  const s = statusFor(a, employeeId);
  return a.requiresAck ? s === 'confirmed' : s === 'opened';
}

export function needsAction(a: Announcement, employeeId: string): boolean {
  return a.requiresAck && !a.archived && statusFor(a, employeeId) !== 'confirmed';
}

export interface Tally {
  total: number;
  confirmed: number;
  reconfirm: number;
  opened: number;
  unopened: number;
  done: number;
  pct: number;
}

export function tally(a: Announcement, people: Employee[]): Tally {
  const t: Tally = { total: people.length, confirmed: 0, reconfirm: 0, opened: 0, unopened: 0, done: 0, pct: 0 };
  for (const p of people) {
    t[statusFor(a, p.id)]++;
    if (isDone(a, p.id)) t.done++;
  }
  t.pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
  return t;
}

export function isOverdue(a: Announcement, now: Date): boolean {
  return !!a.dueAt && new Date(a.dueAt).getTime() < now.getTime();
}

export const NEW_HIRE_GRACE_DAYS = 3;

/**
 * Someone hired after a post went out shouldn't start their first day already "overdue".
 * They get NEW_HIRE_GRACE_DAYS from their start date (or the original deadline, if later).
 */
export function dueFor(a: Announcement, e: Employee): string | null {
  if (!a.dueAt) return null;
  if (e.startedAt <= a.createdAt) return a.dueAt;
  const grace = new Date(new Date(e.startedAt).getTime() + NEW_HIRE_GRACE_DAYS * 24 * HOUR).toISOString();
  return grace > a.dueAt ? grace : a.dueAt;
}

export function isOverdueFor(a: Announcement, e: Employee, now: Date): boolean {
  const due = dueFor(a, e);
  return !!due && new Date(due).getTime() < now.getTime();
}

export function lastRemindedAt(a: Announcement, employeeId: string): string | null {
  let last: string | null = null;
  for (const r of a.reminders) {
    if (r.employeeIds.includes(employeeId) && (!last || r.at > last)) last = r.at;
  }
  return last;
}

/** People who are still pending and haven't been nudged in the cooldown window (by anyone). */
export function remindable(a: Announcement, people: Employee[], now: Date): Employee[] {
  if (!a.requiresAck || a.archived) return [];
  return people.filter((p) => {
    if (isDone(a, p.id)) return false;
    const last = lastRemindedAt(a, p.id);
    return !last || now.getTime() - new Date(last).getTime() >= REMINDER_COOLDOWN_HOURS * HOUR;
  });
}

export function employeeFeed(all: Announcement[], e: Employee): { action: Announcement[]; rest: Announcement[] } {
  const mine = all.filter((a) => !a.archived && isRecipient(a, e));
  const action = mine
    .filter((a) => needsAction(a, e.id))
    .sort((x, y) => (dueFor(x, e) ?? '9999').localeCompare(dueFor(y, e) ?? '9999') || y.createdAt.localeCompare(x.createdAt));
  const rest = mine.filter((a) => !needsAction(a, e.id)).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return { action, rest };
}

/** How many confirmation-required posts this author made in the last 7 days. */
export function recentAckRequests(all: Announcement[], authorId: string, now: Date, excludeId?: string): number {
  const since = now.getTime() - 7 * 24 * HOUR;
  return all.filter(
    (a) => a.authorId === authorId && a.requiresAck && a.id !== excludeId && new Date(a.createdAt).getTime() >= since,
  ).length;
}

export interface Draft {
  title: string;
  body: string;
  summary: string;
  category: Category;
  storeIds: string[];
  jobRoles: JobRole[];
  requiresAck: boolean;
  /** yyyy-mm-dd, '' when not set */
  dueDate: string;
}

export type DraftErrors = Partial<Record<'title' | 'body' | 'summary' | 'audience' | 'dueDate', string>>;

export function dueDateToIso(dueDate: string): string | null {
  if (!dueDate) return null;
  const d = new Date(`${dueDate}T23:59:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToDueDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function audienceSize(d: Pick<Draft, 'storeIds' | 'jobRoles'>, employees: Employee[], authorId?: string): number {
  return employees.filter((e) => e.id !== authorId && d.storeIds.includes(e.storeId) && d.jobRoles.includes(e.jobRole)).length;
}

export function validateDraft(
  d: Draft,
  employees: Employee[],
  now: Date,
  opts: { authorId?: string; originalDueDate?: string } = {},
): DraftErrors {
  const { authorId, originalDueDate } = opts;
  const errors: DraftErrors = {};
  const title = d.title.trim();
  const body = d.body.trim();
  if (!title) errors.title = 'Add a title so people know what this is about.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters (${title.length} now).`;

  if (!body) errors.body = 'Write the update itself.';
  else if (body.length < BODY_MIN) errors.body = `That's very short. Add enough detail for someone who missed the meeting.`;
  else if (body.length > BODY_MAX) errors.body = `Too long for a phone (${body.length}/${BODY_MAX} characters). Link to a document instead.`;

  if (d.summary.trim().length > SUMMARY_MAX)
    errors.summary = `Summary should fit on one phone line or two (${d.summary.trim().length}/${SUMMARY_MAX}).`;

  if (!d.storeIds.length) errors.audience = 'Pick at least one store.';
  else if (!d.jobRoles.length) errors.audience = 'Pick at least one role.';
  else if (audienceSize(d, employees, authorId) === 0) errors.audience = 'No employees match this audience.';

  if (d.dueDate) {
    const iso = dueDateToIso(d.dueDate);
    if (!iso) errors.dueDate = 'That date is not valid.';
    // Editing an overdue post (e.g. fixing a typo) shouldn't force a new deadline.
    else if (new Date(iso).getTime() < now.getTime() && d.dueDate !== originalDueDate)
      errors.dueDate = 'The confirm-by date is in the past.';
  }
  return errors;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

export function personName(state: Pick<AppState, 'managers' | 'employees'>, id: string): string {
  return state.managers.find((m) => m.id === id)?.name ?? state.employees.find((e) => e.id === id)?.name ?? 'Unknown';
}

export function describeAudience(a: Pick<Draft, 'storeIds' | 'jobRoles'>, state: Pick<AppState, 'stores'>): string {
  const stores =
    a.storeIds.length === state.stores.length
      ? 'All stores'
      : state.stores.filter((s) => a.storeIds.includes(s.id)).map((s) => s.name).join(', ');
  const roles = a.jobRoles.length === 5 ? 'everyone' : a.jobRoles.join(', ');
  return `${stores} · ${roles}`;
}
