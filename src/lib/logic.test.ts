import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed';
import { reducer } from '../state/AppContext';
import {
  dueFor,
  employeeFeed,
  isOverdueFor,
  isoToDueDate,
  managerScope,
  remindable,
  scopedRecipients,
  statusFor,
  tally,
  toCsv,
  validateDraft,
  type Draft,
} from './logic';

const NOW = new Date('2026-10-30T15:00:00Z');
const seed = () => buildSeed(NOW);
const find = (s: ReturnType<typeof seed>, id: string) => s.announcements.find((a) => a.id === id)!;

describe('seed data', () => {
  it('has 5 stores and 200 employees with unique ids and names', () => {
    const s = seed();
    expect(s.stores).toHaveLength(5);
    expect(s.employees).toHaveLength(200);
    expect(new Set(s.employees.map((e) => e.id)).size).toBe(200);
    expect(new Set(s.employees.map((e) => e.name)).size).toBe(200);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(seed())).toBe(JSON.stringify(seed()));
  });

  it('gives the demo personas their story', () => {
    const s = seed();
    const alex = s.employees.find((e) => e.id === 'e-alex')!;
    const jordan = s.employees.find((e) => e.id === 'e-jordan')!;
    expect(employeeFeed(s.announcements, alex).action.map((a) => a.id).sort()).toEqual(['a-boxcutter', 'a-returns']);
    expect(employeeFeed(s.announcements, jordan).action).toHaveLength(0);
  });

  it('never has confirmations before someone was hired or after now', () => {
    const s = seed();
    for (const a of s.announcements)
      for (const [id, ack] of Object.entries(a.acks)) {
        const e = s.employees.find((x) => x.id === id)!;
        expect(ack.at >= e.startedAt).toBe(true);
        expect(new Date(ack.at).getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
  });
});

describe('audience & scope', () => {
  it('only shows employees posts for their store and role', () => {
    const s = seed();
    const alex = s.employees.find((e) => e.id === 'e-alex')!; // Downtown
    const { action, rest } = employeeFeed(s.announcements, alex);
    const ids = [...action, ...rest].map((a) => a.id);
    expect(ids).toContain('a-fridge');
    expect(ids).not.toContain('a-lakeview-lot');
  });

  it('excludes stockroom from the return policy post', () => {
    const s = seed();
    const stock = s.employees.find((e) => e.jobRole === 'Stockroom')!;
    const ids = Object.values(employeeFeed(s.announcements, stock)).flat().map((a) => a.id);
    expect(ids).not.toContain('a-returns');
  });

  it('scopes a store manager to their own store', () => {
    const s = seed();
    const rachel = s.managers.find((m) => m.id === 'e-rachel')!;
    const people = scopedRecipients(find(s, 'a-boxcutter'), s.employees, managerScope(rachel, s));
    expect(people).toHaveLength(40);
    expect(people.every((p) => p.storeId === 'dt')).toBe(true);
  });
});

describe('acknowledgement lifecycle', () => {
  it('confirming moves someone from pending to confirmed', () => {
    let s = seed();
    expect(statusFor(find(s, 'a-boxcutter'), 'e-alex')).toBe('unopened');
    s = reducer(s, { type: 'read', id: 'a-boxcutter', employeeId: 'e-alex', at: NOW.toISOString() });
    expect(statusFor(find(s, 'a-boxcutter'), 'e-alex')).toBe('opened');
    s = reducer(s, { type: 'ack', id: 'a-boxcutter', employeeId: 'e-alex', at: NOW.toISOString() });
    expect(statusFor(find(s, 'a-boxcutter'), 'e-alex')).toBe('confirmed');
  });

  it('a material edit asks everyone to re-confirm; a small fix does not', () => {
    let s = seed();
    const before = tally(find(s, 'a-boxcutter'), s.employees);
    const base = find(s, 'a-boxcutter');
    const changes = { title: base.title, body: base.body + ' Typo fixed.', summary: base.summary, category: base.category, audience: base.audience, requiresAck: true, dueAt: base.dueAt };

    const small = reducer(s, { type: 'update', id: 'a-boxcutter', changes, reconfirm: false, at: NOW.toISOString() });
    expect(tally(find(small, 'a-boxcutter'), s.employees).confirmed).toBe(before.confirmed);

    s = reducer(s, { type: 'update', id: 'a-boxcutter', changes, reconfirm: true, at: NOW.toISOString() });
    const after = tally(find(s, 'a-boxcutter'), s.employees);
    expect(after.confirmed).toBe(0);
    expect(after.reconfirm).toBe(before.confirmed);
  });

  it('the edited return-policy post shows people who confirmed the old version', () => {
    const s = seed();
    expect(tally(find(s, 'a-returns'), s.employees).reconfirm).toBeGreaterThan(0);
  });
});

describe('reminders', () => {
  it('skips people reminded in the last 24h, by anyone', () => {
    let s = seed();
    const a = find(s, 'a-boxcutter');
    const first = remindable(a, s.employees, NOW);
    expect(first.length).toBeGreaterThan(0);
    s = reducer(s, { type: 'remind', id: a.id, reminder: { at: NOW.toISOString(), by: 'e-rachel', employeeIds: first.slice(0, 5).map((e) => e.id) } });
    expect(remindable(find(s, a.id), s.employees, NOW)).toHaveLength(first.length - 5);
    const tomorrow = new Date(NOW.getTime() + 25 * 3600 * 1000);
    expect(remindable(find(s, a.id), s.employees, tomorrow)).toHaveLength(first.length);
  });

  it('never reminds for posts that do not need confirmation', () => {
    const s = seed();
    expect(remindable(find(s, 'a-fridge'), s.employees, NOW)).toHaveLength(0);
  });
});

describe('draft validation', () => {
  const s = seed();
  const ok: Draft = {
    title: 'Store closes early Friday',
    body: 'We close at 5pm on Friday for inventory. Please plan your shifts accordingly.',
    summary: '',
    category: 'schedule',
    storeIds: ['dt'],
    jobRoles: ['Cashier'],
    requiresAck: false,
    dueDate: '',
  };

  it('accepts a good draft', () => {
    expect(validateDraft(ok, s.employees, NOW)).toEqual({});
  });
  it('rejects empty and whitespace-only fields', () => {
    const e = validateDraft({ ...ok, title: '   ', body: '  ' }, s.employees, NOW);
    expect(e.title).toBeTruthy();
    expect(e.body).toBeTruthy();
  });
  it('rejects too-long titles and summaries', () => {
    const e = validateDraft({ ...ok, title: 'x'.repeat(81), summary: 'y'.repeat(161) }, s.employees, NOW);
    expect(e.title).toMatch(/80/);
    expect(e.summary).toBeTruthy();
  });
  it('rejects an empty audience', () => {
    expect(validateDraft({ ...ok, storeIds: [] }, s.employees, NOW).audience).toBeTruthy();
    expect(validateDraft({ ...ok, jobRoles: [] }, s.employees, NOW).audience).toBeTruthy();
  });
  it('rejects a confirm-by date in the past', () => {
    expect(validateDraft({ ...ok, requiresAck: true, dueDate: '2026-10-01' }, s.employees, NOW).dueDate).toBeTruthy();
  });
});

describe('csv', () => {
  it('escapes commas and quotes', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"']])).toBe('a,"b,c","say ""hi"""');
  });
});

describe('new hires', () => {
  it('get a grace period instead of starting their first day overdue', () => {
    const s = seed();
    const fire = find(s, 'a-fire'); // due 5 days ago
    const sam = s.employees.find((e) => e.id === 'e-sam')!; // started yesterday
    const veteran = s.employees.find((e) => e.id === 'e-alex')!;
    expect(isOverdueFor(fire, sam, NOW)).toBe(false);
    expect(dueFor(fire, veteran)).toBe(fire.dueAt);
    const inFourDays = new Date(NOW.getTime() + 4 * 24 * 3600 * 1000);
    expect(isOverdueFor(fire, sam, inFourDays)).toBe(true);
  });
});

describe('QA-pass fixes', () => {
  it('lets a manager edit an overdue post without inventing a new deadline', () => {
    const s = seed();
    const fire = find(s, 'a-fire'); // due 5 days ago
    const dueDate = isoToDueDate(fire.dueAt);
    const draft: Draft = {
      title: fire.title, body: fire.body, summary: fire.summary, category: fire.category,
      storeIds: fire.audience.storeIds, jobRoles: fire.audience.jobRoles, requiresAck: true, dueDate,
    };
    expect(validateDraft(draft, s.employees, NOW, { originalDueDate: dueDate }).dueDate).toBeUndefined();
    // ...but a *new* past date is still rejected.
    expect(validateDraft({ ...draft, dueDate: '2026-10-01' }, s.employees, NOW, { originalDueDate: dueDate }).dueDate).toBeTruthy();
  });

  it('records an in-person confirmation without pretending they opened the app', () => {
    let s = seed();
    s = reducer(s, { type: 'ack', id: 'a-boxcutter', employeeId: 'e-alex', at: NOW.toISOString(), recordedBy: 'e-rachel' });
    const a = find(s, 'a-boxcutter');
    expect(statusFor(a, 'e-alex')).toBe('confirmed');
    expect(a.acks['e-alex'].recordedBy).toBe('e-rachel');
    expect(a.reads['e-alex']).toBeUndefined();
  });

  it('shows employees what changed when a post needs re-confirming', () => {
    let s = seed();
    const base = find(s, 'a-boxcutter');
    const changes = { title: base.title, body: base.body, summary: base.summary, category: base.category, audience: base.audience, requiresAck: true, dueAt: base.dueAt };
    s = reducer(s, { type: 'update', id: base.id, changes, reconfirm: true, changeNote: '  Gloves now required for all stock work  ', at: NOW.toISOString() });
    expect(find(s, base.id).changeNote).toBe('Gloves now required for all stock work');
    // A small fix keeps the existing note.
    s = reducer(s, { type: 'update', id: base.id, changes, reconfirm: false, changeNote: 'ignored', at: NOW.toISOString() });
    expect(find(s, base.id).changeNote).toBe('Gloves now required for all stock work');
  });

  it('never has a seeded reminder sent before the person was hired', () => {
    const s = seed();
    for (const a of s.announcements)
      for (const r of a.reminders)
        for (const id of r.employeeIds) expect(s.employees.find((e) => e.id === id)!.startedAt < r.at).toBe(true);
  });

  it('a new hire’s feed is ordered by their own deadline', () => {
    const s = seed();
    const sam = s.employees.find((e) => e.id === 'e-sam')!;
    const dues = employeeFeed(s.announcements, sam).action.map((a) => dueFor(a, sam) ?? '9999');
    expect([...dues].sort()).toEqual(dues);
  });
});
