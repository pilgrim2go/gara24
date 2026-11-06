import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorText, outcomeUnknown } from '../api';

// Biển số vẽ như tấm biển thật: nền trắng, viền đen, chữ hẹp. Là điểm nhận diện của cả ứng dụng.
export function Plate({ value, size = 'md' }: { value: string | null; size?: 'sm' | 'md' | 'lg' }) {
  return <span className={`plate plate-${size}`} aria-label={`Biển số ${value ?? 'chưa có'}`}>{value ?? '—'}</span>;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fnRef.current());
      setError(undefined);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, error, loading, reload, setData };
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="note note-error" role="alert">
      <span>{errorText(error)}</span>
      {onRetry && <button className="btn btn-quiet" onClick={onRetry}>Tải lại</button>}
    </div>
  );
}

export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dlg-title">
      <header className="dialog-head">
        <h2 id="dlg-title">{title}</h2>
        <button className="btn btn-quiet" onClick={onClose} aria-label="Đóng">Đóng</button>
      </header>
      <div className="dialog-body">{children}</div>
      <footer className="dialog-foot">{footer}</footer>
    </dialog>
  );
}

// Chạy một thao tác ghi, giữ trạng thái đang gửi và lỗi cho nút bấm
export function useAction<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const run = async (...a: A) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn(...a);
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, setError };
}

// Thao tác ghi tiền/kho: một khóa chống trùng cho một lần "ý định".
// - Thành công: trả kết quả, đổi khóa cho lần sau.
// - Bị từ chối hẳn (4xx/409): đổi khóa, người dùng sửa rồi gửi lại như lần mới.
// - Chưa rõ kết quả (mất mạng, 5xx): GIỮ khóa và bật `uncertain` để màn hình khóa ô nhập.
//   Bấm thử lại gửi đúng khóa cũ: nếu lần trước đã ghi, máy chủ trả lại đúng phiếu cũ, không ghi lần hai.
export function useSubmitOnce<A extends unknown[], R>(fn: (key: string, ...a: A) => Promise<R>) {
  const key = useRef(crypto.randomUUID());
  const inflight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [uncertain, setUncertain] = useState(false);
  const run = async (...a: A): Promise<R | undefined> => {
    if (inflight.current) return undefined;   // chặn bấm hai lần trước khi React kịp vẽ lại nút
    inflight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const r = await fn(key.current, ...a);
      key.current = crypto.randomUUID();
      setUncertain(false);
      return r;
    } catch (e) {
      setError(e);
      const unknown = outcomeUnknown(e);
      if (!unknown) key.current = crypto.randomUUID();
      setUncertain(unknown);
      return undefined;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error, uncertain, key: () => key.current };
}

// Tiền nhập vào: chỉ lấy chữ số, hiển thị có dấu chấm ngăn nghìn (1.250.000). null khi ô trống.
const VND_FMT = new Intl.NumberFormat('vi-VN');
export const parseVnd = (s: string): number | null => {
  const d = s.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return d === '' ? null : Number(d.slice(0, 13));
};
// Số lượng: tối đa 3 chữ số thập phân, dấu phẩy hoặc chấm. Trả phần nghìn (_m), null khi sai dạng.
export const parseQtyM = (s: string): number | null => {
  const t = s.trim();
  if (!/^\d+([.,]\d{1,3})?$/.test(t)) return null;
  return Math.round(Number(t.replace(',', '.')) * 1000);
};

// compact: dùng trong ô bảng, nhãn chỉ cho trình đọc màn hình
export function MoneyInput({ value, onChange, label, hint, disabled, autoFocus, compact }: {
  value: number | null; onChange: (v: number | null) => void; label: string; hint?: ReactNode; disabled?: boolean; autoFocus?: boolean; compact?: boolean;
}) {
  return (
    <label className={compact ? 'cell-money' : 'field field-money'}>
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
      <input className={compact ? 'cell-in' : undefined} inputMode="numeric" autoComplete="off" disabled={disabled} autoFocus={autoFocus}
        value={value === null ? '' : VND_FMT.format(value)} onChange={(e) => onChange(parseVnd(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
