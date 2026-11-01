import { describe, expect, it } from 'vitest';
import { classify, extractDates, reviewDraft, suggestSync, summarize } from './mockAi';
import { STORES, buildSeed } from '../data/seed';

const base = { title: '', body: '', summary: '', category: 'general' as const, requiresAck: false, storeIds: STORES.map((s) => s.id) };

describe('classify', () => {
  it.each([
    ['Wet floor and spill procedure: wear gloves and put out the cone', 'safety'],
    ['New dress code policy for the holidays', 'policy'],
    ['Please submit your shift availability for December', 'schedule'],
    ['Congrats to the team, great job hitting the goal!', 'recognition'],
    ['Pizza in the breakroom at noon', 'general'],
  ])('%s → %s', (text, expected) => {
    expect(classify(text).category).toBe(expected);
  });

  it('prefers safety when a post is both safety and policy', () => {
    expect(classify('New safety policy: always wear gloves with the box cutter').category).toBe('safety');
  });

  it('only suggests confirmation for safety and policy', () => {
    expect(suggestSync('Fire exits', 'Keep fire exits clear at all times starting Monday.').requiresAck).toBe(true);
    expect(suggestSync('Fridge', 'The breakroom fridge gets cleaned Thursday night.').requiresAck).toBe(false);
  });
});

describe('summarize', () => {
  it('picks the sentence with the action and the date, not just the first one', () => {
    const body = 'We had some injuries last month. Starting Monday, everyone must wear gloves. Thanks all.';
    expect(summarize(body)).toBe('Starting Monday, everyone must wear gloves.');
  });
  it('stays within the summary limit', () => {
    const s = summarize(`Starting Monday you must ${'really '.repeat(60)}read this.`);
    expect(s.length).toBeLessThanOrEqual(160);
    expect(s.endsWith('…')).toBe(true);
  });
  it('handles empty input', () => {
    expect(summarize('   ')).toBe('');
  });
});

describe('extractDates', () => {
  it('finds weekdays, month-days, times and relative words', () => {
    expect(extractDates('Due Friday at 6pm, starting Nov 1, or tomorrow, 12/24')).toEqual(
      expect.arrayContaining(['friday', '6pm', 'nov 1', 'tomorrow', '12/24']),
    );
  });
});

describe('reviewDraft (checking the AI and the author)', () => {
  it('flags a summary that drops a date from the body', () => {
    const checks = reviewDraft(
      { ...base, body: 'Please submit availability by Friday at 6pm. The schedule goes up next week.', summary: 'Please submit availability.' },
      STORES,
    );
    expect(checks.some((c) => /leaves out/.test(c.message))).toBe(true);
  });

  it('flags a safety post with no effective date', () => {
    const checks = reviewDraft({ ...base, category: 'safety', body: 'Always wear gloves when you use a box cutter in receiving.' }, STORES);
    expect(checks.some((c) => /No date/.test(c.message))).toBe(true);
  });

  it('flags confirmation on routine posts (Alex’s concern)', () => {
    const checks = reviewDraft({ ...base, requiresAck: true, body: 'The breakroom fridge gets cleaned Thursday night.' }, STORES);
    expect(checks.some((c) => /Confirmation is on/.test(c.message))).toBe(true);
  });

  it('flags a store named in the text but missing from the audience', () => {
    const checks = reviewDraft({ ...base, storeIds: ['dt'], body: 'Lakeview staff: the parking lot is closed Saturday.' }, STORES);
    expect(checks.some((c) => /Lakeview/.test(c.message))).toBe(true);
  });

  it('stays quiet on a good draft', () => {
    const body = 'Starting Monday, wear cut-resistant gloves when using box cutters.';
    expect(reviewDraft({ ...base, category: 'safety', requiresAck: true, body, summary: body }, STORES)).toEqual([]);
  });

  it('flags a date in the summary that the message never mentions', () => {
    const checks = reviewDraft(
      { ...base, body: 'Starting Monday, wear gloves when using box cutters.', summary: 'Starting Tuesday, wear gloves.' },
      STORES,
    );
    expect(checks.some((c) => /says tuesday/.test(c.message))).toBe(true);
  });

  it('treats "November 1" and "Nov 1" as the same date', () => {
    expect(extractDates('Starting November 1')).toEqual(extractDates('Starting Nov 1'));
  });

  it('every seeded post’s summary passes its own date check', () => {
    // Guards the demo data against the very mistake the check is meant to catch.
    const s = buildSeed(new Date('2026-10-30T15:00:00Z'));
    for (const a of s.announcements) {
      const checks = reviewDraft({ ...a, storeIds: a.audience.storeIds }, s.stores);
      expect(checks.filter((c) => /leaves out/.test(c.message)), a.id).toEqual([]);
    }
  });
});
