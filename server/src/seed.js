// Demo data: one manager, two reps and 60 simulated recruitment-agency leads
// with activities, cadences, demos and invoices. All names are made up.
import bcrypt from 'bcryptjs';
import { migrate, pool, tx } from './db.js';
import { qualify } from './services/qualify.js';
import { startCadence } from './services/cadence.js';

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const PLACES = [
  ['North America', 'United States', 'America/New_York'], ['North America', 'United States', 'America/Chicago'],
  ['North America', 'United States', 'America/Los_Angeles'], ['North America', 'Canada', 'America/Toronto'],
  ['Europe', 'United Kingdom', 'Europe/London'], ['Europe', 'Ireland', 'Europe/Dublin'], ['Europe', 'Germany', 'Europe/Berlin'],
  ['APAC', 'Australia', 'Australia/Sydney'], ['APAC', 'Singapore', 'Asia/Singapore'], ['APAC', 'India', 'Asia/Kolkata'],
];
const WORDS = ['Northstar', 'Harbour', 'Summit', 'Bridge', 'Apex', 'Cedar', 'Pioneer', 'Lighthouse', 'Keystone', 'Meridian', 'Vantage', 'Beacon'];
const KINDS = ['Talent', 'Search', 'Recruiting', 'Executive Search', 'Staffing', 'People Partners'];
const FIRST = ['Priya', 'Tom', 'Sara', 'Liam', 'Aisha', 'Ben', 'Chloe', 'Daniel', 'Elena', 'Farhan', 'Grace', 'Hugo', 'Isla', 'Jai'];
const LAST = ['Shah', 'Reed', 'Kim', 'Walsh', 'Khan', 'Murphy', 'Ng', 'Fischer', 'Lopez', 'Iyer', 'Brown', 'Martin'];
const PAINS = ['Duplicate candidate records', 'No view of the client pipeline', 'Manual follow-ups', 'Slow reporting',
  'Expensive licences', 'Hard to share CVs with clients', 'Job board posting takes too long'];
const TOOLS = ['Spreadsheets', 'Bullhorn', 'Zoho Recruit', 'Vincere', 'Email and Excel'];
const LOST = ['Chose a competitor', 'No budget this year', 'Timing: revisit next quarter', 'Not interested'];

