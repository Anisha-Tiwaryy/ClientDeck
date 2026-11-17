// Pipeline reporting: funnel conversion, channel performance, demos, win rate,
// lost reasons and territory split. Everything is plain SQL.
import { Router } from 'express';
import { query } from '../db.js';
import { scope } from '../auth.js';
import { STAGES } from './leads.js';

const r = Router();

r.get('/summary', async (req, res) => {
  const s = scope(req.user);
  const p = s.params;
  const [stageNow, reached, channels, demos, lost, territory, tasks, invoices] = await Promise.all([
    query(`SELECT stage, COUNT(*) AS n FROM leads l WHERE ${s.sql} GROUP BY stage`, p),
    // furthest open-pipeline stage each lead has ever reached (Lost leads still count for the stages they passed)
    query(`SELECT furthest, COUNT(*) AS n FROM (
             SELECT h.lead_id, MAX(array_position($${p.length + 1}::text[], h.to_stage)) AS furthest
             FROM stage_history h JOIN leads l ON l.id = h.lead_id
             WHERE h.to_stage <> 'Lost' AND ${s.sql} GROUP BY h.lead_id) x GROUP BY furthest`, [...p, STAGES]),
    query(`SELECT a.channel, COUNT(*) AS touches,
                  COUNT(*) FILTER (WHERE a.outcome IN ('Connected','Replied - interested','Replied - not now','Replied - not interested','Demo booked')) AS responses,
                  COUNT(*) FILTER (WHERE a.outcome IN ('Replied - interested','Demo booked')) AS positive
           FROM activities a JOIN leads l ON l.id = a.lead_id WHERE a.channel NOT IN ('Note','Zoom demo') AND ${s.sql}
           GROUP BY a.channel ORDER BY a.channel`, p),
    query(`SELECT d.status, COUNT(*) AS n FROM demos d JOIN leads l ON l.id = d.lead_id WHERE ${s.sql} GROUP BY d.status`, p),
    query(`SELECT lost_reason, COUNT(*) AS n FROM leads l WHERE stage = 'Lost' AND ${s.sql} GROUP BY lost_reason ORDER BY n DESC`, p),
    query(`SELECT territory, COUNT(*) AS leads, COUNT(*) FILTER (WHERE tier = 'Hot') AS hot,
                  COUNT(*) FILTER (WHERE stage = 'Won') AS won, COUNT(*) FILTER (WHERE stage IN ('Demo Scheduled','Demo Done','Proposal')) AS in_late_pipeline
           FROM leads l WHERE ${s.sql} GROUP BY territory ORDER BY territory`, p),
    query(`SELECT COUNT(*) FILTER (WHERE t.due_at < now()) AS overdue, COUNT(*) AS open
           FROM tasks t JOIN leads l ON l.id = t.lead_id WHERE t.status = 'open' AND ${s.sql}`, p),
    query(`SELECT COALESCE(SUM(it.quantity*it.unit_price) FILTER (WHERE i.status='paid'),0) AS paid,
                  COALESCE(SUM(it.quantity*it.unit_price) FILTER (WHERE i.status='unpaid'),0) AS outstanding,
                  COALESCE(SUM(it.quantity*it.unit_price) FILTER (WHERE i.status='unpaid' AND i.due_date < CURRENT_DATE),0) AS overdue
           FROM invoices i JOIN invoice_items it ON it.invoice_id = i.id JOIN leads l ON l.id = i.lead_id WHERE ${s.sql}`, p),
  ]);
  const open = STAGES.slice(0, 7); // New .. Won
  const furthest = reached.rows.map((x) => ({ idx: x.furthest - 1, n: x.n }));
  const passed = Object.fromEntries(open.map((st, i) => [st, furthest.filter((f) => f.idx >= i).reduce((t, f) => t + f.n, 0)]));
  const funnel = open.map((st, i) => ({
    stage: st, reached: passed[st],
    conversion_from_previous_pct: i === 0 || !passed[open[i - 1]] ? null : Math.round(1000 * passed[st] / passed[open[i - 1]]) / 10,
  }));
  const won = stageNow.rows.find((x) => x.stage === 'Won')?.n || 0;
  const lostN = stageNow.rows.find((x) => x.stage === 'Lost')?.n || 0;
  res.json({
    leads_by_stage: Object.fromEntries(STAGES.map((st) => [st, stageNow.rows.find((x) => x.stage === st)?.n || 0])),
    funnel,
    channels: channels.rows.map((c) => ({ ...c, response_rate_pct: c.touches ? Math.round(1000 * c.responses / c.touches) / 10 : 0 })),
    demos: Object.fromEntries(demos.rows.map((d) => [d.status, d.n])),
    win_rate_pct: won + lostN ? Math.round(1000 * won / (won + lostN)) / 10 : null,
    lost_reasons: lost.rows, territories: territory.rows, tasks: tasks.rows[0], invoices: invoices.rows[0],
  });
});

export default r;
