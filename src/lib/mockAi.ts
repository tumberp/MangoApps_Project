/**
 * Mock "AI assist" for the composer.
 *
 * There is no model behind this. It is deterministic heuristics shaped like the
 * help we'd get from an LLM, so the UX (suggest, then the human reviews) can be
 * demoed without an API key. The checks in `reviewDraft` run on every edit and are
 * the safety net for the suggestions: e.g. they flag a summary that drops a date.
 */
import type { Category, Store } from '../types';
import { SUMMARY_MAX } from './logic';

type Scored = Exclude<Category, 'general'>;

const KEYWORDS: Record<Scored, string[]> = {
  safety: ['safety', 'injur', 'hazard', 'fire', 'exit', 'gloves', 'cutter', 'blade', 'spill', 'emergency', 'evacuat', 'ladder', 'first aid', 'incident', 'lifting'],
  policy: ['policy', 'return', 'refund', 'dress code', 'receipt', 'compliance', 'clock in', 'clock-in', 'timesheet', 'discount', 'approval'],
  schedule: ['schedule', 'shift', 'availability', 'hours', 'time off', 'time-off', 'closing', 'opening', 'swap', 'holiday'],
  recognition: ['congrat', 'shout', 'great job', 'thank', 'kudos', 'record', 'goal', 'celebrat', 'welcome', 'proud'],
};

// Safety beats everything on ties: missing a safety update is the costliest mistake.
const WEIGHT: Record<Scored, number> = { safety: 1.5, policy: 1, schedule: 1, recognition: 1 };

export function classify(text: string): { category: Category; matched: string[] } {
  const t = text.toLowerCase();
  let best: Category = 'general';
  let bestScore = 0;
  let matched: string[] = [];
  for (const c of Object.keys(KEYWORDS) as Scored[]) {
    const hits = KEYWORDS[c].filter((k) => t.includes(k));
    const score = hits.length * WEIGHT[c];
    if (score > bestScore) {
      best = c;
      bestScore = score;
      matched = hits;
    }
  }
  return { category: best, matched };
}

const DATE_PATTERNS = [
  /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/gi,
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\.?\s+\d{1,2}(st|nd|rd|th)?\b/gi,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g,
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi,
  /\b(today|tomorrow|tonight|this week|next week)\b/gi,
];

/** Date / time mentions in free text, normalized to lowercase. */
export function extractDates(text: string): string[] {
  const found = new Set<string>();
  for (const p of DATE_PATTERNS) {
    for (const m of text.matchAll(p)) {
      const norm = m[0]
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace('.', '')
        .replace(/(\d)(st|nd|rd|th)\b/, '$1')
        // "November 1" and "Nov 1" are the same date.
        .replace(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/, '$1');
      found.add(norm);
    }
  }
  return [...found];
}

const ACTION = /\b(must|required|require|starting|starts|effective|by|before|due|please|need to|make sure)\b/i;

export function splitSentences(body: string): string[] {
  return body
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

/** Extractive one-liner: picks the sentence that best says "what do I need to do / when". */
export function summarize(body: string): string {
  const sentences = splitSentences(body);
  if (!sentences.length) return '';
  let best = sentences[0];
  let bestScore = -Infinity;
  sentences.forEach((s, i) => {
    const score = (ACTION.test(s) ? 2 : 0) + (extractDates(s).length ? 1.5 : 0) - i * 0.3;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  });
  if (best.length <= SUMMARY_MAX) return best;
  const cut = best.slice(0, SUMMARY_MAX - 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

export interface Suggestion {
  summary: string;
  category: Category;
  matched: string[];
  requiresAck: boolean;
  ackReason: string;
}

export function suggestSync(title: string, body: string): Suggestion {
  const { category, matched } = classify(`${title} ${body}`);
  const requiresAck = category === 'safety' || category === 'policy';
  return {
    summary: summarize(body),
    category,
    matched,
    requiresAck,
    ackReason: requiresAck
      ? 'Safety and policy changes are where you need proof that everyone saw it.'
      : 'Looks routine. People can just read it, no confirmation needed.',
  };
}

/** Async wrapper so the UI behaves like a real model call. */
export function suggest(title: string, body: string, delayMs = 700): Promise<Suggestion> {
  return new Promise((resolve) => setTimeout(() => resolve(suggestSync(title, body)), delayMs));
}

export interface Check {
  level: 'warn' | 'info';
  message: string;
}

export interface ReviewInput {
  title: string;
  body: string;
  summary: string;
  category: Category;
  requiresAck: boolean;
  storeIds: string[];
}

/** Pre-post checks. Run on every edit; also double-check the AI's own summary. */
export function reviewDraft(d: ReviewInput, stores: Store[]): Check[] {
  const checks: Check[] = [];
  const text = `${d.title} ${d.body}`;
  if (d.body.trim().length < 20) return checks;

  const bodyDates = extractDates(d.body);
  if ((d.category === 'safety' || d.category === 'policy') && extractDates(text).length === 0)
    checks.push({ level: 'warn', message: 'No date or time found. When does this take effect?' });

  if (d.summary.trim()) {
    const sumDates = extractDates(d.summary);
    const missing = bodyDates.filter((x) => !sumDates.includes(x));
    const invented = sumDates.filter((x) => !bodyDates.includes(x));
    if (invented.length)
      checks.push({ level: 'warn', message: `The summary says ${invented.join(', ')}, but the message doesn't. Which one is right?` });
    if (bodyDates.length && missing.length)
      checks.push({ level: 'warn', message: `The summary leaves out: ${missing.join(', ')}. Most people only read the summary.` });
  }

  const words = d.body.trim().split(/\s+/).length;
  if (words > 150)
    checks.push({ level: 'info', message: `Long post (${words} words). Make sure the summary covers the one thing people must do.` });

  const shouting = (d.body.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !['ASAP', 'OSHA', 'HVAC'].includes(w));
  if (shouting.length >= 3)
    checks.push({ level: 'info', message: 'Lots of ALL-CAPS words. That reads as shouting, and the Important label already handles urgency.' });

  const otherStores = stores.filter(
    (s) => !d.storeIds.includes(s.id) && new RegExp(`\\b${s.name}\\b`, 'i').test(text),
  );
  if (otherStores.length)
    checks.push({
      level: 'warn',
      message: `Mentions ${otherStores.map((s) => s.name).join(', ')}, but that store isn't in the audience.`,
    });

  if (d.requiresAck && !['safety', 'policy'].includes(d.category))
    checks.push({
      level: 'warn',
      message: 'Confirmation is on, but this isn\'t safety or policy. If routine posts ask for it, people start tapping without reading.',
    });

  return checks;
}
