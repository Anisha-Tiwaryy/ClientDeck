import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card } from '../ui.jsx';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/api/reports/summary').then(setS); }, []);
  if (!s) return <p className="text-slate-500">Loading...</p>;
  const top = s.funnel[0]?.reached || 1;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Pipeline dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Win rate', s.win_rate_pct == null ? '-' : `${s.win_rate_pct}%`], ['Demos booked', Object.values(s.demos).reduce((a, b) => a + b, 0)],
          ['Follow-ups overdue', `${s.tasks.overdue} of ${s.tasks.open}`], ['Unpaid invoices', money(s.invoices.outstanding)]].map(([k, v]) => (
          <Card key={k}><div className="text-xs uppercase text-slate-500">{k}</div><div className="text-2xl font-bold text-slate-800">{v}</div></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funnel (leads that reached each stage)">
          {s.funnel.map((f) => (
            <div key={f.stage} className="mb-2 text-sm">
              <div className="flex justify-between"><span>{f.stage}</span>
                <span className="text-slate-500">{f.reached}{f.conversion_from_previous_pct != null && ` (${f.conversion_from_previous_pct}% of previous)`}</span></div>
              <div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-blue-700" style={{ width: `${(100 * f.reached) / top}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card title="Channels">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th>Channel</th><th>Touches</th><th>Responses</th><th>Response rate</th><th>Positive</th></tr></thead>
            <tbody>{s.channels.map((c) => (
              <tr key={c.channel} className="border-t"><td className="py-1">{c.channel}</td><td>{c.touches}</td><td>{c.responses}</td><td>{c.response_rate_pct}%</td><td>{c.positive}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Territories">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th>Territory</th><th>Leads</th><th>Hot</th><th>Late pipeline</th><th>Won</th></tr></thead>
            <tbody>{s.territories.map((t) => (
              <tr key={t.territory} className="border-t"><td className="py-1">{t.territory}</td><td>{t.leads}</td><td>{t.hot}</td><td>{t.in_late_pipeline}</td><td>{t.won}</td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Why we lose (feedback for the team)">
          <ul className="text-sm">{s.lost_reasons.map((l) => <li key={l.lost_reason} className="flex justify-between border-t py-1"><span>{l.lost_reason}</span><span>{l.n}</span></li>)}</ul>
          {!s.lost_reasons.length && <p className="text-sm text-slate-500">No lost deals yet.</p>}
        </Card>
      </div>
    </div>
  );
}
