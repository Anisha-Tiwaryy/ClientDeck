import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Tier, STAGES, Btn, baseInput } from '../ui.jsx';

export default function Pipeline() {
  const [leads, setLeads] = useState([]);
  const [filter, setFilter] = useState({ territory: '', tier: '', q: '' });
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v)).toString();
    api(`/api/leads${qs ? `?${qs}` : ''}`).then(setLeads);
  }, [filter]);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-4 text-2xl font-bold text-slate-800">Pipeline</h1>
        <input className={`${baseInput} w-56`} placeholder="Search company or contact" value={filter.q} onChange={set('q')} />
        <select className={`${baseInput} w-40`} value={filter.territory} onChange={set('territory')}>
          <option value="">All territories</option><option>North America</option><option>Europe</option><option>APAC</option>
        </select>
        <select className={`${baseInput} w-32`} value={filter.tier} onChange={set('tier')}>
          <option value="">All tiers</option><option>Hot</option><option>Warm</option><option>Cold</option>
        </select>
        <Link to="/leads/new" className="ml-auto"><Btn>Add lead</Btn></Link>
      </div>
      <div className="grid grid-cols-4 gap-3 xl:grid-cols-8">
        {STAGES.map((st) => {
          const col = leads.filter((l) => l.stage === st);
          return (
            <div key={st} className="rounded-lg bg-slate-100 p-2">
              <div className="mb-2 flex justify-between text-xs font-semibold uppercase text-slate-500"><span>{st}</span><span>{col.length}</span></div>
              <div className="space-y-2">
                {col.map((l) => (
                  <Link key={l.id} to={`/leads/${l.id}`} className="block rounded border border-slate-200 bg-white p-2 text-xs shadow-sm hover:border-blue-400">
                    <div className="font-semibold text-slate-800">{l.company}</div>
                    <div className="text-slate-500">{l.contact_name}</div>
                    <div className="mt-1 flex items-center justify-between"><Tier tier={l.tier} /><span className="text-slate-400">{l.score}</span></div>
                    <div className="mt-1 text-slate-400">{l.territory}</div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
