export type JobRole = 'Store Manager' | 'Shift Lead' | 'Sales Associate' | 'Cashier' | 'Stockroom';

export const JOB_ROLES: JobRole[] = ['Store Manager', 'Shift Lead', 'Sales Associate', 'Cashier', 'Stockroom'];

export type Category = 'safety' | 'policy' | 'schedule' | 'general' | 'recognition';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'safety', label: 'Safety' },
  { id: 'policy', label: 'Policy' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'general', label: 'General' },
  { id: 'recognition', label: 'Shout-out' },
];

export interface Store {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  storeId: string;
  jobRole: JobRole;
  startedAt: string;
}

/** Someone who can post. storeId null = operations, can post to every store. */
export interface Manager {
  id: string;
  name: string;
  title: string;
  storeId: string | null;
}

export interface Audience {
  storeIds: string[];
  jobRoles: JobRole[];
}

/** An acknowledgement is tied to the version the employee confirmed. */
export interface Ack {
  at: string;
  version: number;
  /**
   * Set when a manager recorded it for someone who confirmed in person
   * (team huddle, printed sign-off). Absent = the employee tapped it themselves.
   */
  recordedBy?: string;
}

export interface Reminder {
  at: string;
  by: string;
  employeeIds: string[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  summary: string;
  category: Category;
  audience: Audience;
  requiresAck: boolean;
  dueAt: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string | null;
  version: number;
  /** One line shown to employees when an edit asks them to re-confirm. */
  changeNote?: string;
  acks: Record<string, Ack>;
  reads: Record<string, string>;
  reminders: Reminder[];
  archived: boolean;
}

export type Persona = { mode: 'manager'; managerId: string } | { mode: 'employee'; employeeId: string };

export interface AppState {
  stores: Store[];
  employees: Employee[];
  managers: Manager[];
  announcements: Announcement[];
  persona: Persona;
}
