import { useEffect, useState } from 'react';
import {
  api, ApiError, devUser, vnd, qty, timeVN, dateTimeVN, pct, since, errorText, STATUS_LABEL, PAY_LABEL, HOLD_LABEL, NEXT,
  type Me, type Order, type OrderEvent, type Item, type Intent, type AuditEntry, type Line,
} from '../api';
import { Plate, useAsync, ErrorNote, Dialog, useAction } from '../ui/kit';

const STEPS = ['received', 'quoted', 'approved', 'in_progress', 'qc', 'delivered'];
const EDITABLE = ['received', 'quoted', 'approved', 'in_progress', 'qc'];
const WORKING = ['approved', 'in_progress', 'qc'];
const ACTION_LABEL: Record<string, string> = {
  create: 'Tạo lệnh', add_lines: 'Thêm hạng mục', issue: 'Xuất kho', cancel: 'Hủy lệnh', reopen: 'Mở lại lệnh',
  hold_start: 'Báo chờ', hold_end: 'Hết chờ',
};
const LOCK_LABEL: Record<string, string> = { paid: 'đã thu đủ tiền', invoice: 'đã có hóa đơn điện tử' };

// Một mốc trên dòng thời gian: câu ngắn theo ngôn ngữ xưởng, không lộ mã kỹ thuật
function eventText(e: OrderEvent): string {
  const st = (v: string | null) => (v ? STATUS_LABEL[v] ?? v : '');
  if (e.kind === 'status') {
    if (!e.from_value) return `Tạo lệnh (${st(e.to_value)})`;
    if (e.to_value === 'cancelled') return 'Hủy lệnh';
    if (e.from_value === 'qc' && e.to_value === 'in_progress') return 'Kiểm tra chưa đạt, trả lại thợ';
    if (e.to_value === 'delivered') return 'Bàn giao xe (hoàn thành lệnh)';
    return `${st(e.from_value)} → ${st(e.to_value)}`;
  }
  if (e.kind === 'lock') return `Khóa lệnh${e.to_value && LOCK_LABEL[e.to_value] ? `: ${LOCK_LABEL[e.to_value]}` : ''}`;
  return 'Mở khóa lệnh';   // 'unlock' và 'reopen'
}
// Lý do hủy lưu dạng "MÃ: giải thích"; đổi mã sang chữ
function reasonText(r: string | null): string | null {
  if (!r) return null;
  const m = /^([A-Z_]+): (.*)$/s.exec(r);
  const label = m ? CANCEL_REASONS.find(([k]) => k === m[1])?.[1] : undefined;
  return label ? `${label}. ${m![2]}` : r;
}

type Dlg = null | 'line' | 'issue' | 'qr' | 'hold' | 'cancel' | 'reopen';

