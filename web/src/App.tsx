import { useEffect, useState } from 'react';
import { api, ApiError, devUser, ROLE_LABEL, type Me } from './api';
import { useAsync } from './ui/kit';
import { Login } from './screens/Login';
import { Board } from './screens/Board';
import { OrderScreen } from './screens/Order';
import { NewOrder } from './screens/NewOrder';
import { Reports } from './screens/Reports';

// Định tuyến bằng hash: #/board, #/orders/<id>, #/new, #/reports
function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/board');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/board');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.slice(1).split('/').filter(Boolean);
}
export const go = (path: string) => { location.hash = path; };

export function App() {
  const route = useRoute();
  const me = useAsync<Me | null>(async () => {
    try {
      return await api.get<Me>('/api/me');
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
      throw e;
    }
  }, [route[0] === 'login']);

  if (me.loading && !me.data) return <div className="splash">Đang mở Gara24…</div>;
  // Đổi người: tải lại cả trang để không còn dữ liệu nào của vai trước trong bộ nhớ
  if (!me.data) return <Login onDone={() => { location.hash = '#/board'; location.reload(); }} />;
  const u = me.data;
  const can = (p: string) => u.perms.includes(p);
  const [screen, id] = route;

  const nav = [
    { key: 'board', label: 'Điều phối', show: true },
    { key: 'new', label: 'Lệnh mới', show: can('wo.create') },
    { key: 'reports', label: 'Báo cáo', show: can('dashboard.read') },
  ].filter((n) => n.show);
  const active = screen === 'orders' ? 'board' : screen;

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="#/board">Gara24<span className="brand-branch">{u.branch_name}</span></a>
        {nav.length > 1 && <nav className="nav" aria-label="Chính">
          {nav.map((n) => (
            <a key={n.key} href={`#/${n.key}`} className={`nav-link${active === n.key ? ' is-active' : ''}`} aria-current={active === n.key ? 'page' : undefined}>{n.label}</a>
          ))}
        </nav>}
        <div className="who">
          <span className="who-name">{u.full_name}</span>
          <span className="who-role">{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>
          {devUser.get() && <button className="btn btn-quiet" onClick={() => { devUser.clear(); go('/login'); me.setData(null); }}>Đổi người</button>}
        </div>
      </header>
      <main className="main">
        {screen === 'orders' && id ? <OrderScreen id={id} me={u} />
          : screen === 'new' && can('wo.create') ? <NewOrder />
          : screen === 'reports' && can('dashboard.read') ? <Reports />
          : <Board me={u} />}
      </main>
    </div>
  );
}
