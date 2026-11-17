import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { scope } from '../auth.js';
import { qualify } from '../services/qualify.js';
import { startCadence, onActivity } from '../services/cadence.js';
import { callWindow, inCallWindow } from '../services/time.js';

export const STAGES = ['New', 'Contacted', 'Qualified', 'Demo Scheduled', 'Demo Done', 'Proposal', 'Won', 'Lost'];
const r = Router();

const LeadBody = z.object({
  company: z.string().min(1), contact_name: z.string().min(1), contact_title: z.string().optional(),
  email: z.string().email().optional(), phone: z.string().optional(), linkedin_url: z.string().url().optional(),
  country: z.string().optional(), timezone: z.string().refine((tz) => {
    try { Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
  }, 'Unknown time zone').default('America/New_York'),
  territory: z.enum(['North America', 'Europe', 'APAC']), source: z.enum(['outbound', 'inbound', 'referral', 'event']).default('outbound'),
  team_size: z.number().int().positive().optional(), current_tool: z.string().optional(),
  pain_points: z.array(z.string()).default([]), is_decision_maker: z.boolean().default(false),
  budget_confirmed: z.boolean().default(false), timeline_months: z.number().int().min(0).optional(),
  needs_notes: z.string().optional(),
});
const FIELDS = Object.keys(LeadBody.shape);

export async function loadLead(user, id, client = { query }) {
  const s = scope(user);
  const { rows } = await client.query(`SELECT * FROM leads l WHERE l.id = $${s.params.length + 1} AND ${s.sql}`, [...s.params, id]);
  return rows[0];
}

async function setStage(client, lead, to, lostReason) {
  if (lead.stage === to) return;
  await client.query('UPDATE leads SET stage = $2, lost_reason = $3, updated_at = now() WHERE id = $1', [lead.id, to, lostReason || null]);
  await client.query('INSERT INTO stage_history (lead_id, from_stage, to_stage) VALUES ($1,$2,$3)', [lead.id, lead.stage, to]);
  if (to === 'Won' || to === 'Lost') {
    await client.query("UPDATE tasks SET status = 'skipped', completed_at = now() WHERE lead_id = $1 AND status = 'open'", [lead.id]);
    await client.query("UPDATE leads SET cadence_status = 'stopped' WHERE id = $1 AND cadence_status IN ('active','paused')", [lead.id]);
  }
  lead.stage = to;
}
export { setStage };

r.get('/', async (req, res) => {
  const s = scope(req.user);
  const where = [s.sql]; const params = [...s.params];
  for (const k of ['stage', 'tier', 'territory']) {
    if (req.query[k]) { params.push(req.query[k]); where.push(`l.${k} = $${params.length}`); }
  }
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(l.company ILIKE $${params.length} OR l.contact_name ILIKE $${params.length})`); }
  const { rows } = await query(
    `SELECT l.*, (SELECT MIN(due_at) FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open') AS next_task_due
     FROM leads l WHERE ${where.join(' AND ')} ORDER BY l.score DESC, l.updated_at DESC`, params);
  res.json(rows);
});

r.post('/', async (req, res) => {
  const b = LeadBody.parse(req.body);
  const q = qualify(b);
  const lead = await tx(async (c) => {
    const cols = [...FIELDS, 'score', 'tier', 'owner_id'];
    const vals = [...FIELDS.map((f) => b[f] ?? null), q.score, q.tier, req.user.id];
    const { rows } = await c.query(
      `INSERT INTO leads (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
    await c.query("INSERT INTO stage_history (lead_id, from_stage, to_stage) VALUES ($1, NULL, 'New')", [rows[0].id]);
    return rows[0];
  });
  res.status(201).json({ ...lead, qualification: q });
});

r.get('/:id', async (req, res) => {
  const lead = await loadLead(req.user, req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const [acts, tasks, demos, emails] = await Promise.all([
    query('SELECT * FROM activities WHERE lead_id = $1 ORDER BY occurred_at DESC', [lead.id]),
    query('SELECT * FROM tasks WHERE lead_id = $1 ORDER BY step', [lead.id]),
    query('SELECT * FROM demos WHERE lead_id = $1 ORDER BY starts_at DESC', [lead.id]),
    query('SELECT * FROM email_log WHERE lead_id = $1 ORDER BY sent_at DESC', [lead.id]),
  ]);
  const now = new Date();
  const w = callWindow(now, lead.timezone);
  res.json({
    ...lead, qualification: qualify(lead), activities: acts.rows, tasks: tasks.rows, demos: demos.rows, emails: emails.rows,
    call_window: { local: `${w.local} (${lead.timezone})`, ist: w.ist, callable_now: inCallWindow(now, lead.timezone) },
  });
});

r.patch('/:id', async (req, res) => {
  const parsed = LeadBody.partial().parse(req.body);
  const b = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v !== undefined && k in req.body));
  if (!Object.keys(b).length) return res.status(400).json({ error: 'Nothing to update' });
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    if (!lead) return null;
    const merged = { ...lead, ...b };
    const q = qualify(merged);
    const sets = Object.keys(b).map((k, i) => `${k} = $${i + 2}`);
    await c.query(`UPDATE leads SET ${[...sets, `score = $${sets.length + 2}`, `tier = $${sets.length + 3}`, 'updated_at = now()'].join(', ')}
                   WHERE id = $1`, [lead.id, ...Object.values(b), q.score, q.tier]);
    let cadence_restarted = false;
    if (q.tier !== lead.tier && lead.cadence_status === 'active') {
      await startCadence(c, { ...merged, tier: q.tier }); cadence_restarted = true;
    }
    return { ...merged, score: q.score, tier: q.tier, qualification: q, cadence_restarted };
  });
  if (!out) return res.status(404).json({ error: 'Lead not found' });
  res.json(out);
});