export function OrderScreen({ id, me }: { id: string; me: Me }) {
  const order = useAsync(() => api.get<Order>(`/api/work-orders/${id}`), [id]);
  const audit = useAsync(() => (me.perms.includes('audit.read') ? api.get<AuditEntry[]>(`/api/work-orders/${id}/audit`) : Promise.resolve([])), [id]);
  const [dlg, setDlg] = useState<Dlg>(null);
  const reload = async () => { await Promise.all([order.reload(), audit.reload()]); };
  const move = useAction(async (to: string) => {
    try {
      await api.post(`/api/work-orders/${id}/transition`, { expected_version: order.data!.version, to });
    } catch (e) {
      // Người khác vừa sửa: tải lại để lần bấm sau dùng phiên bản mới, rồi báo lỗi
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') await reload();
      throw e;
    }
    await reload();
  });
  const endHold = useAction(async () => { await api.post(`/api/work-orders/${id}/holds/end`); await reload(); });

  if (order.error && !order.data) return <ErrorNote error={order.error} onRetry={order.reload} />;
  const o = order.data;
  if (!o) return <div className="splash">Đang tải lệnh…</div>;

  const can = (p: string) => me.perms.includes(p);
  const onlyTech = me.roles.every((r) => r === 'technician');
  const locked = o.locked_at !== null;
  const cancelled = o.status === 'cancelled';
  const remaining = o.grand_total_vnd - o.paid_vnd;
  const activeLines = o.lines.filter((l) => l.status === 'active');
  const toIssue = activeLines.filter((l) => l.line_type === 'part' && l.issued_qty_m < l.qty_m);
  const next = (NEXT[o.status] ?? []).filter((n) => !onlyTech || ['in_progress', 'qc'].includes(n.to));
  const step = STEPS.indexOf(o.status === 'closed' ? 'delivered' : o.status);
  const done = () => { setDlg(null); void reload(); };

  return (
    <section className="order">
      <a className="back" href="#/board">Về bảng điều phối</a>
      <header className="order-head">
        <Plate value={o.plate} size="lg" />
        <div className="order-id">
          <h1>{o.order_no ?? 'Lệnh chưa có số'}</h1>
          <p>{[o.vehicle.make, o.vehicle.model, o.vehicle.model_year].filter(Boolean).join(' ')}. Vào xưởng {timeVN(o.received_at)}{o.promised_at ? `, hẹn giao ${timeVN(o.promised_at)}` : ''}.</p>
          {o.completed_at !== null && <p className="order-done">Hoàn thành (giao xe) lúc <time dateTime={new Date(o.completed_at).toISOString()}>{dateTimeVN(o.completed_at)}</time></p>}
        </div>
        <div className="order-badges">
          <span className={`badge badge-pay-${o.payment_status}`}>{PAY_LABEL[o.payment_status]}</span>
          {locked && <span className="badge badge-lock">Đã khóa</span>}
        </div>
      </header>

      {cancelled ? (
        <div className="note note-error">Lệnh đã hủy. Phụ tùng đã xuất được nhập lại kho.</div>
      ) : (
        <ol className="steps" aria-label="Tiến độ lệnh">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}>{STATUS_LABEL[s]}</li>
          ))}
        </ol>
      )}

      {o.hold && (
        <div className="note note-warn">
          <span><strong>{HOLD_LABEL[o.hold.reason]}</strong> từ {timeVN(o.hold.started_at)} ({since(o.hold.started_at)}){o.hold.note ? `: ${o.hold.note}` : ''}. Thời gian chờ không tính vào hiệu suất của thợ.</span>
          {can('wo.transition') && <button className="btn" disabled={endHold.busy} onClick={() => endHold.run()}>Hết chờ, làm tiếp</button>}
        </div>
      )}
      <ErrorNote error={move.error ?? endHold.error ?? order.error} />

      {!cancelled && (
        <div className="actions">
          {can('wo.transition') && !o.hold && next.map((n) => (
            <button key={n.to} className="btn btn-primary btn-big" disabled={move.busy || order.loading} onClick={() => move.run(n.to)}>{n.label}</button>
          ))}
          {can('wo.transition') && !o.hold && WORKING.includes(o.status) && <button className="btn btn-big" onClick={() => setDlg('hold')}>Báo chờ</button>}
          {can('wo.lines') && !locked && EDITABLE.includes(o.status) && <button className="btn btn-big" onClick={() => setDlg('line')}>Thêm hạng mục</button>}
          {can('wo.issue') && !locked && WORKING.includes(o.status) && toIssue.length > 0 && <button className="btn btn-big" onClick={() => setDlg('issue')}>Xuất phụ tùng</button>}
          {can('pay.intent') && remaining > 0 && <button className="btn btn-big btn-money" onClick={() => setDlg('qr')}>Thu tiền QR</button>}
          {can('wo.reopen') && locked && <button className="btn btn-quiet" onClick={() => setDlg('reopen')}>Mở lại lệnh</button>}
          {can('wo.cancel') && !locked && EDITABLE.includes(o.status) && <button className="btn btn-quiet btn-danger" onClick={() => setDlg('cancel')}>Hủy lệnh</button>}
        </div>
      )}

      <div className="order-grid">
        <div className="order-lines">
          <h2>Hạng mục</h2>
          {activeLines.length === 0 ? (
            <p className="empty-line">Chưa có hạng mục. {can('wo.lines') ? 'Thêm tiền công và phụ tùng để báo giá cho khách.' : ''}</p>
          ) : (
            <div className="table-wrap">
              <table className="lines">
                <thead><tr><th>Hạng mục</th><th className="num">SL</th><th className="num col-price">Đơn giá</th><th className="num">Thành tiền</th></tr></thead>
                <tbody>
                  {activeLines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className={`kind kind-${l.line_type}`}>{l.line_type === 'part' ? 'Phụ tùng' : 'Công'}</span> {l.description}
                        {l.line_type === 'part' && <span className="issued">Đã xuất {qty(l.issued_qty_m)}/{qty(l.qty_m)}</span>}
                      </td>
                      <td className="num">{qty(l.qty_m)}</td>
                      <td className="num col-price">{vnd(l.unit_price_vnd)}</td>
                      <td className="num">{vnd(l.net_vnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {o.events.length > 0 && (
            <>
              <h2>Dòng thời gian</h2>
              <ol className="timeline">
                {o.events.map((e, i) => {
                  const r = reasonText(e.reason);
                  return (
                    <li key={i} className={`tl tl-${e.kind}${e.to_value === 'cancelled' ? ' tl-cancel' : ''}`}>
                      <time dateTime={new Date(e.at).toISOString()}>{dateTimeVN(e.at)}</time>
                      <span className="tl-what">{eventText(e)}</span>
                      <span className="tl-who">{e.by_name}</span>
                      {r && <span className="tl-why">Lý do: {r}</span>}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {can('audit.read') && (
            <>
              <h2>Nhật ký</h2>
              <ol className="log">
                {(audit.data ?? []).slice().reverse().map((a, i) => (
                  <li key={i}><time>{timeVN(a.at)}</time> {ACTION_LABEL[a.action] ?? a.action} <span className="log-who">{a.actor_name}</span>{a.reason ? `: ${a.reason}` : ''}</li>
                ))}
              </ol>
            </>
          )}
        </div>

        <aside className="order-side">
          <section className="panel">
            <h2>Thanh toán</h2>
            <dl className="sums">
              <div><dt>Tiền công</dt><dd>{vnd(o.labor_gross_vnd)}</dd></div>
              <div><dt>Phụ tùng</dt><dd>{vnd(o.parts_gross_vnd)}</dd></div>
              {o.discount_vnd > 0 && <div><dt>Giảm giá</dt><dd>−{vnd(o.discount_vnd)}</dd></div>}
              <div className="sum-total"><dt>Khách trả</dt><dd>{vnd(o.grand_total_vnd)}</dd></div>
              <div><dt>Đã thu</dt><dd>{vnd(o.paid_vnd)}</dd></div>
              {remaining > 0 && <div className="sum-due"><dt>Còn phải thu</dt><dd>{vnd(remaining)}</dd></div>}
            </dl>
          </section>
          {o.cost && (
            <section className="panel panel-cost">
              <h2>Lãi của lệnh{o.cost.cost_status === 'provisional' && <span className="badge badge-warn">Tạm tính</span>}</h2>
              <dl className="sums">
                <div><dt>Giá vốn phụ tùng</dt><dd>{vnd(o.cost.parts_cost_vnd)}</dd></div>
                <div className="sum-total"><dt>Lãi gộp</dt><dd className={o.cost.gross_profit_vnd < 0 ? 'neg' : ''}>{vnd(o.cost.gross_profit_vnd)}</dd></div>
                {o.cost.margin_bp !== null && <div><dt>Biên</dt><dd>{pct(o.cost.margin_bp)}</dd></div>}
              </dl>
              <p className="fine">Chưa gồm VAT và chi phí vận hành. Chỉ chủ gara, quản lý, thủ kho, kế toán, nhà đầu tư thấy phần này.</p>
            </section>
          )}
        </aside>
      </div>

      {dlg === 'line' && <AddLineDialog order={o} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'issue' && <IssueDialog order={o} lines={toIssue} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'qr' && <QrDialog order={o} onClose={done} />}
      {dlg === 'hold' && <HoldDialog id={o.id} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'cancel' && <CancelDialog order={o} onClose={() => setDlg(null)} onDone={done} />}
      {dlg === 'reopen' && <ReopenDialog id={o.id} onClose={() => setDlg(null)} onDone={done} />}
    </section>
  );
}

// ---------------------------------------------------------------- thêm hạng mục
function AddLineDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<'labor' | 'part'>('labor');
  const [desc, setDesc] = useState('');
  const [q, setQ] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [amount, setAmount] = useState('1');
  const [price, setPrice] = useState('');
  const items = useAsync(() => (kind === 'part' ? api.get<Item[]>(`/api/items?q=${encodeURIComponent(q)}`) : Promise.resolve([])), [kind, q]);
  const save = useAction(async () => {
    const qtyM = Math.round(Number(amount.replace(',', '.')) * 1000);
    const unit = Number(price.replace(/\D/g, ''));
    await api.post(`/api/work-orders/${order.id}/lines`, {
      expected_version: order.version,
      lines: [kind === 'part'
        ? { line_type: 'part', item_id: item?.id, description: item?.name ?? '', qty_m: qtyM, unit_price_vnd: unit }
        : { line_type: 'labor', description: desc.trim(), qty_m: qtyM, unit_price_vnd: unit }],
    });
    onDone();
  });
  const ready = (kind === 'labor' ? desc.trim().length > 0 : !!item) && Number(amount.replace(',', '.')) > 0 && price !== '';

  return (
    <Dialog title="Thêm hạng mục" onClose={onClose} footer={<>
      <ErrorNote error={save.error} />
      <button className="btn btn-primary" disabled={!ready || save.busy} onClick={() => save.run()}>{save.busy ? 'Đang lưu…' : 'Thêm vào lệnh'}</button>
    </>}>
      <div className="seg" role="radiogroup" aria-label="Loại hạng mục">
        <button role="radio" aria-checked={kind === 'labor'} className={kind === 'labor' ? 'is-on' : ''} onClick={() => setKind('labor')}>Tiền công</button>
        <button role="radio" aria-checked={kind === 'part'} className={kind === 'part' ? 'is-on' : ''} onClick={() => setKind('part')}>Phụ tùng</button>
      </div>
      {kind === 'labor' ? (
        <label className="field"><span>Việc làm</span><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ví dụ: Công thay má phanh trước" autoFocus /></label>
      ) : (
        <>
          <label className="field"><span>Tìm phụ tùng</span><input value={q} onChange={(e) => { setQ(e.target.value); setItem(null); }} placeholder="Tên hoặc mã" autoFocus /></label>
          <ul className="pick">
            {(items.data ?? []).map((i) => (
              <li key={i.id}>
                <button className={item?.id === i.id ? 'is-on' : ''} onClick={() => { setItem(i); setPrice(String(i.default_price_vnd ?? '')); }}>
                  <span>{i.name}</span><span className="pick-meta">Tồn {qty(i.on_hand_qty_m)} {i.uom}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="field-row">
        <label className="field"><span>Số lượng{item ? ` (${item.uom})` : ''}</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="field"><span>Đơn giá (đ)</span><input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      </div>
      {item && Number(amount.replace(',', '.')) * 1000 > item.on_hand_qty_m && <p className="note note-warn">Tồn kho hiện có {qty(item.on_hand_qty_m)} {item.uom}, ít hơn số lượng báo giá.</p>}
    </Dialog>
  );
}

// ---------------------------------------------------------------- xuất phụ tùng
function IssueDialog({ order, lines, onClose, onDone }: { order: Order; lines: Line[]; onClose: () => void; onDone: () => void }) {
  const wh = useAsync(() => api.get<Array<{ id: string; code: string; name: string | null }>>('/api/warehouses'), []);
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, qty(l.qty_m - l.issued_qty_m)])));
  const save = useAction(async () => {
    const out = lines.map((l) => ({ line_id: l.id, item_id: l.item_id!, qty_m: Math.round(Number((amounts[l.id] ?? '0').replace(',', '.')) * 1000) })).filter((x) => x.qty_m > 0);
    await api.post(`/api/work-orders/${order.id}/issue`, { warehouse_id: wh.data![0].id, lines: out });
    onDone();
  });
  return (
    <Dialog title="Xuất phụ tùng cho lệnh" onClose={onClose} footer={<>
      <ErrorNote error={save.error ?? wh.error} />
      <button className="btn btn-primary" disabled={!wh.data?.length || save.busy} onClick={() => save.run()}>{save.busy ? 'Đang xuất…' : 'Xuất kho'}</button>
    </>}>
      <p className="fine">Giá vốn tự tính theo bình quân của kho {wh.data?.[0]?.code ?? ''}.</p>
      {lines.map((l) => (
        <label key={l.id} className="field field-inline">
          <span>{l.description}<small>Còn {qty(l.qty_m - l.issued_qty_m)} chưa xuất</small></span>
          <input inputMode="decimal" value={amounts[l.id]} onChange={(e) => setAmounts({ ...amounts, [l.id]: e.target.value })} />
        </label>
      ))}
    </Dialog>
  );
}

// ---------------------------------------------------------------- thu tiền QR
function QrDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const intent = useAsync(() => api.post<Intent>(`/api/work-orders/${order.id}/payment-intents`), [order.id]);
  const [paid, setPaid] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sim = useAction(async () => { await api.post('/dev/simulate-bank', { intent_id: intent.data!.intent_id }); });

  useEffect(() => {
    const t = setInterval(async () => {
      setNow(Date.now());
      try {
        const o = await api.get<Order>(`/api/work-orders/${order.id}`);
        if (o.paid_vnd > order.paid_vnd) setPaid(true);
      } catch { /* thử lại ở lượt sau */ }
    }, 3000);
    return () => clearInterval(t);
  }, [order.id, order.paid_vnd]);

  const left = intent.data ? Math.max(0, intent.data.expires_at - now) : 0;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <Dialog title="Thu tiền bằng chuyển khoản" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>{paid ? 'Xong' : 'Đóng'}</button>}>
      <ErrorNote error={intent.error} />
      {paid ? (
        <div className="paid-ok" role="status">Đã nhận tiền. Lệnh được cập nhật.</div>
      ) : intent.data && (
        <div className="qr">
          <p className="qr-amount">{vnd(intent.data.amount_vnd)}</p>
          <p className="qr-label">Nội dung chuyển khoản</p>
          <p className="qr-ref">{intent.data.transfer_ref}</p>
          <p className="fine">{left > 0 ? `Mã còn hiệu lực ${mmss}.` : 'Mã đã hết hạn, đóng lại và tạo mã mới.'} Ảnh VietQR sẽ hiện ở đây khi nối tài khoản ngân hàng của gara. Màn hình tự cập nhật khi ngân hàng báo tiền về.</p>
          {devUser.get() && left > 0 && (
            <button className="btn" disabled={sim.busy} onClick={() => sim.run()}>Giả lập ngân hàng báo tiền về</button>
          )}
          {sim.error ? <p className="note note-error">{errorText(sim.error)}</p> : null}
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- báo chờ
function HoldDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('parts');
  const [note, setNote] = useState('');
  const save = useAction(async () => { await api.post(`/api/work-orders/${id}/holds`, { reason, note: note || undefined }); onDone(); });
  return (
    <Dialog title="Báo chờ" onClose={onClose} footer={<><ErrorNote error={save.error} /><button className="btn btn-primary" disabled={save.busy} onClick={() => save.run()}>Bắt đầu chờ</button></>}>
      <div className="seg seg-wrap" role="radiogroup" aria-label="Lý do chờ">
        {Object.entries(HOLD_LABEL).map(([k, v]) => (
          <button key={k} role="radio" aria-checked={reason === k} className={reason === k ? 'is-on' : ''} onClick={() => setReason(k)}>{v}</button>
        ))}
      </div>
      <label className="field"><span>Ghi chú</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: nhà cung cấp hẹn giao 15:00" /></label>
    </Dialog>
  );
}

// ---------------------------------------------------------------- hủy lệnh
const CANCEL_REASONS = [
  ['CUSTOMER_WITHDREW', 'Khách không sửa nữa'], ['WRONG_ENTRY', 'Tạo nhầm lệnh'], ['DUPLICATE', 'Trùng lệnh khác'], ['OTHER', 'Lý do khác'],
];
function CancelDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('CUSTOMER_WITHDREW');
  const [reason, setReason] = useState('');
  const [paidAction, setPaidAction] = useState<'refund' | 'advance' | null>(null);
  const save = useAction(async () => {
    await api.post(`/api/work-orders/${order.id}/cancel`, { expected_version: order.version, paid_action: paidAction, reason_code: code, reason: reason.trim() });
    onDone();
  });
  const ready = reason.trim().length >= 3 && (order.paid_vnd === 0 || paidAction !== null);
  return (
    <Dialog title={`Hủy lệnh ${order.order_no ?? ''}`} onClose={onClose} footer={<>
      <ErrorNote error={save.error} />
      <button className="btn btn-danger-solid" disabled={!ready || save.busy} onClick={() => save.run()}>Hủy lệnh</button>
    </>}>
      <p className="fine">Lệnh không bị xóa. Phụ tùng đã xuất được nhập lại kho theo giá vốn lúc xuất.</p>
      <label className="field"><span>Lý do</span>
        <select value={code} onChange={(e) => setCode(e.target.value)}>{CANCEL_REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="field"><span>Giải thích thêm (bắt buộc)</span><input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {order.paid_vnd > 0 && (
        <fieldset className="field">
          <legend>Khách đã trả {vnd(order.paid_vnd)}. Xử lý số tiền này:</legend>
          <label className="radio"><input type="radio" name="pa" checked={paidAction === 'refund'} onChange={() => setPaidAction('refund')} /> Hoàn lại tiền mặt cho khách</label>
          <label className="radio"><input type="radio" name="pa" checked={paidAction === 'advance'} onChange={() => setPaidAction('advance')} /> Giữ làm tiền khách trả trước</label>
        </fieldset>
      )}
    </Dialog>
  );
}

function ReopenDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const save = useAction(async () => { await api.post(`/api/work-orders/${id}/reopen`, { reason: reason.trim() }); onDone(); });
  return (
    <Dialog title="Mở lại lệnh đã khóa" onClose={onClose} footer={<><ErrorNote error={save.error} /><button className="btn btn-primary" disabled={reason.trim().length < 3 || save.busy} onClick={() => save.run()}>Mở lại lệnh</button></>}>
      <p className="fine">Mỗi lần mở lại được ghi vào nhật ký kèm lý do.</p>
      <label className="field"><span>Lý do mở lại</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: nhập sai giá phụ tùng" autoFocus /></label>
    </Dialog>
  );
}
