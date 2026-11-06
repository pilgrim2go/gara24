import { useEffect, useState } from 'react';
import { api, vnd, qty, type Item, type Warehouse, type StockReceipt } from '../api';
import { useAsync, ErrorNote, useSubmitOnce, MoneyInput, parseQtyM } from '../ui/kit';

// Nhập kho mua vào (POST /api/stock/receipts). Chỉ vai có stock.receive (chủ, quản lý, thủ kho; đều thấy giá vốn).
// Một phiếu: một kho, nhiều dòng, mỗi mặt hàng một dòng, tối đa 100 dòng (khớp API).
const MAX_LINES = 100;
const STOCKABLE = ['part', 'consumable'];   // khớp guard ITEM_NOT_STOCKABLE; dịch vụ/tiền công không nhập kho

type Row = { item: Item; qty: string; cost: number | null };
// Thành tiền một dòng, làm tròn giống máy chủ: ROUND(qty_m * đơn giá / 1000)
const lineTotal = (qtyM: number | null, cost: number | null) => (qtyM === null || cost === null ? null : Math.round((qtyM * cost) / 1000));

export function Receive() {
  const wh = useAsync(() => api.get<Warehouse[]>('/api/warehouses'), []);
  const [whId, setWhId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [done, setDone] = useState<{ r: StockReceipt; names: Record<string, Item> } | null>(null);
  const items = useAsync(() => (q.trim().length < 1 ? Promise.resolve([] as Item[]) : api.get<Item[]>(`/api/items?q=${encodeURIComponent(q.trim())}`)), [q]);
  const save = useSubmitOnce((key: string, body: unknown) => api.post<StockReceipt>('/api/stock/receipts', body, key));
  const locked = save.uncertain || save.busy;

  useEffect(() => { if (!whId && wh.data?.length) setWhId(wh.data[0].id); }, [wh.data, whId]);

  const added = new Set(rows.map((r) => r.item.id));
  const found = (items.data ?? []).filter((i) => STOCKABLE.includes(i.item_type) && !added.has(i.id));
  const add = (item: Item) => { setRows([...rows, { item, qty: '1', cost: null }]); setQ(''); };
  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const remove = (i: number) => setRows(rows.filter((_, k) => k !== i));

  const parsed = rows.map((r) => {
    const qtyM = parseQtyM(r.qty);
    return { ...r, qtyM, total: lineTotal(qtyM, r.cost), qtyErr: qtyM === null || qtyM <= 0 };
  });
  const total = parsed.reduce((a, r) => a + (r.total ?? 0), 0);
  const zeroCost = parsed.filter((r) => r.cost === 0).length;
  const problems = [
    !whId && 'Chọn kho nhận hàng.',
    rows.length === 0 && 'Thêm ít nhất một mặt hàng.',
    rows.length > MAX_LINES && `Một phiếu tối đa ${MAX_LINES} dòng; tách thành nhiều phiếu.`,
    parsed.some((r) => r.qtyErr) && 'Số lượng phải lớn hơn 0, tối đa 3 chữ số thập phân.',
    parsed.some((r) => r.cost === null) && 'Nhập đơn giá nhập cho mọi dòng.',
  ].filter(Boolean) as string[];

  const submit = async () => {
    if (problems.length) return;
    const names = Object.fromEntries(rows.map((r) => [r.item.id, r.item]));
    const r = await save.run({
      warehouse_id: whId,
      supplier_invoice_no: invoice.trim() || undefined,
      note: note.trim() || undefined,
      lines: parsed.map((l) => ({ item_id: l.item.id, qty_m: l.qtyM!, unit_cost_vnd: l.cost! })),
    });
    if (r) setDone({ r, names });
  };
  const reset = () => { setDone(null); setRows([]); setInvoice(''); setNote(''); setQ(''); };

  if (done) {
    const w = wh.data?.find((x) => x.id === done.r.warehouse_id);
    return (
      <section className="receive">
        <div className="page-head"><h1>Nhập kho</h1></div>
        <div className="paid-ok" role="status">
          Đã ghi phiếu nhập
          <span className="cash-doc"><strong>{done.r.doc_no}</strong>, tổng {vnd(done.r.total_cost_vnd)}</span>
        </div>
        <p className="fine">Kho {w ? w.name ?? w.code : done.r.warehouse_id}, ngày {done.r.biz_date.split('-').reverse().join('/')}
          {done.r.supplier_invoice_no ? `, hóa đơn nhà cung cấp ${done.r.supplier_invoice_no}` : ', chưa ghi số hóa đơn nhà cung cấp'}.</p>
        <div className="table-wrap">
          <table className="lines">
            <thead><tr><th>Mặt hàng</th><th className="num">SL</th><th className="num">Thành tiền</th></tr></thead>
            <tbody>
              {done.r.lines.map((l) => {
                const it = done.names[l.item_id];
                return <tr key={l.item_id}><td>{it?.name ?? l.item_id}</td><td className="num">{qty(l.qty_m)} {it?.uom ?? ''}</td><td className="num">{vnd(l.total_cost_vnd)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="actions receive-after"><button className="btn btn-primary btn-big" onClick={reset} autoFocus>Nhập phiếu khác</button></div>
      </section>
    );
  }

  return (
    <section className="receive">
      <div className="page-head"><h1>Nhập kho</h1></div>
      <ErrorNote error={wh.error} onRetry={wh.reload} />
      <div className="field-row">
        <label className="field"><span>Kho nhận hàng</span>
          <select value={whId} disabled={locked || !wh.data} onChange={(e) => setWhId(e.target.value)}>
            {(wh.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name ? `${w.code}: ${w.name}` : w.code}</option>)}
          </select>
        </label>
        <label className="field"><span>Số hóa đơn nhà cung cấp</span>
          <input value={invoice} maxLength={50} disabled={locked} onChange={(e) => setInvoice(e.target.value)} placeholder="Ví dụ: 0001234" />
          {!invoice.trim() && <small>Nên ghi để kế toán đối chiếu với MISA.</small>}
        </label>
      </div>

      <h2>Hàng nhập</h2>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="lines receive-lines">
            <thead><tr><th>Mặt hàng</th><th className="num">SL</th><th className="num">Đơn giá nhập</th><th className="num">Thành tiền</th><th><span className="sr-only">Bỏ</span></th></tr></thead>
            <tbody>
              {parsed.map((r, i) => (
                <tr key={r.item.id}>
                  <td>{r.item.name}<span className="issued">{r.item.code}, tồn {qty(r.item.on_hand_qty_m)} {r.item.uom}</span></td>
                  <td className="num">
                    <input className={`cell-in${r.qtyErr ? ' is-bad' : ''}`} inputMode="decimal" aria-label={`Số lượng ${r.item.name}`} aria-invalid={r.qtyErr}
                      value={r.qty} disabled={locked} onChange={(e) => patch(i, { qty: e.target.value })} />
                    <span className="uom">{r.item.uom}</span>
                  </td>
                  <td className="num">
                    <MoneyInput compact label={`Đơn giá ${r.item.name}`} value={r.cost} disabled={locked} onChange={(v) => patch(i, { cost: v })} />
                  </td>
                  <td className="num">{r.total === null ? '—' : vnd(r.total)}</td>
                  <td><button className="btn btn-quiet btn-danger" disabled={locked} onClick={() => remove(i)} aria-label={`Bỏ dòng ${r.item.name}`}>Bỏ</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3}>Tổng tiền hàng ({rows.length} dòng, chưa VAT)</td><td className="num"><strong>{vnd(total)}</strong></td><td /></tr></tfoot>
          </table>
        </div>
      )}

      {!locked && rows.length < MAX_LINES && (
        <div className="receive-add">
          <label className="field"><span>Thêm mặt hàng</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên hoặc mã phụ tùng, vật tư" autoFocus={rows.length === 0} />
          </label>
          {q.trim() && (
            found.length ? (
              <ul className="pick">
                {found.map((i) => (
                  <li key={i.id}><button onClick={() => add(i)}><span>{i.name} <small className="pick-meta">{i.code}</small></span><span className="pick-meta">Tồn {qty(i.on_hand_qty_m)} {i.uom}</span></button></li>
                ))}
              </ul>
            ) : !items.loading && <p className="empty-line">Không thấy mặt hàng nhập kho được khớp “{q.trim()}”. Dịch vụ và tiền công không hiện ở đây.</p>
          )}
        </div>
      )}

      <label className="field"><span>Ghi chú (không bắt buộc)</span>
        <input value={note} maxLength={300} disabled={locked} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: hàng giao thiếu 2 lọc dầu, hẹn bổ sung" />
      </label>

      {zeroCost > 0 && <p className="note note-warn">{zeroCost} dòng có đơn giá 0 đ (hàng tặng?). Giá vốn bình quân của mặt hàng sẽ giảm.</p>}
      {save.uncertain ? (
        <div className="note note-warn" role="alert">
          <span>Mất kết nối hoặc máy chủ lỗi nên chưa rõ phiếu đã ghi hay chưa. Bấm <strong>Thử lại</strong>: nếu lần trước đã ghi, hệ thống trả lại đúng phiếu cũ, không nhập kho hai lần.</span>
        </div>
      ) : <ErrorNote error={save.error} />}
      {rows.length > 0 && problems.length > 0 && <p className="fine">{problems.join(' ')}</p>}
      <div className="actions">
        <button className="btn btn-primary btn-big" disabled={problems.length > 0 || save.busy} onClick={submit}>
          {save.busy ? 'Đang ghi phiếu…' : save.uncertain ? 'Thử lại' : `Ghi phiếu nhập${rows.length ? ` (${vnd(total)})` : ''}`}
        </button>
      </div>
    </section>
  );
}
