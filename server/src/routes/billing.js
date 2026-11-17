// Projects and invoices for won clients: PDF invoices (jsPDF), email delivery
// with the PDF attached (Nodemailer), paid/unpaid tracking and payment reminders.
import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { scope } from '../auth.js';
import { loadLead } from './leads.js';
import { invoicePdf, invoiceTotals } from '../services/pdf.js';
import { send } from '../services/mailer.js';

const r = Router();

r.post('/leads/:id/projects', async (req, res) => {
  const b = z.object({ name: z.string().min(2), deadline: z.string().date().optional() }).parse(req.body);
  const lead = await loadLead(req.user, req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { rows } = await query('INSERT INTO projects (lead_id, name, deadline) VALUES ($1,$2,$3) RETURNING *', [lead.id, b.name, b.deadline || null]);
  res.status(201).json(rows[0]);
});

r.get('/projects', async (req, res) => {
  const s = scope(req.user);
  const { rows } = await query(`SELECT p.*, l.company FROM projects p JOIN leads l ON l.id = p.lead_id WHERE ${s.sql} ORDER BY p.deadline NULLS LAST`, s.params);
  res.json(rows);
});

const InvoiceBody = z.object({
  lead_id: z.number().int(), project_id: z.number().int().optional(), due_date: z.string().date(),
  currency: z.string().length(3).default('USD'),
  items: z.array(z.object({ description: z.string().min(1), quantity: z.number().positive(), unit_price: z.number().nonnegative() })).min(1),
});

async function loadInvoice(user, id, client = { query }) {
  const s = scope(user);
  const inv = (await client.query(
    `SELECT i.* FROM invoices i JOIN leads l ON l.id = i.lead_id WHERE i.id = $${s.params.length + 1} AND ${s.sql}`, [...s.params, id])).rows[0];
  if (!inv) return null;
  const items = (await client.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [inv.id])).rows;
  const lead = (await client.query('SELECT * FROM leads WHERE id = $1', [inv.lead_id])).rows[0];
  return { inv, items, lead };
}

r.post('/invoices', async (req, res) => {
  const b = InvoiceBody.parse(req.body);
  const out = await tx(async (c) => {
    const lead = await loadLead(req.user, b.lead_id, c);
    if (!lead) return { status: 404, body: { error: 'Lead not found' } };
    if (lead.stage !== 'Won') return { status: 409, body: { error: 'Invoices can only be raised for won clients' } };
    const year = new Date().getFullYear();
    const n = (await c.query("SELECT COUNT(*)::int AS n FROM invoices WHERE number LIKE $1", [`INV-${year}-%`])).rows[0].n + 1;
    const number = `INV-${year}-${String(n).padStart(4, '0')}`;
    const inv = (await c.query('INSERT INTO invoices (number, lead_id, project_id, due_date, currency) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [number, lead.id, b.project_id || null, b.due_date, b.currency])).rows[0];
    for (const it of b.items) {
      await c.query('INSERT INTO invoice_items (invoice_id, description, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [inv.id, it.description, it.quantity, it.unit_price]);
    }
    return { status: 201, body: { ...inv, ...invoiceTotals(b.items) } };
  });
  res.status(out.status).json(out.body);
});

r.get('/invoices', async (req, res) => {
  const s = scope(req.user);
  const { rows } = await query(
    `SELECT i.*, l.company, COALESCE(SUM(it.quantity * it.unit_price), 0) AS total,
            (i.status = 'unpaid' AND i.due_date < CURRENT_DATE) AS overdue
     FROM invoices i JOIN leads l ON l.id = i.lead_id LEFT JOIN invoice_items it ON it.invoice_id = i.id
     WHERE ${s.sql} GROUP BY i.id, l.company ORDER BY i.due_date`, s.params);
  res.json(rows);
});

r.get('/invoices/:id/pdf', async (req, res) => {
  const x = await loadInvoice(req.user, req.params.id);
  if (!x) return res.status(404).json({ error: 'Invoice not found' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${x.inv.number}.pdf"`).send(invoicePdf(x.inv, x.lead, x.items));
});

r.post('/invoices/:id/send', async (req, res) => {
  const x = await loadInvoice(req.user, req.params.id);
  if (!x) return res.status(404).json({ error: 'Invoice not found' });
  if (!x.lead.email) return res.status(400).json({ error: 'Client has no email address' });
  const { total } = invoiceTotals(x.items);
  const subject = `Invoice ${x.inv.number} from ClientDeck`;
  const info = await send({
    to: x.lead.email, subject,
    text: `Hi ${x.lead.contact_name.split(' ')[0]},\n\nPlease find invoice ${x.inv.number} for ${x.inv.currency} ${total.toFixed(2)} attached, due on ${String(x.inv.due_date).slice(0, 10)}.\n\nThank you!`,
    attachments: [{ filename: `${x.inv.number}.pdf`, content: invoicePdf(x.inv, x.lead, x.items), contentType: 'application/pdf' }],
  });
  await query('UPDATE invoices SET sent_at = now() WHERE id = $1', [x.inv.id]);
  await query("INSERT INTO email_log (lead_id, to_address, subject, kind, message_id) VALUES ($1,$2,$3,'invoice',$4)",
    [x.lead.id, x.lead.email, subject, info.messageId]);
  res.json({ sent_to: x.lead.email, subject, message_id: info.messageId, attachment_bytes: JSON.parse(info.message || '{}').attachments?.[0]?.content?.length ?? null });
});

r.post('/invoices/:id/paid', async (req, res) => {
  const x = await loadInvoice(req.user, req.params.id);
  if (!x) return res.status(404).json({ error: 'Invoice not found' });
  const { rows } = await query("UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *", [x.inv.id]);
  res.json(rows[0]);
});

// Email every client with an overdue, unpaid invoice.
r.post('/invoices/send-reminders', async (req, res) => {
  const s = scope(req.user);
  const { rows } = await query(
    `SELECT i.id, i.number, i.due_date, i.currency, l.id AS lead_id, l.email, l.contact_name,
            COALESCE(SUM(it.quantity * it.unit_price), 0) AS total
     FROM invoices i JOIN leads l ON l.id = i.lead_id LEFT JOIN invoice_items it ON it.invoice_id = i.id
     WHERE i.status = 'unpaid' AND i.due_date < CURRENT_DATE AND l.email IS NOT NULL AND ${s.sql}
     GROUP BY i.id, l.id`, s.params);
  for (const i of rows) {
    const subject = `Payment reminder: invoice ${i.number}`;
    const info = await send({ to: i.email, subject, text: `Hi ${i.contact_name.split(' ')[0]},\n\nInvoice ${i.number} for ${i.currency} ${Number(i.total).toFixed(2)} was due on ${String(i.due_date).slice(0, 10)}. Could you let us know when we can expect payment?\n\nThank you!` });
    await query("INSERT INTO email_log (lead_id, to_address, subject, kind, message_id) VALUES ($1,$2,$3,'payment-reminder',$4)", [i.lead_id, i.email, subject, info.messageId]);
  }
  res.json({ reminders_sent: rows.length, invoices: rows.map((i) => i.number) });
});

export default r;
