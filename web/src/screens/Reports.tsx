import { useState } from 'react';
import { api, vnd, todayVN, type DailyStats } from '../api';
import { useAsync, ErrorNote } from '../ui/kit';

// Báo cáo ngày từ bảng tổng hợp daily_branch_stats (một dòng mỗi ngày).
export function Reports() {
  const today = todayVN();
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const rows = useAsync(() => api.get<DailyStats[]>(`/api/dashboard/daily?from=${from}&to=${to}`), [from, to]);
  const data = rows.data ?? [];
  const sum = (k: keyof DailyStats) => data.reduce((a, r) => a + (r[k] as number), 0);

  return (
    <section className="reports">
      <div className="page-head">
        <h1>Báo cáo theo ngày</h1>
        <div className="range">
          <label className="field"><span>Từ</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Đến</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </div>
      <ErrorNote error={rows.error} onRetry={rows.reload} />
      <dl className="counts">
        <div className="count"><dt>Tiền đã thu</dt><dd className="money">{vnd(sum('collected_vnd') - sum('refund_out_vnd'))}</dd></div>
        <div className="count"><dt>Lệnh tiếp nhận</dt><dd>{sum('orders_received')}</dd></div>
        <div className="count"><dt>Giá vốn xuất kho</dt><dd className="money">{vnd(sum('stock_out_value_vnd'))}</dd></div>
        <div className="count"><dt>Lệnh hủy</dt><dd>{sum('orders_cancelled')}</dd></div>
      </dl>
      {data.length === 0 ? <p className="empty-line">Chưa có số liệu trong khoảng ngày này.</p> : (
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Ngày</th><th className="num">Lệnh nhận</th><th className="num">Thu QR</th><th className="num">Thu tiền mặt</th><th className="num">Hoàn tiền</th><th className="num">Nhập kho</th><th className="num">Xuất kho</th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.biz_date}>
                  <td>{r.biz_date.split('-').reverse().join('/')}</td>
                  <td className="num">{r.orders_received}</td>
                  <td className="num">{vnd(r.qr_in_vnd)}</td>
                  <td className="num">{vnd(r.cash_in_vnd)}</td>
                  <td className="num">{vnd(r.refund_out_vnd)}</td>
                  <td className="num">{vnd(r.stock_in_value_vnd)}</td>
                  <td className="num">{vnd(r.stock_out_value_vnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine">Lãi theo tháng cần doanh thu và giá vốn theo lệnh hoàn thành; phần này có khi luồng hoàn thành ghi vào bảng tổng hợp.</p>
    </section>
  );
}
