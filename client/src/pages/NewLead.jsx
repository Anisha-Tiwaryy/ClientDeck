import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Btn, ErrorLine, inputCls } from '../ui.jsx';

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto',
  'Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Europe/Paris', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
const PAINS = ['Duplicate candidate records', 'No view of the client pipeline', 'Manual follow-ups', 'Slow reporting',
  'Expensive licences', 'Hard to share CVs with clients', 'Job board posting takes too long'];

export default function NewLead() {
  const nav = useNavigate();
  const [f, setF] = useState({ company: '', contact_name: '', contact_title: '', email: '', phone: '', territory: 'North America',
    timezone: 'America/New_York', source: 'outbound', team_size: '', current_tool: 'Spreadsheets', pain_points: [],
    is_decision_maker: false, budget_confirmed: false, timeline_months: '', needs_notes: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const togglePain = (p) => setF({ ...f, pain_points: f.pain_points.includes(p) ? f.pain_points.filter((x) => x !== p) : [...f.pain_points, p] });

  async function submit(e) {
    e.preventDefault(); setError('');
    const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
    if (body.team_size) body.team_size = Number(body.team_size);
    if (body.timeline_months) body.timeline_months = Number(body.timeline_months);
    try { const lead = await api('/api/leads', { method: 'POST', body }); nav(`/leads/${lead.id}`); }
    catch (err) { setError(err.message); }
  }
  const field = (label, k, props = {}) => (
    <label className="block text-sm"><span className="text-slate-600">{label}</span><input className={inputCls} value={f[k]} onChange={set(k)} {...props} /></label>
  );
  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Add a lead</h1>
      <Card title="Contact">
        <div className="grid grid-cols-2 gap-3">
          {field('Company', 'company', { required: true })}{field('Contact name', 'contact_name', { required: true })}
          {field('Title', 'contact_title')}{field('Email', 'email', { type: 'email' })}{field('Phone', 'phone')}
          <label className="block text-sm"><span className="text-slate-600">Territory</span>
            <select className={inputCls} value={f.territory} onChange={set('territory')}><option>North America</option><option>Europe</option><option>APAC</option></select></label>
          <label className="block text-sm"><span className="text-slate-600">Time zone</span>
            <select className={inputCls} value={f.timezone} onChange={set('timezone')}>{ZONES.map((z) => <option key={z}>{z}</option>)}</select></label>
          <label className="block text-sm"><span className="text-slate-600">Source</span>
            <select className={inputCls} value={f.source} onChange={set('source')}>{['outbound', 'inbound', 'referral', 'event'].map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
      </Card>
      <Card title="Qualification (needs, authority, budget, timeline)">
        <div className="grid grid-cols-3 gap-3">
          {field('Recruiters at the agency', 'team_size', { type: 'number', min: 1 })}
          {field('Current tool', 'current_tool')}
          {field('Plans to switch within (months)', 'timeline_months', { type: 'number', min: 0 })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PAINS.map((p) => (
            <button type="button" key={p} onClick={() => togglePain(p)}
              className={`rounded-full border px-3 py-1 text-xs ${f.pain_points.includes(p) ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-600'}`}>{p}</button>
          ))}
        </div>
        <div className="mt-3 flex gap-6 text-sm">
          <label><input type="checkbox" checked={f.is_decision_maker} onChange={set('is_decision_maker')} /> Talking to the decision maker</label>
          <label><input type="checkbox" checked={f.budget_confirmed} onChange={set('budget_confirmed')} /> Budget confirmed</label>
        </div>
        <textarea className={`${inputCls} mt-3`} rows={3} placeholder="Needs and notes from discovery" value={f.needs_notes} onChange={set('needs_notes')} />
      </Card>
      <ErrorLine error={error} />
      <Btn>Save lead</Btn>
    </form>
  );
}
