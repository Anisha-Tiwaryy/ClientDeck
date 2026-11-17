// Today's task queue, templated emails, and Zoom demos.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { scope } from '../auth.js';
import { loadLead, logActivity, setStage, STAGES } from './leads.js';
import { render, send, TEMPLATES } from '../services/mailer.js';
import { callWindow, inCallWindow, formatIn, IST } from '../services/time.js';

const r = Router();
const TIER_RANK = { Hot: 0, Warm: 1, Cold: 2 };

// Open tasks due by the end of today (IST), hottest leads first, with call-window info.
r.get('/tasks/today', async (req, res) => {
  const s = scope(req.user);
  const now = req.query.at ? new Date(req.query.at) : new Date();
  const endOfDay = new Date(now.getTime() + 86400000);
  const { rows } = await query(
    `SELECT t.*, l.company, l.contact_name, l.tier, l.score, l.timezone, l.stage, l.phone, l.email, l.linkedin_url
     FROM tasks t JOIN leads l ON l.id = t.lead_id
     WHERE t.status = 'open' AND t.due_at <= $${s.params.length + 1} AND ${s.sql}
     ORDER BY t.due_at`, [...s.params, endOfDay]);
  const out = rows.map((t) => {
    const w = callWindow(now, t.timezone);
    return {
      ...t, overdue: new Date(t.due_at) < new Date(now.getTime() - 3600000),
      due_ist: formatIn(new Date(t.due_at), IST),
      call_window_ist: t.channel === 'Call' ? w.ist : null,
      callable_now: t.channel === 'Call' ? inCallWindow(now, t.timezone) : null,
    };
  }).sort((a, b) => (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || (b.overdue - a.overdue) || (new Date(a.due_at) - new Date(b.due_at)));
  res.json(out);
});

r.post('/tasks/:id/skip', async (req, res) => {
  const s = scope(req.user);
  const { rows } = await query(
    `UPDATE tasks t SET status = 'skipped', completed_at = now() FROM leads l
     WHERE t.id = $${s.params.length + 1} AND l.id = t.lead_id AND t.status = 'open' AND ${s.sql} RETURNING t.*`,
    [...s.params, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Open task not found' });
  res.json(rows[0]);
});

function mergeData(lead, user, extra = {}) {
  return {
    company: lead.company, first_name: lead.contact_name.split(' ')[0], team_size: lead.team_size,
    pain_point: lead.pain_points?.[0]?.toLowerCase(), current_tool: lead.current_tool, rep_name: user.name,
    timezone: lead.timezone, ...extra,
  };
}

r.get('/templates', (_req, res) => res.json(TEMPLATES));

r.post('/leads/:id/emails', async (req, res) => {
  const b = z.object({ template: z.enum(Object.keys(TEMPLATES)), extra: z.record(z.string(), z.any()).optional() }).parse(req.body);
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    if (!lead) return { status: 404, body: { error: 'Lead not found' } };
    if (!lead.email) return { status: 400, body: { error: 'Lead has no email address' } };
    const data = mergeData(lead, req.user, b.extra);
    const subject = render(TEMPLATES[b.template].subject, data);
    const body = render(TEMPLATES[b.template].body, data);
    const missing = [...new Set([...subject.missing, ...body.missing])];
    if (missing.length) return { status: 400, body: { error: 'Missing merge fields', missing } };
    const info = await send({ to: lead.email, subject: subject.text, text: body.text });
    await c.query('INSERT INTO email_log (lead_id, to_address, subject, kind, message_id) VALUES ($1,$2,$3,$4,$5)',
      [lead.id, lead.email, subject.text, b.template, info.messageId]);
    const act = await logActivity(c, req.user, lead, { channel: 'Email', outcome: 'Sent', notes: `Template: ${b.template}` });
    return { status: 201, body: { subject: subject.text, text: body.text, message_id: info.messageId, ...act } };
  });
  res.status(out.status).json(out.body);
});

const DemoBody = z.object({
  starts_at: z.coerce.date(), duration_min: z.number().int().min(15).max(120).default(30),
  meeting_url: z.string().url(), agenda: z.string().default('Walk through the features that match your needs, then Q&A'),
});

r.post('/leads/:id/demos', async (req, res) => {
  const b = DemoBody.parse(req.body);
  if (b.starts_at < new Date()) return res.status(400).json({ error: 'Demo time is in the past' });
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    if (!lead) return null;
    const { rows } = await c.query(
      'INSERT INTO demos (lead_id, starts_at, duration_min, meeting_url, agenda) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [lead.id, b.starts_at, b.duration_min, b.meeting_url, b.agenda]);
    const demo_time = `${b.starts_at.toLocaleString('en-US', { timeZone: lead.timezone, dateStyle: 'medium', timeStyle: 'short' })}`;
    let email = null;
    if (lead.email) {
      const data = mergeData(lead, req.user, { demo_time, meeting_url: b.meeting_url, agenda: b.agenda });
      const subject = render(TEMPLATES['demo-invite'].subject, data).text;
      const info = await send({ to: lead.email, subject, text: render(TEMPLATES['demo-invite'].body, data).text });
      await c.query("INSERT INTO email_log (lead_id, to_address, subject, kind, message_id) VALUES ($1,$2,$3,'demo-invite',$4)",
        [lead.id, lead.email, subject, info.messageId]);
      email = subject;
    }
    const act = await logActivity(c, req.user, lead, { channel: 'Zoom demo', outcome: 'Demo booked', notes: `Demo at ${demo_time}` });
    if (STAGES.indexOf(lead.stage) < STAGES.indexOf('Demo Scheduled')) await setStage(c, lead, 'Demo Scheduled');
    return {
      demo: rows[0], invite_subject: email, stage: lead.stage, cadence: act.cadence,
      local_time: demo_time, ist_time: b.starts_at.toLocaleString('en-IN', { timeZone: IST, dateStyle: 'medium', timeStyle: 'short' }),
    };
  });
  if (!out) return res.status(404).json({ error: 'Lead not found' });
  res.status(201).json(out);
});

