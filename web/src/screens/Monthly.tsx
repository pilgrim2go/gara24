import { useState } from 'react';
import { api, vnd, pct, todayVN, type MonthlyStats } from '../api';
import { useAsync, ErrorNote } from '../ui/kit';

// Lãi gộp theo tháng, ghi nhận theo ngày hoàn thành lệnh (GET /api/dashboard/monthly).
// Chỉ vai có dashboard.read vào được; cả bốn vai này đều được xem giá vốn.
const MAX_MONTHS = 24;   // khớp giới hạn của API
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

const addMonths = (ym: string, n: number) => {
  const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
const monthLabel = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;

const empty = (month: string): MonthlyStats => ({
  month, orders_completed: 0, rev_labor_completed_vnd: 0, rev_parts_completed_vnd: 0, discount_completed_vnd: 0,
  net_revenue_vnd: 0, cogs_completed_vnd: 0, cogs_provisional_vnd: 0, gross_profit_vnd: 0, margin_bp: null, collected_vnd: 0,
});

export function Monthly() {
  const thisMonth = todayVN().slice(0, 7);
  const [from, setFrom] = useState(addMonths(thisMonth, -5));
  const [to, setTo] = useState(thisMonth);

  const span = YM.test(from) && YM.test(to) ? monthsBetween(from, to) : 0;
  const invalid = !YM.test(from) || !YM.test(to) ? 'Nhập tháng theo dạng năm-tháng, ví dụ 2026-11.'
    : span < 1 ? 'Tháng bắt đầu phải trước hoặc bằng tháng kết thúc.'
    : span > MAX_MONTHS ? `Xem tối đa ${MAX_MONTHS} tháng một lần.`
    : null;

  const rows = useAsync(
    () => (invalid ? Promise.resolve([]) : api.get<MonthlyStats[]>(`/api/dashboard/monthly?from=${from}&to=${to}`)),
    [from, to, invalid],
  );

  // API chỉ trả tháng có số liệu; điền tháng trống bằng 0 để bảng liền mạch, không ai tưởng thiếu dữ liệu
  const byMonth = new Map((rows.data ?? []).map((r) => [r.month, r]));
  const months = invalid ? [] : Array.from({ length: span }, (_, i) => addMonths(from, i));
  const data = months.map((m) => byMonth.get(m) ?? empty(m));
  const total = data.reduce((a, r) => ({
    orders: a.orders + r.orders_completed, net: a.net + r.net_revenue_vnd, cogs: a.cogs + r.cogs_completed_vnd,
    gross: a.gross + r.gross_profit_vnd, prov: a.prov + r.cogs_provisional_vnd,
  }), { orders: 0, net: 0, cogs: 0, gross: 0, prov: 0 });
  // Biên của cả kỳ tính lại từ tổng, không cộng biên từng tháng
  const totalBp = total.net > 0 ? Math.round((total.gross * 10000) / total.net) : null;
  const provMonths = data.filter((r) => r.cogs_provisional_vnd > 0).length;

  return (
    <section className="reports monthly">
      <div className="page-head">
        <h1>Lãi gộp tháng</h1>
        <div className="range">
          <label className="field"><span>Từ tháng</span><input type="month" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>Đến tháng</span><input type="month" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </div>

      <p className="note note-warn note-fixed">Lãi gộp chưa trừ lương thợ, gia công ngoài, chi phí vận hành.</p>
      {invalid && <p className="note note-error" role="alert">{invalid}</p>}
      <ErrorNote error={rows.error} onRetry={rows.reload} />

      {!invalid && (
        <>
          <dl className="counts">
            <div className="count"><dt>Lệnh hoàn thành</dt><dd>{total.orders}</dd></div>
            <div className="count"><dt>Doanh thu thuần</dt><dd className="money">{vnd(total.net)}</dd></div>
            <div className="count"><dt>Lãi gộp</dt><dd className={`money${total.gross < 0 ? ' neg' : ''}`}>{vnd(total.gross)}</dd></div>
            <div className="count"><dt>Biên lãi gộp</dt><dd>{pct(totalBp)}</dd></div>
          </dl>

          {rows.loading && !rows.data ? <p className="empty-line">Đang tải số liệu…</p> : (
            <div className="table-wrap">
              <table className="lines">
                <caption className="sr-only">Lãi gộp theo tháng, từ {monthLabel(from)} đến {monthLabel(to)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Tháng</th>
                    <th scope="col" className="num">Lệnh hoàn thành</th>
                    <th scope="col" className="num">Doanh thu thuần</th>
                    <th scope="col" className="num">Giá vốn</th>
                    <th scope="col" className="num">Lãi gộp</th>
                    <th scope="col" className="num">Biên</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.month} className={r.orders_completed === 0 ? 'row-empty' : ''}>
                      <th scope="row">
                        {monthLabel(r.month)}
                        {r.cogs_provisional_vnd > 0 && <span className="badge badge-warn">Tạm tính</span>}
                      </th>
                      <td className="num">{r.orders_completed}</td>
                      <td className="num">{vnd(r.net_revenue_vnd)}</td>
                      <td className="num">
                        {vnd(r.cogs_completed_vnd)}
                        {r.cogs_provisional_vnd > 0 && <small className="cell-sub">trong đó tạm tính {vnd(r.cogs_provisional_vnd)}</small>}
                      </td>
                      <td className={`num${r.gross_profit_vnd < 0 ? ' neg' : ''}`}>{vnd(r.gross_profit_vnd)}</td>
                      <td className="num">{pct(r.margin_bp)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Cả kỳ{total.prov > 0 && <span className="badge badge-warn">Tạm tính</span>}</th>
                    <td className="num">{total.orders}</td>
                    <td className="num">{vnd(total.net)}</td>
                    <td className="num">{vnd(total.cogs)}</td>
                    <td className={`num${total.gross < 0 ? ' neg' : ''}`}>{vnd(total.gross)}</td>
                    <td className="num">{pct(totalBp)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="fine">
            Số liệu ghi vào tháng lệnh được bàn giao xe (hoàn thành), không theo ngày thu tiền.
            Doanh thu thuần = tiền công + phụ tùng − giảm giá. Lãi gộp = doanh thu thuần − giá vốn phụ tùng.
            {provMonths > 0 && ` Nhãn "Tạm tính" (${provMonths} tháng): có phụ tùng xuất lúc kho trên phần mềm chưa đủ hàng, giá vốn chỉ chốt sau khi nhập bù.`}
          </p>
        </>
      )}
    </section>
  );
}
