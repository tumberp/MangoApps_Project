import type { Announcement, AppState, Employee, JobRole, Manager, Store } from '../types';
import { JOB_ROLES } from '../types';
import { recipients } from '../lib/logic';

/** Small seeded PRNG so the demo data is identical on every reset. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export const STORES: Store[] = [
  { id: 'dt', name: 'Downtown' },
  { id: 'rv', name: 'Riverside' },
  { id: 'ng', name: 'Northgate' },
  { id: 'lv', name: 'Lakeview' },
  { id: 'ap', name: 'Airport Plaza' },
];

const FIRST = [
  'Maya', 'Liam', 'Sofia', 'Noah', 'Ava', 'Ethan', 'Isabella', 'Lucas', 'Mia', 'Mason', 'Amara', 'Diego', 'Chloe', 'Omar',
  'Grace', 'Mateo', 'Zoe', 'Caleb', 'Leah', 'Aiden', 'Nina', 'Julian', 'Hannah', 'Kai', 'Aaliyah', 'Ryan', 'Fatima', 'Owen',
  'Lily', 'Andre', 'Ruby', 'Hiro', 'Tessa', 'Malik', 'Ivy', 'Felix', 'Naomi', 'Gabe', 'Priya', 'Luis', 'Erin', 'Dev',
  'Carmen', 'Jamal', 'Quinn', 'Wes', 'Bianca', 'Theo', 'Yara', 'Cole', 'Jade', 'Rafael', 'Elise', 'Tariq', 'Rosa', 'Ben',
];
const LAST = [
  'Johnson', 'Martinez', 'Chen', 'Okafor', 'Smith', 'Nguyen', 'Brown', 'Patel', 'Garcia', 'Wilson', 'Lopez', 'Davis',
  'Hernandez', 'Kowalski', 'Moore', 'Ali', 'Thompson', 'Reyes', 'Clark', 'Singh', 'Lewis', 'Ramos', 'Walker', 'Kim',
  'Young', 'Torres', 'Hall', 'Flores', 'Allen', 'Adams', 'Baker', 'Mendoza', 'Hughes', 'Shah', 'Price', 'Ortiz', 'Ward',
  'Murphy', 'Bennett', 'Cruz', 'Foster', 'Jenkins', 'Sato', 'Bell', 'Rossi',
];

/** Named people the demo script refers to. Everyone else is generated. */
const FIXED: Record<string, { id: string; name: string; role: JobRole; idx: number; startedDaysAgo?: number }[]> = {
  dt: [
    { id: 'e-rachel', name: 'Rachel Kim', role: 'Store Manager', idx: 0 },
    { id: 'e-alex', name: 'Alex Rivera', role: 'Sales Associate', idx: 0 },
  ],
  rv: [
    { id: 'e-elena', name: 'Elena Garcia', role: 'Store Manager', idx: 0 },
    { id: 'e-jordan', name: 'Jordan Lee', role: 'Cashier', idx: 0 },
  ],
  ng: [{ id: 'e-marcus', name: 'Marcus Webb', role: 'Store Manager', idx: 0 }],
  lv: [
    { id: 'e-dana', name: 'Dana Brooks', role: 'Store Manager', idx: 0 },
    { id: 'e-sam', name: 'Sam Patel', role: 'Stockroom', idx: 0, startedDaysAgo: 1 },
  ],
  ap: [{ id: 'e-tom', name: 'Tom Nguyen', role: 'Store Manager', idx: 0 }],
};

const STAFFING: [JobRole, number][] = [
  ['Store Manager', 1],
  ['Shift Lead', 3],
  ['Sales Associate', 20],
  ['Cashier', 10],
  ['Stockroom', 6],
];

function buildEmployees(now: Date, rng: () => number): Employee[] {
  const used = new Set(Object.values(FIXED).flat().map((f) => f.name));
  const out: Employee[] = [];
  for (const store of STORES) {
    for (const [role, count] of STAFFING) {
      for (let i = 0; i < count; i++) {
        const fixed = FIXED[store.id]?.find((f) => f.role === role && f.idx === i);
        let name = fixed?.name;
        while (!name) {
          const candidate = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
          if (!used.has(candidate)) name = candidate;
        }
        used.add(name);
        // The last associate and cashier at each store are new hires (joined this week).
        const newHire = (role === 'Sales Associate' || role === 'Cashier') && i === count - 1;
        const days = fixed?.startedDaysAgo ?? (newHire ? 1 + Math.floor(rng() * 4) : 30 + Math.floor(rng() * 1100));
        out.push({
          id: fixed?.id ?? `e-${store.id}-${role.split(' ').join('').toLowerCase()}-${i}`,
          name,
          storeId: store.id,
          jobRole: role,
          startedAt: new Date(now.getTime() - days * DAY - 9 * HOUR).toISOString(),
        });
      }
    }
  }
  return out;
}

export const MANAGERS: Manager[] = [
  { id: 'm-michael', name: 'Michael Torres', title: 'Operations Manager', storeId: null },
  { id: 'e-rachel', name: 'Rachel Kim', title: 'Store Manager', storeId: 'dt' },
  { id: 'e-dana', name: 'Dana Brooks', title: 'Store Manager', storeId: 'lv' },
];

