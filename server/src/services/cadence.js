// Multi-channel follow-up cadences. Each tier has a fixed sequence of steps;
// starting a cadence creates dated tasks, logging an activity on the matching
// channel completes the open step, and a reply stops the cadence.
import { nextLocalSlot } from './time.js';

export const CADENCES = {
  Hot: [
    { day: 0, channel: 'Call', purpose: 'Discovery call: confirm needs, team size and timeline' },
    { day: 0, channel: 'Email', purpose: 'Recap the call and share a short video on the features they asked about' },
    { day: 2, channel: 'LinkedIn', purpose: 'Connect with a personalised note' },
    { day: 4, channel: 'Call', purpose: 'Follow-up call: answer questions and book a demo' },
    { day: 6, channel: 'Email', purpose: 'Send a Zoom demo invite with two time options' },
  ],
  Warm: [
    { day: 0, channel: 'Email', purpose: 'Personalised email built on their pain points' },
    { day: 2, channel: 'Call', purpose: 'Call to understand their current hiring workflow' },
    { day: 5, channel: 'LinkedIn', purpose: 'Connect and share a relevant customer story' },
    { day: 9, channel: 'Email', purpose: 'Invite to a Zoom demo' },
  ],
  Cold: [
    { day: 0, channel: 'Email', purpose: 'Short introduction with one relevant insight' },
    { day: 7, channel: 'LinkedIn', purpose: 'Light-touch connection request' },
    { day: 21, channel: 'Email', purpose: 'Check back in with a customer story from their market' },
  ],
};

const STOP_OUTCOMES = new Set(['Replied - interested', 'Replied - not interested', 'Demo booked']);
const PAUSE_OUTCOMES = new Set(['Replied - not now']);

export function plan(tier, start, timeZone) {
  return CADENCES[tier].map((s, i) => ({
    step: i + 1, channel: s.channel, purpose: s.purpose,
    // calls go into the lead's 10:00 local slot; emails and LinkedIn at 09:00 local
    due_at: nextLocalSlot(start, s.day, timeZone, s.channel === 'Call' ? 10 : 9),
  }));
}

export async function startCadence(client, lead, start = new Date()) {
  await client.query("DELETE FROM tasks WHERE lead_id = $1 AND status = 'open'", [lead.id]);
  const steps = plan(lead.tier, start, lead.timezone);
  for (const s of steps) {
    await client.query(
      `INSERT INTO tasks (lead_id, step, channel, purpose, due_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (lead_id, step) DO UPDATE SET channel = EXCLUDED.channel, purpose = EXCLUDED.purpose,
       due_at = EXCLUDED.due_at, status = 'open', completed_at = NULL`,
      [lead.id, s.step, s.channel, s.purpose, s.due_at]);
  }
  await client.query("UPDATE leads SET cadence_status = 'active', updated_at = now() WHERE id = $1", [lead.id]);
  return steps;
}

// Apply a logged activity to the cadence. Returns what happened, for the API response.
export async function onActivity(client, leadId, activity) {
  const effect = { completed_step: null, cadence: null };
  if (STOP_OUTCOMES.has(activity.outcome) || PAUSE_OUTCOMES.has(activity.outcome)) {
    const status = STOP_OUTCOMES.has(activity.outcome) ? 'stopped' : 'paused';
    await client.query("UPDATE tasks SET status = 'skipped', completed_at = now() WHERE lead_id = $1 AND status = 'open'", [leadId]);
    await client.query('UPDATE leads SET cadence_status = $2, updated_at = now() WHERE id = $1', [leadId, status]);
    effect.cadence = status;
    return effect;
  }
  const { rows } = await client.query(
    `UPDATE tasks SET status = 'done', completed_at = $3 WHERE id = (
       SELECT id FROM tasks WHERE lead_id = $1 AND status = 'open' AND channel = $2 ORDER BY step LIMIT 1)
     RETURNING step`, [leadId, activity.channel, activity.occurred_at || new Date()]);
  if (rows[0]) effect.completed_step = rows[0].step;
  const open = await client.query("SELECT COUNT(*)::int AS n FROM tasks WHERE lead_id = $1 AND status = 'open'", [leadId]);
  const lead = await client.query('SELECT cadence_status FROM leads WHERE id = $1', [leadId]);
  if (open.rows[0].n === 0 && lead.rows[0].cadence_status === 'active') {
    await client.query("UPDATE leads SET cadence_status = 'completed', updated_at = now() WHERE id = $1", [leadId]);
    effect.cadence = 'completed';
  }
  return effect;
}