async function main() {
  await migrate();
  const hash = await bcrypt.hash('password123', 10);
  const users = [];
  for (const [name, email, role] of [['Meera Manager', 'manager@clientdeck.demo', 'manager'],
    ['Asha Rep', 'asha@clientdeck.demo', 'rep'], ['Ravi Rep', 'ravi@clientdeck.demo', 'rep']]) {
    users.push((await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING *', [name, email, hash, role])).rows[0]);
  }
  const reps = users.filter((u) => u.role === 'rep');
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const [territory, country, timezone] = pick(PLACES);
    const first = pick(FIRST); const last = pick(LAST);
    const lead = {
      company: `${pick(WORDS)} ${pick(KINDS)}${i % 7 === 0 ? ' Group' : ''}`, contact_name: `${first} ${last}`,
      contact_title: pick(['Founder', 'Managing Director', 'Head of Operations', 'Recruitment Manager']),
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`, phone: '+1 555 0100',
      linkedin_url: `https://www.linkedin.com/in/demo-${i}`, country, timezone, territory,
      source: pick(['outbound', 'outbound', 'inbound', 'referral', 'event']), team_size: 2 + Math.floor(rnd() * 60),
      current_tool: pick(TOOLS), pain_points: PAINS.filter(() => rnd() < 0.3),
      is_decision_maker: rnd() < 0.5, budget_confirmed: rnd() < 0.35, timeline_months: pick([1, 2, 3, 6, 12, null]),
    };
    const q = qualify(lead);
    const rep = reps[i % 2];
    await tx(async (c) => {
      const cols = Object.keys(lead);
      const row = (await c.query(
        `INSERT INTO leads (${cols.join(',')}, score, tier, owner_id, created_at) VALUES (${cols.map((_, k) => `$${k + 1}`).join(',')}, $${cols.length + 1}, $${cols.length + 2}, $${cols.length + 3}, $${cols.length + 4}) RETURNING *`,
        [...Object.values(lead), q.score, q.tier, rep.id, new Date(now - (20 + rnd() * 40) * 86400000)])).rows[0];
      // how far this lead got: hotter leads tend to go further
      const reach = Math.min(6, Math.floor(rnd() * (q.tier === 'Hot' ? 9 : q.tier === 'Warm' ? 6 : 3)));
      const path = ['New', 'Contacted', 'Qualified', 'Demo Scheduled', 'Demo Done', 'Proposal', 'Won'].slice(0, reach + 1);
      let t = new Date(row.created_at).getTime(); let prev = null;
      for (const st of path) {
        await c.query('INSERT INTO stage_history (lead_id, from_stage, to_stage, changed_at) VALUES ($1,$2,$3,$4)', [row.id, prev, st, new Date(t)]);
        if (st !== 'New') {
          const ch = st === 'Demo Done' ? 'Zoom demo' : pick(['Call', 'Email', 'LinkedIn']);
          const outcome = st === 'Contacted' ? pick(['Connected', 'Sent', 'Voicemail']) : st === 'Qualified' ? 'Replied - interested'
            : st === 'Demo Scheduled' ? 'Demo booked' : st === 'Demo Done' ? 'Demo held' : 'Connected';
          await c.query('INSERT INTO activities (lead_id,user_id,channel,outcome,occurred_at) VALUES ($1,$2,$3,$4,$5)',
            [row.id, rep.id, st === 'Demo Scheduled' ? 'Zoom demo' : ch, outcome, new Date(t)]);
        }
        for (let k = 0; st !== 'New' && k < Math.floor(rnd() * 3); k++) {
          await c.query('INSERT INTO activities (lead_id,user_id,channel,outcome,occurred_at) VALUES ($1,$2,$3,$4,$5)',
            [row.id, rep.id, pick(['Call', 'Email', 'LinkedIn']), pick(['No answer', 'Sent', 'Voicemail', 'Sent']), new Date(t + 3600000)]);
        }
        prev = st; t += (1 + rnd() * 5) * 86400000;
      }
      let stage = path[path.length - 1];
      if (stage !== 'Won' && reach >= 1 && rnd() < 0.25) {
        stage = 'Lost';
        await c.query('INSERT INTO stage_history (lead_id, from_stage, to_stage, changed_at) VALUES ($1,$2,$3,$4)', [row.id, prev, 'Lost', new Date(t)]);
      }
      await c.query('UPDATE leads SET stage=$2, lost_reason=$3, last_contacted_at=$4 WHERE id=$1',
        [row.id, stage, stage === 'Lost' ? pick(LOST) : null, reach ? new Date(t) : null]);
      if (['New', 'Contacted'].includes(stage)) await startCadence(c, { ...row }, new Date(now - rnd() * 3 * 86400000));
      if (path.includes('Demo Scheduled')) {
        const status = path.includes('Demo Done') ? 'held' : stage === 'Lost' ? 'cancelled' : 'scheduled';
        const when = status === 'scheduled' ? new Date(now + (1 + rnd() * 5) * 86400000)
          : new Date(new Date(row.created_at).getTime() + 4 * 86400000);
        await c.query('INSERT INTO demos (lead_id, starts_at, meeting_url, status) VALUES ($1,$2,$3,$4)', [row.id, when, 'https://zoom.us/j/1234567890', status]);
      }
      if (stage === 'Won') {
        const p = (await c.query("INSERT INTO projects (lead_id, name, deadline) VALUES ($1,'Onboarding and data migration', CURRENT_DATE + 30) RETURNING id", [row.id])).rows[0];
        const n = (await c.query('SELECT COUNT(*)::int n FROM invoices')).rows[0].n + 1;
        const inv = (await c.query("INSERT INTO invoices (number, lead_id, project_id, due_date, status) VALUES ($1,$2,$3,CURRENT_DATE + $4::int,$5) RETURNING id",
          [`INV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`, row.id, p.id, rnd() < 0.3 ? -10 : 20, rnd() < 0.4 ? 'paid' : 'unpaid'])).rows[0];
        await c.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES ($1,$2,$3,85), ($1,$4,1,250)',
          [inv.id, `Annual licence, ${lead.team_size} seats`, lead.team_size, 'Data migration']);
      }
    });
  }
  const c = (await pool.query("SELECT stage, COUNT(*)::int n FROM leads GROUP BY stage ORDER BY n DESC")).rows;
  console.log('Seeded 60 leads:', c.map((x) => `${x.stage} ${x.n}`).join(', '));
  console.log('Log in as asha@clientdeck.demo / password123 (rep) or manager@clientdeck.demo / password123');
  await pool.end();
}
main();
