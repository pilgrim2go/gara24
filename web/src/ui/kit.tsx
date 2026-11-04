import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorText } from '../api';

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
