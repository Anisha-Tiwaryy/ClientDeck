// Nodemailer transport. With SMTP_HOST set it sends real email; otherwise it
// uses Nodemailer's JSON transport, which builds the full message (headers,
// attachments) without sending it. Tests and local runs use the JSON transport.
import nodemailer from 'nodemailer';

let transport;
export function getTransport() {
  if (transport) return transport;
  transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

export const FROM = process.env.MAIL_FROM || 'ClientDeck <no-reply@clientdeck.local>';

// Fill {{placeholders}} from the lead; unknown placeholders are reported, not sent blank.
export function render(text, data) {
  const missing = [];
  const out = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (data[k] === undefined || data[k] === null || data[k] === '') { missing.push(k); return `{{${k}}}`; }
    return String(data[k]);
  });
  return { text: out, missing };
}

export const TEMPLATES = {
  'first-touch': {
    subject: '{{company}}: cutting time spent on candidate admin',
    body: 'Hi {{first_name}},\n\nMany agencies with around {{team_size}} recruiters tell us {{pain_point}} slows them down. '
      + 'We help teams keep candidates, clients and job orders in one place so recruiters spend more time placing.\n\n'
      + 'Would a 20-minute call this week be useful?\n\nBest,\n{{rep_name}}',
  },
  'follow-up': {
    subject: 'Following up, {{first_name}}',
    body: 'Hi {{first_name}},\n\nThanks for your time on our call. As promised, here is how we handle {{pain_point}} for agencies '
      + 'moving off {{current_tool}}.\n\nHappy to answer anything before a demo.\n\nBest,\n{{rep_name}}',
  },
  'demo-invite': {
    subject: 'Demo for {{company}}: {{demo_time}}',
    body: 'Hi {{first_name}},\n\nYour product demo is booked for {{demo_time}} ({{timezone}}).\nJoin here: {{meeting_url}}\n\n'
      + 'Agenda: {{agenda}}\n\nSee you then,\n{{rep_name}}',
  },
};

export async function send({ to, subject, text, attachments }) {
  const info = await getTransport().sendMail({ from: FROM, to, subject, text, attachments });
  return info;
}
