import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.DATABASE_URL ||= 'postgres://postgres@localhost:5432/clientdeck_test';
const { migrate, pool, query } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { callWindow } = await import('../src/services/time.js');

const app = createApp();
let rep, rep2, mgr;
const api = (tok) => ({
  get: (u) => request(app).get(u).set('Authorization', `Bearer ${tok}`),
  post: (u, b) => request(app).post(u).set('Authorization', `Bearer ${tok}`).send(b),
  patch: (u, b) => request(app).patch(u).set('Authorization', `Bearer ${tok}`).send(b),
});
const HOT = {
  company: 'Northstar Talent', contact_name: 'Priya Shah', contact_title: 'Founder', email: 'priya@northstar.example',
  timezone: 'America/New_York', territory: 'North America', team_size: 12, current_tool: 'Spreadsheets',
  pain_points: ['Duplicate candidates', 'No client pipeline view', 'Manual follow-ups'],
  is_decision_maker: true, budget_confirmed: true, timeline_months: 1,
};
const WARM = { company: 'Harbour Search', contact_name: 'Tom Reed', email: 'tom@harbour.example', timezone: 'Europe/London',
  territory: 'Europe', team_size: 30, current_tool: 'Bullhorn', pain_points: ['Slow reporting', 'Expensive licences'], timeline_months: 3 };

before(async () => {
  await migrate();
  const reg = async (name, email, role) => (await request(app).post('/api/auth/register').send({ name, email, password: 'password123', role })).body;
  rep = (await reg('Asha Rep', 'asha@clientdeck.test', 'rep')).token;
  rep2 = (await reg('Ravi Rep', 'ravi@clientdeck.test', 'rep')).token;
  mgr = (await reg('Meera Manager', 'meera@clientdeck.test', 'manager')).token;
});
after(() => pool.end());

test('auth: wrong password and missing token are rejected', async () => {
  assert.equal((await request(app).post('/api/auth/login').send({ email: 'asha@clientdeck.test', password: 'nope' })).status, 401);
  assert.equal((await request(app).get('/api/leads')).status, 401);
  const ok = await request(app).post('/api/auth/login').send({ email: 'asha@clientdeck.test', password: 'password123' });
  assert.equal(ok.status, 200); assert.ok(ok.body.token);
});

test('qualification scores and tiers leads, with reasons', async () => {
  const hot = (await api(rep).post('/api/leads', HOT)).body;
  assert.equal(hot.score, 100); assert.equal(hot.tier, 'Hot');
  assert.equal(hot.qualification.reasons.length, 5);
  const warm = (await api(rep).post('/api/leads', WARM)).body;
  assert.equal(warm.score, 20 + 12 + 6); assert.equal(warm.tier, 'Cold');
  const upd = (await api(rep).patch(`/api/leads/${warm.id}`, { is_decision_maker: true })).body;
  assert.equal(upd.score, 58); assert.equal(upd.tier, 'Warm');
  const bad = await api(rep).post('/api/leads', { ...WARM, timezone: 'Mars/Olympus' });
  assert.equal(bad.status, 400);
});

test('reps only see their own leads; managers see all', async () => {
  const lead = (await api(rep).post('/api/leads', { ...HOT, company: 'Private Co' })).body;
  assert.equal((await api(rep2).get(`/api/leads/${lead.id}`)).status, 404);
  assert.equal((await api(mgr).get(`/api/leads/${lead.id}`)).status, 200);
  const list = (await api(rep2).get('/api/leads')).body;
  assert.equal(list.length, 0);
});

test('call windows convert to IST and handle daylight saving', () => {
  assert.equal(callWindow(new Date('2026-01-15T12:00:00Z'), 'America/New_York').ist, '20:30-03:30 IST');
  assert.equal(callWindow(new Date('2026-07-15T12:00:00Z'), 'America/New_York').ist, '19:30-02:30 IST');
  assert.equal(callWindow(new Date('2026-01-15T12:00:00Z'), 'Europe/London').ist, '15:30-22:30 IST');
  assert.equal(callWindow(new Date('2026-07-15T12:00:00Z'), 'America/Los_Angeles').ist, '22:30-05:30 IST');
});