/** Engagement differs by store so the per-store breakdown has something to say. */
const STORE_ENGAGEMENT: Record<string, number> = { dt: 1, rv: 1.1, ng: 0.95, lv: 0.6, ap: 0.9 };

interface Spec {
  id: string;
  title: string;
  body: string;
  summary: string;
  category: Announcement['category'];
  authorId: string;
  hoursAgo: number;
  storeIds?: string[];
  jobRoles?: JobRole[];
  requiresAck?: boolean;
  dueInHours?: number;
  /** Simulates an edit that asked people to re-confirm. */
  editedHoursAgo?: number;
  changeNote?: string;
  ackRate: number;
  readRate: number;
}

const SPECS: Spec[] = [
  {
    id: 'a-boxcutter',
    title: 'New box cutter procedure starts Monday',
    category: 'safety',
    authorId: 'm-michael',
    hoursAgo: 46,
    requiresAck: true,
    dueInHours: 76,
    ackRate: 0.66,
    readRate: 0.82,
    summary: 'Starting Monday, only use the new self-retracting cutters and wear cut-resistant gloves when breaking down boxes.',
    body: `We had three hand injuries from box cutters across our stores in October. To prevent more, we're changing how we open and break down boxes.

Starting Monday, only use the new self-retracting safety cutters (yellow handle). The old blue cutters are being collected by your Shift Lead this weekend.

Always wear the cut-resistant gloves stored next to the receiving door. Cut away from your body and never leave a cutter on a shelf or in a box.

If you get a cut, tell your Shift Lead right away. The first aid kit is in the back office.`,
  },
  {
    id: 'a-returns',
    title: 'Holiday return policy: extended to January 31',
    category: 'policy',
    authorId: 'm-michael',
    hoursAgo: 30,
    editedHoursAgo: 7,
    changeNote: 'Gift receipts now get store credit only, not a refund to the card.',
    jobRoles: ['Store Manager', 'Shift Lead', 'Sales Associate', 'Cashier'],
    requiresAck: true,
    dueInHours: 124,
    ackRate: 0.55,
    readRate: 0.75,
    summary: 'Purchases made Nov 1 to Dec 31 can be returned until Jan 31 with a receipt. Gift receipts get store credit only.',
    body: `Our holiday return window starts November 1. Anything bought between Nov 1 and Dec 31 can be returned until Jan 31 with a receipt.

Update: gift receipts get store credit only, not a refund to the original card. This replaces what we posted yesterday.

Without a receipt, the standard 30-day policy still applies and you need a Shift Lead's approval. The register will show the new return window automatically from November 1.`,
  },
  {
    id: 'a-fire',
    title: 'Keep fire exits and back aisles clear',
    category: 'safety',
    authorId: 'm-michael',
    hoursAgo: 12 * 24,
    requiresAck: true,
    dueInHours: -5 * 24,
    ackRate: 0.97,
    readRate: 0.99,
    summary: 'Fire exits and back aisles must stay completely clear, even during deliveries. The fire marshal visits next week.',
    body: `During last month's walk-through, two stores had boxes blocking a fire exit. That is a fine for us and a real danger for you.

Fire exits and back aisles must stay completely clear at all times, including during truck deliveries. If there's no room, stop unloading and call your Shift Lead.

The fire marshal visits next week. Thanks for keeping each other safe.`,
  },
  {
    id: 'a-availability',
    title: 'Holiday availability due this Friday',
    category: 'schedule',
    authorId: 'e-rachel',
    hoursAgo: 5,
    storeIds: ['dt'],
    ackRate: 0,
    readRate: 0.55,
    summary: 'Submit holiday availability in the front-desk binder by Friday at 6pm. The schedule goes up next Wednesday.',
    body: `Please submit your availability for Thanksgiving through New Year's in the scheduling binder at the front desk by Friday at 6pm.

I'll post the December schedule next Wednesday. If you need a specific day off, write it in. Swaps after the schedule is posted need my approval.`,
  },
  {
    id: 'a-riverside',
    title: 'Riverside hit 118% of its October goal 🎉',
    category: 'recognition',
    authorId: 'm-michael',
    hoursAgo: 3 * 24 + 2,
    ackRate: 0,
    readRate: 0.7,
    summary: "Congrats to the Riverside team on our best month this year: 118% of goal. Pizza's on us Saturday.",
    body: `Huge congrats to the Riverside team for reaching 118% of their October sales goal, our best month this year.

Elena and the team did it with great customer service during the fall sale. Pizza's on us Saturday for the Riverside crew. Thank you all!`,
  },
  {
    id: 'a-fridge',
    title: 'Breakroom fridge cleanout Thursday night',
    category: 'general',
    authorId: 'e-rachel',
    hoursAgo: 26,
    storeIds: ['dt'],
    ackRate: 0,
    readRate: 0.68,
    summary: "Anything left in the breakroom fridge Thursday at 9pm gets thrown out. Label what's yours.",
    body: `Friendly reminder: we're cleaning out the breakroom fridge Thursday after close (around 9pm).

Anything still in there will be thrown out. If you want to keep something, put your name on it.`,
  },
  {
    id: 'a-lakeview-lot',
    title: 'Lakeview parking lot repaving Saturday',
    category: 'general',
    authorId: 'e-dana',
    hoursAgo: 20,
    storeIds: ['lv'],
    ackRate: 0,
    readRate: 0.4,
    summary: 'The staff lot is closed Saturday for repaving. Park in the overflow lot by the garden center.',
    body: `The staff parking lot is closed Saturday for repaving. Please park in the overflow lot next to the garden center and use the side entrance.

Leave a few minutes early, since the shuttle path will be coned off.`,
  },
];

