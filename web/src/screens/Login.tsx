import { api, devUser, ROLE_LABEL } from '../api';
import { useAsync, ErrorNote, useAction } from '../ui/kit';

type DevUser = { email: string; full_name: string; roles: string[] };

// Chỉ dùng khi chạy local (DEV_AUTH=1). Production đăng nhập qua Cloudflare Access, không thấy màn này.
export function Login({ onDone }: { onDone: () => void }) {
  const users = useAsync(() => api.get<DevUser[]>('/dev/users'), []);
  const seed = useAction(async () => { await api.post('/dev/seed'); await users.reload(); });

  const pick = (email: string) => { devUser.set(email); onDone(); };

  return (
    <div className="login">
      <div className="login-card">
        <h1 className="login-title">Gara24</h1>
        <p className="login-lead">Chọn một người trong xưởng để xem phần mềm theo đúng quyền của họ.</p>
        {users.error ? (
          <div className="note">Bản này không bật chế độ demo. Đăng nhập bằng tài khoản Cloudflare Access của gara.</div>
        ) : users.data && users.data.length === 0 ? (
          <div className="empty">
            <p>Chưa có dữ liệu mẫu.</p>
            <button className="btn btn-primary" disabled={seed.busy} onClick={() => seed.run()}>{seed.busy ? 'Đang nạp…' : 'Nạp dữ liệu mẫu'}</button>
            <ErrorNote error={seed.error} />
          </div>
        ) : (
          <ul className="people">
            {users.data?.map((u) => (
              <li key={u.email}>
                <button className="person" onClick={() => pick(u.email)}>
                  <span className="person-name">{u.full_name}</span>
                  <span className="person-role">{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
