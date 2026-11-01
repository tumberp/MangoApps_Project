import { useApp } from '../state/AppContext';
import type { Persona } from '../types';

/** Demo-only: who you are "logged in" as. No real auth in this prototype. */
const EMPLOYEE_PERSONAS: { id: string; hint?: string }[] = [
  { id: 'e-alex' },
  { id: 'e-jordan', hint: 'reads everything' },
  { id: 'e-sam', hint: 'new hire' },
  { id: 'e-rachel', hint: 'her own feed' },
];

function key(p: Persona) {
  return p.mode === 'manager' ? `m:${p.managerId}` : `e:${p.employeeId}`;
}

export function RoleBar() {
  const { state, dispatch } = useApp();
  const storeName = (id: string | null) => (id ? state.stores.find((s) => s.id === id)?.name : 'All stores');

  const onChange = (value: string) => {
    const [mode, id] = value.split(':');
    dispatch({ type: 'persona', persona: mode === 'm' ? { mode: 'manager', managerId: id } : { mode: 'employee', employeeId: id } });
  };

  const onReset = () => {
    if (confirm('Reset all demo data? Posts, confirmations and reminders you created will be lost.')) dispatch({ type: 'reset' });
  };

  return (
    <header className="rolebar">
      <div className="brand">
        <span className="logo" aria-hidden>
          S
        </span>
        <span className="brand-name">Summit Updates</span>
        <span className="proto">prototype</span>
      </div>
      <div className="rolebar-right">
        <label className="viewas">
          <span>View as</span>
          <select value={key(state.persona)} onChange={(e) => onChange(e.target.value)}>
            <optgroup label="Manager view">
              {state.managers.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  {m.name}, {m.title} ({storeName(m.storeId)})
                </option>
              ))}
            </optgroup>
            <optgroup label="Employee view (phone)">
              {EMPLOYEE_PERSONAS.map(({ id, hint }) => {
                const e = state.employees.find((x) => x.id === id);
                if (!e) return null;
                return (
                  <option key={id} value={`e:${id}`}>
                    {e.name}, {e.jobRole} ({storeName(e.storeId)}){hint ? ` · ${hint}` : ''}
                  </option>
                );
              })}
            </optgroup>
          </select>
        </label>
        <button className="btn btn-ghost btn-sm" onClick={onReset}>
          Reset demo
        </button>
      </div>
    </header>
  );
}
