import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Announcement, AppState, Persona, Reminder } from '../types';
import { buildSeed } from '../data/seed';

const STORAGE_KEY = 'summit-updates:v2';

export type Action =
  | { type: 'persona'; persona: Persona }
  | { type: 'create'; announcement: Announcement }
  | {
      type: 'update';
      id: string;
      changes: Pick<Announcement, 'title' | 'body' | 'summary' | 'category' | 'audience' | 'requiresAck' | 'dueAt'>;
      /** Material change: everyone has to confirm again. */
      reconfirm: boolean;
      /** What changed, shown to employees. Only used with reconfirm. */
      changeNote?: string;
      at: string;
    }
  | { type: 'read'; id: string; employeeId: string; at: string }
  /** recordedBy: a manager logging an in-person confirmation on the employee's behalf. */
  | { type: 'ack'; id: string; employeeId: string; at: string; recordedBy?: string }
  | { type: 'remind'; id: string; reminder: Reminder }
  | { type: 'archive'; id: string; archived: boolean }
  | { type: 'reset' };

function patch(state: AppState, id: string, fn: (a: Announcement) => Announcement): AppState {
  return { ...state, announcements: state.announcements.map((a) => (a.id === id ? fn(a) : a)) };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'persona':
      return { ...state, persona: action.persona };
    case 'create':
      return { ...state, announcements: [action.announcement, ...state.announcements] };
    case 'update':
      return patch(state, action.id, (a) => ({
        ...a,
        ...action.changes,
        updatedAt: action.at,
        version: action.reconfirm ? a.version + 1 : a.version,
        changeNote: action.reconfirm ? action.changeNote?.trim() || undefined : a.changeNote,
      }));
    case 'read':
      return patch(state, action.id, (a) =>
        a.reads[action.employeeId] ? a : { ...a, reads: { ...a.reads, [action.employeeId]: action.at } },
      );
    case 'ack':
      return patch(state, action.id, (a) => ({
        ...a,
        // An in-person confirmation doesn't mean they opened the post in the app.
        reads: action.recordedBy ? a.reads : { ...a.reads, [action.employeeId]: a.reads[action.employeeId] ?? action.at },
        acks: {
          ...a.acks,
          [action.employeeId]: action.recordedBy
            ? { at: action.at, version: a.version, recordedBy: action.recordedBy }
            : { at: action.at, version: a.version },
        },
      }));
    case 'remind':
      return patch(state, action.id, (a) => ({ ...a, reminders: [...a.reminders, action.reminder] }));
    case 'archive':
      return patch(state, action.id, (a) => ({ ...a, archived: action.archived }));
    case 'reset':
      return buildSeed();
  }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* corrupted or blocked storage: fall back to fresh demo data */
  }
  return buildSeed();
}

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: the demo still works in memory */
    }
  }, [state]);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