test('cadence: dated multi-channel steps, completed by logging activities, stopped by a reply', async () => {
  const lead = (await api(rep).post('/api/leads', { ...HOT, company: 'Cadence Co' })).body;
  const start = (await api(rep).post(`/api/leads/${lead.id}/cadence/start`)).body;
  assert.deepEqual(start.steps.map((s) => s.channel), ['Call', 'Email', 'LinkedIn', 'Call', 'Email']);
  for (const s of start.steps) {
    const d = new Date(s.due_at);
    const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d);
    const wd = local.find((p) => p.type === 'weekday').value; const h = Number(local.find((p) => p.type === 'hour').value);
    assert.ok(!['Sat', 'Sun'].includes(wd), 'no weekend tasks');
    assert.equal(h, s.channel === 'Call' ? 10 : 9);
  }
  const call = (await api(rep).post(`/api/leads/${lead.id}/activities`, { channel: 'Call', outcome: 'No answer' })).body;
  assert.equal(call.completed_step, 1); assert.equal(call.stage, 'Contacted');
  const li = (await api(rep).post(`/api/leads/${lead.id}/activities`, { channel: 'LinkedIn', outcome: 'Sent' })).body;
  assert.equal(li.completed_step, 3, 'completes the first open step on that channel');
  const reply = (await api(rep).post(`/api/leads/${lead.id}/activities`, { channel: 'Email', outcome: 'Replied - interested' })).body;
  assert.equal(reply.cadence, 'stopped'); assert.equal(reply.stage, 'Qualified');
  const tasks = (await api(rep).get(`/api/leads/${lead.id}`)).body.tasks;
  assert.deepEqual(tasks.map((t) => t.status), ['done', 'skipped', 'done', 'skipped', 'skipped']);
});

test('tier change on an active cadence rebuilds the steps', async () => {
  const lead = (await api(rep).post('/api/leads', { ...WARM, company: 'Retier Ltd', is_decision_maker: true })).body;
  assert.equal(lead.tier, 'Warm');
  await api(rep).post(`/api/leads/${lead.id}/cadence/start`);
  const upd = (await api(rep).patch(`/api/leads/${lead.id}`, { budget_confirmed: true, timeline_months: 1 })).body;
  assert.equal(upd.tier, 'Hot'); assert.equal(upd.cadence_restarted, true);
  const tasks = (await api(rep).get(`/api/leads/${lead.id}`)).body.tasks;
  assert.equal(tasks.filter((t) => t.status === 'open').length, 5);
});

test("today's queue puts hot leads first and flags who can be called now", async () => {
  const at = '2030-01-01T00:00:00Z';
  const q = (await api(rep).get(`/api/tasks/today?at=${encodeURIComponent('2031-01-01T00:00:00Z')}`)).body;
  assert.ok(q.length > 0);
  const tiers = q.map((t) => t.tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => ['Hot', 'Warm', 'Cold'].indexOf(a) - ['Hot', 'Warm', 'Cold'].indexOf(b)));
  const callTask = q.find((t) => t.channel === 'Call');
  assert.ok(callTask.call_window_ist.endsWith('IST'));
  assert.equal(typeof callTask.callable_now, 'boolean');
  assert.ok(at);
});

test('templated emails: missing merge fields are blocked, sent emails are logged and complete the step', async () => {
  const noTool = (await api(rep).post('/api/leads', { ...HOT, company: 'Mergefield Inc', current_tool: undefined })).body;
  const bad = await api(rep).post(`/api/leads/${noTool.id}/emails`, { template: 'follow-up' });
  assert.equal(bad.status, 400); assert.deepEqual(bad.body.missing, ['current_tool']);
  const lead = (await api(rep).post('/api/leads', { ...WARM, company: 'Mail Co', is_decision_maker: true })).body;
  await api(rep).post(`/api/leads/${lead.id}/cadence/start`);
  const ok = (await api(rep).post(`/api/leads/${lead.id}/emails`, { template: 'first-touch' }));
  assert.equal(ok.status, 201);
  assert.match(ok.body.text, /around 30 recruiters tell us slow reporting/);
  assert.equal(ok.body.completed_step, 1);
  const log = await query('SELECT * FROM email_log WHERE lead_id = $1', [lead.id]);
  assert.equal(log.rows.length, 1);
});