function buildAnnouncement(spec: Spec, employees: Employee[], now: Date, rng: () => number): Announcement {
  const createdAt = now.getTime() - spec.hoursAgo * HOUR;
  const updatedAt = spec.editedHoursAgo != null ? now.getTime() - spec.editedHoursAgo * HOUR : null;
  const version = updatedAt ? 2 : 1;
  const a: Announcement = {
    id: spec.id,
    title: spec.title,
    body: spec.body,
    summary: spec.summary,
    category: spec.category,
    audience: { storeIds: spec.storeIds ?? STORES.map((s) => s.id), jobRoles: spec.jobRoles ?? [...JOB_ROLES] },
    requiresAck: !!spec.requiresAck,
    dueAt: spec.dueInHours != null ? new Date(now.getTime() + spec.dueInHours * HOUR).toISOString() : null,
    authorId: spec.authorId,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
    version,
    changeNote: spec.changeNote,
    acks: {},
    reads: {},
    reminders: [],
    archived: false,
  };

  const between = (from: number, to: number) => new Date(from + rng() * Math.max(0, to - from)).toISOString();
  for (const e of recipients(a, employees)) {
    if (e.id === spec.authorId) continue;
    const start = Math.max(createdAt, new Date(e.startedAt).getTime());
    const joinedLater = new Date(e.startedAt).getTime() > createdAt;
    const mult = (STORE_ENGAGEMENT[e.storeId] ?? 1) * (joinedLater ? 0.3 : 1);
    const r = rng();
    if (a.requiresAck && r < spec.ackRate * mult) {
      // Some people confirmed the original before it was edited → they now need to re-confirm.
      const onOldVersion = updatedAt != null && rng() < 0.45;
      const at = onOldVersion ? between(start, updatedAt!) : between(Math.max(start, updatedAt ?? 0), now.getTime());
      a.acks[e.id] = { at, version: onOldVersion ? 1 : version };
      a.reads[e.id] = at;
    } else if (r < spec.readRate * mult) {
      a.reads[e.id] = between(start, now.getTime());
    }
  }
  return a;
}

export function buildSeed(now = new Date()): AppState {
  const rng = mulberry32(20261030);
  const employees = buildEmployees(now, rng);
  const announcements = SPECS.map((s) => buildAnnouncement(s, employees, now, rng));
  const byId = Object.fromEntries(announcements.map((a) => [a.id, a]));
  const at = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();

  // Make the demo personas tell a clear story regardless of the random draw.
  // Alex: two things to confirm, already confirmed the older fire-exit post, has read a couple of routine posts.
  for (const id of ['a-boxcutter', 'a-returns']) {
    delete byId[id].acks['e-alex'];
    delete byId[id].reads['e-alex'];
  }
  byId['a-fire'].acks['e-alex'] = { at: at(10 * 24), version: 1 };
  byId['a-fire'].reads['e-alex'] = at(10 * 24);
  byId['a-riverside'].reads['e-alex'] = at(60);
  byId['a-fridge'].reads['e-alex'] = at(20);
  delete byId['a-availability'].reads['e-alex'];

  // Jordan: all caught up.
  for (const a of announcements) {
    if (!recipients(a, employees).some((e) => e.id === 'e-jordan')) continue;
    // Jordan reads things soon after they're posted (or re-posted).
    a.reads['e-jordan'] = at(a.updatedAt ? 6 : (now.getTime() - new Date(a.createdAt).getTime()) / HOUR - 1);
    if (a.requiresAck) a.acks['e-jordan'] = { at: a.reads['e-jordan'], version: a.version };
  }

  // A reminder Michael already sent on the fire-exit post 2 days ago.
  const fire = byId['a-fire'];
  const remindedAt = at(48);
  const pendingFire = recipients(fire, employees).filter(
    (e) => fire.acks[e.id]?.version !== fire.version && e.startedAt < remindedAt,
  );
  fire.reminders.push({ at: remindedAt, by: 'm-michael', employeeIds: pendingFire.slice(0, Math.ceil(pendingFire.length / 2)).map((e) => e.id) });

  return {
    stores: STORES,
    employees,
    managers: MANAGERS,
    announcements,
    persona: { mode: 'manager', managerId: 'm-michael' },
  };
}
