import { useEffect, useState } from 'react';
import { api, getToken, fileUrl } from '../api.js';
import { Card, Btn, ErrorLine, inputCls } from '../ui.jsx';

export default function Invoices() {
  const [list, setList] = useState([]);
  const [won, setWon] = useState([]);
  const [form, setForm] = useState({ lead_id: '', due_date: '', description: 'Annual licence', quantity: 1, unit_price: 85 });
  const [error, setError] = useState(''); const [msg, setMsg] = useState('');
  const load = () => { api('/api/invoices').then(setList); api('/api/leads?stage=Won').then(setWon); };
  useEffect(load, []);
  const run = async (fn, ok) => { setError(''); setMsg(''); try { const r = await fn(); setMsg(ok(r)); load(); } catch (e) { setError(e.message); } };

  async function openPdf(id) {
    const res = await fetch(fileUrl(`/api/invoices/${id}/pdf`), { headers: { Authorization: `Bearer ${getToken()}` } });
    window.open(URL.createObjectURL(await res.blob()), '_blank');
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
      <ErrorLine error={error} />{msg && <p className="text-sm text-green-700">{msg}</p>}
      <Card title="New invoice (won clients)">
        <div className="grid grid-cols-6 gap-2">
          <select className={`${inputCls} col-span-2`} value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}>
            <option value="">Choose client</option>{won.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}</select>
          <input type="date" className={inputCls} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input type="number" className={inputCls} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <input type="number" className={inputCls} value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
        </div>
        <Btn className="mt-2" disabled={!form.lead_id || !form.due_date} onClick={() => run(() => api('/api/invoices', { method: 'POST', body: {
          lead_id: Number(form.lead_id), due_date: form.due_date,
          items: [{ description: form.description, quantity: Number(form.quantity), unit_price: Number(form.unit_price) }] } }), (r) => `Created ${r.number}`)}>Create invoice</Btn>
      </Card>
      <Card title="All invoices" right={<Btn kind="secondary" onClick={() => run(() => api('/api/invoices/send-reminders', { method: 'POST' }), (r) => `${r.reminders_sent} payment reminder(s) sent`)}>Remind overdue clients</Btn>}>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-2">Number</th><th>Client</th><th>Due</th><th>Total</th><th>Status</th><th /></tr></thead>
          <tbody>{list.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="py-2">{i.number}</td><td>{i.company}</td><td>{String(i.due_date).slice(0, 10)}</td>
              <td>{i.currency} {Number(i.total).toFixed(2)}</td>
              <td className={i.overdue ? 'font-semibold text-red-600' : i.status === 'paid' ? 'text-green-700' : ''}>{i.overdue ? 'overdue' : i.status}</td>
              <td className="space-x-1 text-right">
                <Btn kind="secondary" onClick={() => openPdf(i.id)}>PDF</Btn>
                <Btn kind="secondary" onClick={() => run(() => api(`/api/invoices/${i.id}/send`, { method: 'POST' }), (r) => `Emailed to ${r.sent_to}`)}>Email</Btn>
                {i.status === 'unpaid' && <Btn kind="secondary" onClick={() => run(() => api(`/api/invoices/${i.id}/paid`, { method: 'POST' }), () => 'Marked paid')}>Mark paid</Btn>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}
