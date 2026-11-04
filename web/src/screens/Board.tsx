import { useEffect } from 'react';
import { api, vnd, since, HOLD_LABEL, STATUS_LABEL, type Me, type OrderListItem } from '../api';
import { Plate, useAsync, ErrorNote } from '../ui/kit';

const LANES: Array<{ key: string; title: string; statuses: string[] }> = [
  { key: 'in', title: 'Tiếp nhận', statuses: ['received', 'quoted'] },
  { key: 'ok', title: 'Khách duyệt', statuses: ['approved'] },
  { key: 'work', title: 'Đang sửa', statuses: ['in_progress'] },
  { key: 'qc', title: 'Kiểm tra', statuses: ['qc'] },
  { key: 'pay', title: 'Chờ thu tiền', statuses: ['delivered'] },
];
const THREE_DAYS = 3 * 86_400_000;

// G1-15: bảng điều phối. Làm mới mỗi 20 giây (sau này thay bằng Durable Object đẩy thay đổi).
export function Board({ me }: { me: Me }) {
  const list = useAsync(() => api.get<OrderListItem[]>('/api/work-orders'), []);
  useEffect(() => {
    const t = setInterval(() => void list.reload(), 20_000);
    return () => clearInterval(t);
  }, [list.reload]);

  const now = Date.now();
  const orders = list.data ?? [];
  const inShop = orders.filter((o) => o.status !== 'delivered');
  const counts = [
    { label: 'Xe trong xưởng', value: inShop.length, warn: false },
    { label: 'Đang chờ', value: orders.filter((o) => o.hold_reason).length, warn: orders.some((o) => o.hold_reason) },
    { label: 'Nằm quá 3 ngày', value: inShop.filter((o) => now - o.received_at > THREE_DAYS).length, warn: inShop.some((o) => now - o.received_at > THREE_DAYS) },
    { label: 'Chờ thu tiền', value: orders.filter((o) => o.status === 'delivered').length, warn: false },
  ];

  return (
    <section className="board">
      <div className="page-head">
        <h1>Điều phối xưởng</h1>
        {me.perms.includes('wo.create') && <a className="btn btn-primary" href="#/new">Tiếp nhận xe</a>}
      </div>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <dl className="counts">
        {counts.map((c) => (
          <div key={c.label} className={`count${c.warn && c.value ? ' is-warn' : ''}`}>
            <dt>{c.label}</dt>
            <dd>{c.value}</dd>
          </div>
        ))}
      </dl>
      <div className="lanes">
        {LANES.map((lane) => {
          const items = orders.filter((o) => lane.statuses.includes(o.status));
          return (
            <section key={lane.key} className="lane" aria-label={lane.title}>
              <h2 className="lane-title">{lane.title}<span className="lane-count">{items.length}</span></h2>
              {items.length === 0 && <p className="lane-empty">Trống</p>}
              {items.map((o) => {
                const late = o.promised_at && o.promised_at < now && o.status !== 'delivered';
                const old = now - o.received_at > THREE_DAYS && o.status !== 'delivered';
                const tone = o.hold_reason || old ? 'warn' : late ? 'late' : o.locked_at ? 'done' : 'normal';
                return (
                  <a key={o.id} className={`slip slip-${tone}`} href={`#/orders/${o.id}`}>
                    <div className="slip-top">
                      <Plate value={o.plate} size="sm" />
                      <span className="slip-no">{o.order_no ?? 'Chưa có số'}</span>
                    </div>
                    <div className="slip-car">{[o.make, o.model].filter(Boolean).join(' ') || 'Chưa rõ dòng xe'}</div>
                    {o.hold_reason && <div className="slip-hold">{HOLD_LABEL[o.hold_reason]}, {since(o.hold_started_at!, now)}</div>}
                    {late && !o.hold_reason && <div className="slip-late">Trễ hẹn giao</div>}
                    <div className="slip-foot">
                      <span>Vào xưởng {since(o.received_at, now)}</span>
                      <span className="money">{vnd(o.grand_total_vnd)}</span>
                    </div>
                    {o.status === 'quoted' && <div className="slip-sub">{STATUS_LABEL.quoted}</div>}
                  </a>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}