test('demos: booking moves the stage, emails an invite, reminders send once, held demo advances', async () => {
  const lead = (await api(rep).post('/api/leads', { ...HOT, company: 'Demo Partners' })).body;
  await api(rep).post(`/api/leads/${lead.id}/cadence/start`);
  const starts = new Date(Date.now() + 20 * 3600000).toISOString();
  const d = await api(rep).post(`/api/leads/${lead.id}/demos`, { starts_at: starts, meeting_url: 'https://zoom.us/j/123456789' });
  assert.equal(d.status, 201);
  assert.equal(d.body.stage, 'Demo Scheduled'); assert.equal(d.body.cadence, 'stopped');
  assert.match(d.body.invite_subject, /^Demo for Demo Partners/);
  assert.equal((await api(rep).post('/api/demos/send-reminders', {})).body.reminders_sent >= 1, true);
  assert.equal((await api(rep).post('/api/demos/send-reminders', {})).body.reminders_sent, 0, 'no double reminders');
  const held = (await api(rep).patch(`/api/demos/${d.body.demo.id}`, { status: 'held', feedback: 'Liked pipeline view' })).body;
  assert.equal(held.stage, 'Demo Done');
  const past = await api(rep).post(`/api/leads/${lead.id}/demos`, { starts_at: '2020-01-01T10:00:00Z', meeting_url: 'https://zoom.us/j/1' });
  assert.equal(past.status, 400);
});

test('closing a lead: lost needs a reason; won clients get projects and invoices with PDF, email and reminders', async () => {
  const lost = (await api(rep).post('/api/leads', { ...WARM, company: 'Lost Ltd' })).body;
  assert.equal((await api(rep).post(`/api/leads/${lost.id}/stage`, { stage: 'Lost' })).status, 400);
  assert.equal((await api(rep).post(`/api/leads/${lost.id}/stage`, { stage: 'Lost', lost_reason: 'Chose a competitor' })).status, 200);

  const lead = (await api(rep).post('/api/leads', { ...HOT, company: 'Won Agency' })).body;
  const inv0 = await api(rep).post('/api/invoices', { lead_id: lead.id, due_date: '2030-01-31', items: [{ description: 'Setup', quantity: 1, unit_price: 100 }] });
  assert.equal(inv0.status, 409, 'cannot invoice an open lead');
  await api(rep).post(`/api/leads/${lead.id}/stage`, { stage: 'Won' });
  const proj = (await api(rep).post(`/api/leads/${lead.id}/projects`, { name: 'Onboarding', deadline: '2030-02-01' })).body;
  const inv = (await api(rep).post('/api/invoices', {
    lead_id: lead.id, project_id: proj.id, due_date: '2020-01-31',
    items: [{ description: 'Annual licence, 12 seats', quantity: 12, unit_price: 85 }, { description: 'Data migration', quantity: 1, unit_price: 250 }],
  })).body;
  assert.match(inv.number, /^INV-\d{4}-0001$/); assert.equal(inv.total, 1270);
  const pdf = await api(rep).get(`/api/invoices/${inv.id}/pdf`).buffer(true).parse((res, cb) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
  const sent = (await api(rep).post(`/api/invoices/${inv.id}/send`)).body;
  assert.equal(sent.sent_to, HOT.email); assert.ok(sent.attachment_bytes > 1000);
  const rem = (await api(rep).post('/api/invoices/send-reminders')).body;
  assert.deepEqual(rem.invoices, [inv.number]);
  const list = (await api(rep).get('/api/invoices')).body;
  assert.equal(list.find((i) => i.id === inv.id).overdue, true);
  await api(rep).post(`/api/invoices/${inv.id}/paid`);
  assert.equal((await api(rep).post('/api/invoices/send-reminders')).body.reminders_sent, 0);
});

test('reports: funnel, channel response rates, win rate and lost reasons add up', async () => {
  const s = (await api(rep).get('/api/reports/summary')).body;
  const ids = (await query("SELECT COUNT(*)::int AS n FROM leads WHERE owner_id = (SELECT id FROM users WHERE email='asha@clientdeck.test')")).rows[0].n;
  assert.equal(s.funnel[0].reached, ids, 'every lead starts at New');
  for (let i = 1; i < s.funnel.length; i++) assert.ok(s.funnel[i].reached <= s.funnel[i - 1].reached, 'funnel never widens');
  assert.equal(s.leads_by_stage.Won, 1); assert.equal(s.leads_by_stage.Lost, 1);
  assert.equal(s.win_rate_pct, 50);
  assert.deepEqual(s.lost_reasons, [{ lost_reason: 'Chose a competitor', n: 1 }]);
  const email = s.channels.find((c) => c.channel === 'Email');
  assert.ok(email.touches >= 2 && email.positive >= 1);
  assert.equal(s.funnel.find((f) => f.stage === 'Won').reached, 1);
});
