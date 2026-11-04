import { useState } from 'react';
import { api, type Vehicle } from '../api';
import { Plate, useAsync, ErrorNote, useAction } from '../ui/kit';
import { go } from '../App';

// Tiếp nhận xe: tìm theo biển số; chưa có thì thêm xe rồi tạo lệnh.
export function NewOrder() {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [car, setCar] = useState({ make: '', model: '', model_year: '' });
  const found = useAsync(() => (q.replace(/\W/g, '').length >= 2 ? api.get<Vehicle[]>(`/api/vehicles?q=${encodeURIComponent(q)}`) : Promise.resolve([])), [q]);

  const open = useAction(async (vehicleId: string) => {
    const r = await api.post<{ id: string }>('/api/work-orders', { vehicle_id: vehicleId });
    go(`/orders/${r.id}`);
  });
  const addCar = useAction(async () => {
    const v = await api.post<Vehicle>('/api/vehicles', {
      plate: q.trim(), make: car.make || undefined, model: car.model || undefined,
      model_year: car.model_year ? Number(car.model_year) : undefined,
    });
    const r = await api.post<{ id: string }>('/api/work-orders', { vehicle_id: v.id });
    go(`/orders/${r.id}`);
  });

  return (
    <section className="new-order">
      <div className="page-head"><h1>Tiếp nhận xe</h1></div>
      <label className="field field-plate">
        <span>Biển số xe</span>
        <input value={q} onChange={(e) => { setQ(e.target.value.toUpperCase()); setAdding(false); }} placeholder="51H-123.45" autoFocus autoComplete="off" />
      </label>
      <ErrorNote error={open.error ?? addCar.error ?? found.error} />
      <ul className="vehicles">
        {(found.data ?? []).map((v) => (
          <li key={v.id}>
            <button className="vehicle" disabled={open.busy} onClick={() => open.run(v.id)}>
              <Plate value={v.plate} />
              <span className="vehicle-car">{[v.make, v.model, v.model_year].filter(Boolean).join(' ') || 'Chưa rõ dòng xe'}</span>
              <span className="vehicle-go">Tạo lệnh</span>
            </button>
          </li>
        ))}
      </ul>
      {q.replace(/\W/g, '').length >= 5 && !found.loading && (found.data?.length ?? 0) === 0 && !adding && (
        <div className="empty">
          <p>Chưa có xe biển <strong>{q}</strong>.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>Thêm xe mới</button>
        </div>
      )}
      {adding && (
        <div className="panel add-car">
          <h2>Xe mới <Plate value={q} size="sm" /></h2>
          <div className="field-row">
            <label className="field"><span>Hãng</span><input value={car.make} onChange={(e) => setCar({ ...car, make: e.target.value })} placeholder="Toyota" /></label>
            <label className="field"><span>Dòng xe</span><input value={car.model} onChange={(e) => setCar({ ...car, model: e.target.value })} placeholder="Vios" /></label>
            <label className="field"><span>Năm</span><input inputMode="numeric" value={car.model_year} onChange={(e) => setCar({ ...car, model_year: e.target.value })} placeholder="2020" /></label>
          </div>
          <button className="btn btn-primary" disabled={addCar.busy} onClick={() => addCar.run()}>Thêm xe và tạo lệnh</button>
        </div>
      )}
    </section>
  );
}
