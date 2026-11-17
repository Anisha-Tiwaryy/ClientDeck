import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Tier, Btn, ErrorLine, STAGES, fmtDate, inputCls, baseInput } from '../ui.jsx';

const OUTCOMES = ['Connected', 'No answer', 'Voicemail', 'Sent', 'Replied - interested', 'Replied - not now', 'Replied - not interested'];

export default function LeadDetail() {
  const { id } = useParams();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [act, setAct] = useState({ channel: 'Call', outcome: 'Connected', notes: '' });
  const [demo, setDemo] = useState({ starts_at: '', meeting_url: 'https://zoom.us/j/' });
  const [lost, setLost] = useState('');
  const load = () => api(`/api/leads/${id}`).then(setLead).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const run = async (fn, ok) => { setError(''); setMsg(''); try { const r = await fn(); if (ok) setMsg(ok(r)); load(); } catch (e) { setError(e.message); } };
  if (!lead) return <p className="text-slate-500">{error || 'Loading...'}</p>;
  const q = lead.qualification;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{lead.company}</h1><Tier tier={lead.tier} />
        <span className="text-sm text-slate-500">{lead.contact_name}, {lead.contact_title} | {lead.territory} | {lead.stage}</span>
        <div className="ml-auto flex items-center gap-2">
          <select className={`${baseInput} w-44`} value={lead.stage}
            onChange={(e) => e.target.value !== 'Lost' && run(() => api(`/api/leads/${id}/stage`, { method: 'POST', body: { stage: e.target.value } }))}>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <ErrorLine error={error} />{msg && <p className="text-sm text-green-700">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Qualification: ${lead.score}/100`}>
          <ul className="space-y-1 text-sm text-slate-700">{q.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <div className="mt-3 text-sm"><span className="font-medium">Pain points:</span> {lead.pain_points.join(', ') || 'none recorded'}</div>
          {lead.needs_notes && <p className="mt-2 text-sm text-slate-600">{lead.needs_notes}</p>}
        </Card>
        <Card title="Contact and calling window">
          <p className="text-sm">{lead.email}<br />{lead.phone}</p>
          {lead.linkedin_url && <a className="text-sm text-blue-700" href={lead.linkedin_url} target="_blank" rel="noreferrer">LinkedIn profile</a>}
          <p className="mt-2 text-sm">Local {lead.call_window.local}<br /><span className="font-medium">{lead.call_window.ist}</span>
            {lead.call_window.callable_now && <span className="ml-2 text-green-700">(callable now)</span>}</p>
        </Card>
        <Card title="Close as lost">
          <input className={inputCls} placeholder="Reason (e.g. chose a competitor)" value={lost} onChange={(e) => setLost(e.target.value)} />
          <Btn kind="secondary" className="mt-2" disabled={lost.length < 3}
            onClick={() => run(() => api(`/api/leads/${id}/stage`, { method: 'POST', body: { stage: 'Lost', lost_reason: lost } }), () => 'Marked as lost')}>Mark lost</Btn>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Cadence (${lead.cadence_status})`} right={
          <Btn onClick={() => run(() => api(`/api/leads/${id}/cadence/start`, { method: 'POST' }), (r) => `Started ${r.tier} cadence: ${r.steps.length} steps`)}>
            {lead.cadence_status === 'none' ? 'Start cadence' : 'Restart'}</Btn>}>
          <ol className="space-y-1 text-sm">
            {lead.tasks.map((t) => (
              <li key={t.id} className={t.status !== 'open' ? 'text-slate-400 line-through' : ''}>
                {t.step}. <span className="font-medium">{t.channel}</span>: {t.purpose} <span className="text-slate-500">({fmtDate(t.due_at)})</span>
              </li>
            ))}
            {!lead.tasks.length && <li className="text-slate-500">No cadence yet.</li>}
          </ol>
        </Card>
        <Card title="Log a touch">
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={act.channel} onChange={(e) => setAct({ ...act, channel: e.target.value })}>
              {['Call', 'Email', 'LinkedIn', 'Note'].map((c) => <option key={c}>{c}</option>)}</select>
            <select className={inputCls} value={act.outcome} onChange={(e) => setAct({ ...act, outcome: e.target.value })}>
              {(act.channel === 'Note' ? ['Note'] : OUTCOMES).map((o) => <option key={o}>{o}</option>)}</select>
          </div>
          <textarea className={`${inputCls} mt-2`} rows={2} placeholder="Notes: needs, objections, next step" value={act.notes} onChange={(e) => setAct({ ...act, notes: e.target.value })} />
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn onClick={() => run(() => api(`/api/leads/${id}/activities`, { method: 'POST', body: { ...act, outcome: act.channel === 'Note' ? 'Note' : act.outcome } }),
              (r) => (r.completed_step ? `Logged; step ${r.completed_step} done` : r.cadence ? `Logged; cadence ${r.cadence}` : 'Logged'))}>Log</Btn>
            {['first-touch', 'follow-up'].map((t) => (
              <Btn key={t} kind="secondary" onClick={() => run(() => api(`/api/leads/${id}/emails`, { method: 'POST', body: { template: t } }), (r) => `Email sent: ${r.subject}`)}>Send {t} email</Btn>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Book a Zoom demo">
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" className={inputCls} value={demo.starts_at} onChange={(e) => setDemo({ ...demo, starts_at: e.target.value })} />
            <input className={inputCls} value={demo.meeting_url} onChange={(e) => setDemo({ ...demo, meeting_url: e.target.value })} />
          </div>
          <Btn className="mt-2" disabled={!demo.starts_at} onClick={() => run(() => api(`/api/leads/${id}/demos`, {
            method: 'POST', body: { starts_at: new Date(demo.starts_at).toISOString(), meeting_url: demo.meeting_url } }),
          (r) => `Demo booked: ${r.local_time} their time, ${r.ist_time} IST. Invite emailed.`)}>Book and send invite</Btn>
          <ul className="mt-3 space-y-1 text-sm">
            {lead.demos.map((d) => (
              <li key={d.id}>{fmtDate(d.starts_at)}: <span className="font-medium">{d.status}</span>
                {d.status === 'scheduled' && <Btn kind="secondary" className="ml-2" onClick={() => run(() => api(`/api/demos/${d.id}`, { method: 'PATCH', body: { status: 'held' } }))}>Mark held</Btn>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Activity history">
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {lead.activities.map((a) => (
              <li key={a.id} className="border-b pb-1"><span className="font-medium">{a.channel}</span>: {a.outcome}
                <span className="text-slate-400"> {fmtDate(a.occurred_at)}</span>{a.notes && <div className="text-slate-600">{a.notes}</div>}</li>
            ))}
            {!lead.activities.length && <li className="text-slate-500">No touches yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