r.patch('/demos/:id', async (req, res) => {
  const b = z.object({ status: z.enum(['held', 'no-show', 'cancelled']), feedback: z.string().optional() }).parse(req.body);
  const out = await tx(async (c) => {
    const s = scope(req.user);
    const { rows } = await c.query(
      `SELECT d.*, l.id AS lid FROM demos d JOIN leads l ON l.id = d.lead_id WHERE d.id = $${s.params.length + 1} AND ${s.sql}`,
      [...s.params, req.params.id]);
    if (!rows[0]) return null;
    await c.query('UPDATE demos SET status = $2, feedback = $3 WHERE id = $1', [rows[0].id, b.status, b.feedback || null]);
    const lead = await loadLead(req.user, rows[0].lid, c);
    if (b.status === 'held') {
      await logActivity(c, req.user, lead, { channel: 'Zoom demo', outcome: 'Demo held', notes: b.feedback });
      if (STAGES.indexOf(lead.stage) < STAGES.indexOf('Demo Done')) await setStage(c, lead, 'Demo Done');
    }
    return { id: rows[0].id, status: b.status, stage: lead.stage };
  });
  if (!out) return res.status(404).json({ error: 'Demo not found' });
  res.json(out);
});

// Send reminders for demos starting in the next 24 hours (run from a scheduler).
r.post('/demos/send-reminders', async (req, res) => {
  const s = scope(req.user);
  const now = req.body?.at ? new Date(req.body.at) : new Date();
  const { rows } = await query(
    `SELECT d.*, l.email, l.contact_name, l.company, l.timezone FROM demos d JOIN leads l ON l.id = d.lead_id
     WHERE d.status = 'scheduled' AND NOT d.reminder_sent AND l.email IS NOT NULL
       AND d.starts_at > $${s.params.length + 1} AND d.starts_at <= $${s.params.length + 2} AND ${s.sql}`,
    [...s.params, now, new Date(now.getTime() + 86400000)]);
  for (const d of rows) {
    const when = new Date(d.starts_at).toLocaleString('en-US', { timeZone: d.timezone, dateStyle: 'medium', timeStyle: 'short' });
    const subject = `Reminder: your demo is on ${when}`;
    const info = await send({ to: d.email, subject, text: `Hi ${d.contact_name.split(' ')[0]},\n\nA quick reminder of your demo on ${when}.\nJoin: ${d.meeting_url}\n` });
    await query('UPDATE demos SET reminder_sent = true WHERE id = $1', [d.id]);
    await query("INSERT INTO email_log (lead_id, to_address, subject, kind, message_id) VALUES ($1,$2,$3,'demo-reminder',$4)",
      [d.lead_id, d.email, subject, info.messageId]);
  }
  res.json({ reminders_sent: rows.length });
});

export default r;
