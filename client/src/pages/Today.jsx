import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Card, Tier, Btn, ErrorLine } from '../ui.jsx';

const CHANNEL_ICON = { Call: 'Call', Email: 'Email', LinkedIn: 'LinkedIn', 'Zoom demo': 'Demo' };

export default function Today() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/api/tasks/today').then(setTasks).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function done(t, outcome) {
    try { await api(`/api/leads/${t.lead_id}/activities`, { method: 'POST', body: { channel: t.channel, outcome } }); load(); }
    catch (e) { setError(e.message); }
  }
  async function skip(t) { await api(`/api/tasks/${t.id}/skip`, { method: 'POST' }); load(); }

  if (!tasks) return <p className="text-slate-500">Loading...</p>;
  const overdue = tasks.filter((t) => t.overdue).length;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Today's follow-ups</h1>
          <p className="text-sm text-slate-500">{tasks.length} touches due, {overdue} overdue. Hot leads first; calls show the lead's calling window in IST.</p>
        </div>
        <Link to="/leads/new"><Btn>Add lead</Btn></Link>
      </div>
      <ErrorLine error={error} />
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Lead</th><th>Tier</th><th>Step</th><th>What to do</th><th>Due (IST)</th><th>Call window</th><th /></tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t align-top">
                <td className="py-2"><Link className="font-medium text-blue-700" to={`/leads/${t.lead_id}`}>{t.company}</Link><div className="text-xs text-slate-500">{t.contact_name}</div></td>
                <td><Tier tier={t.tier} /></td>
                <td>{t.step}. {CHANNEL_ICON[t.channel]}</td>
                <td className="max-w-xs text-slate-700">{t.purpose}</td>
                <td className={t.overdue ? 'font-semibold text-red-600' : ''}>{t.due_ist}{t.overdue && ' (overdue)'}</td>
                <td>{t.call_window_ist ? <span className={t.callable_now ? 'text-green-700' : 'text-slate-500'}>{t.call_window_ist}{t.callable_now ? ' (now)' : ''}</span> : '-'}</td>
                <td className="space-x-1 whitespace-nowrap text-right">
                  {t.channel === 'Call'
                    ? <><Btn kind="secondary" onClick={() => done(t, 'Connected')}>Connected</Btn><Btn kind="secondary" onClick={() => done(t, 'No answer')}>No answer</Btn></>
                    : <Btn kind="secondary" onClick={() => done(t, 'Sent')}>Mark sent</Btn>}
                  <Btn kind="secondary" onClick={() => skip(t)}>Skip</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.length && <p className="py-6 text-center text-slate-500">Nothing due. Start a cadence from a lead's page.</p>}
      </Card>
    </div>
  );
}
