import { useApp } from './state/AppContext';
import { RoleBar } from './components/RoleBar';
import { ManagerApp } from './views/ManagerApp';
import { EmployeeApp } from './views/EmployeeApp';

export default function App() {
  const { state } = useApp();
  const p = state.persona;
  const manager = p.mode === 'manager' ? state.managers.find((m) => m.id === p.managerId) : undefined;
  const employee = p.mode === 'employee' ? state.employees.find((e) => e.id === p.employeeId) : undefined;

  return (
    <>
      <RoleBar />
      <main className={p.mode === 'employee' ? 'main main-phone' : 'main'}>
        {manager && <ManagerApp manager={manager} />}
        {employee && <EmployeeApp employee={employee} />}
        {!manager && !employee && <p className="page">Unknown user. Pick someone from “View as”.</p>}
      </main>
    </>
  );
}