r.post('/:id/stage', async (req, res) => {
  const b = z.object({ stage: z.enum(STAGES), lost_reason: z.string().min(3).optional() })
    .refine((x) => x.stage !== 'Lost' || x.lost_reason, { message: 'A lost reason is required' }).parse(req.body);
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    if (!lead) return null;
    await setStage(c, lead, b.stage, b.lost_reason);
    return lead;
  });
  if (!out) return res.status(404).json({ error: 'Lead not found' });
  res.json(out);
});

r.post('/:id/cadence/start', async (req, res) => {
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    if (!lead) return null;
    if (['Won', 'Lost'].includes(lead.stage)) return { error: 'Lead is closed' };
    return { tier: lead.tier, steps: await startCadence(c, lead) };
  });
  if (!out) return res.status(404).json({ error: 'Lead not found' });
  if (out.error) return res.status(409).json(out);
  res.status(201).json(out);
});

const ActivityBody = z.object({
  channel: z.enum(['Call', 'Email', 'LinkedIn', 'Zoom demo', 'Note']),
  outcome: z.enum(['Connected', 'No answer', 'Voicemail', 'Sent', 'Replied - interested', 'Replied - not now',
    'Replied - not interested', 'Demo booked', 'Demo held', 'Note']),
  notes: z.string().optional(), occurred_at: z.coerce.date().optional(),
});

export async function logActivity(c, user, lead, a) {
  const { rows } = await c.query(
    'INSERT INTO activities (lead_id, user_id, channel, outcome, notes, occurred_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
    [lead.id, user.id, a.channel, a.outcome, a.notes || null, a.occurred_at || new Date()]);
  if (a.channel !== 'Note') await c.query('UPDATE leads SET last_contacted_at = $2 WHERE id = $1', [lead.id, rows[0].occurred_at]);
  if (lead.stage === 'New' && a.channel !== 'Note') await setStage(c, lead, 'Contacted');
  if (a.outcome === 'Replied - interested' && STAGES.indexOf(lead.stage) < STAGES.indexOf('Qualified')) await setStage(c, lead, 'Qualified');
  if (a.outcome === 'Replied - not interested' && !['Won', 'Lost'].includes(lead.stage)) await setStage(c, lead, 'Lost', 'Not interested');
  const effect = await onActivity(c, lead.id, rows[0]);
  return { activity: rows[0], ...effect, stage: lead.stage };
}

r.post('/:id/activities', async (req, res) => {
  const a = ActivityBody.parse(req.body);
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, req.params.id, c);
    return lead ? logActivity(c, req.user, lead, a) : null;
  });
  if (!out) return res.status(404).json({ error: 'Lead not found' });
  res.status(201).json(out);
});

export default r;
