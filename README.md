# ClientDeck

ClientDeck is a sales CRM for a SaaS sales team that sells to recruitment agencies. It takes a lead from first contact to paid invoice in one place: qualify the lead, work a multi-channel follow-up cadence (calls, emails, LinkedIn), book and run Zoom demos, track the pipeline, then raise invoices once the deal is won.

![CI](https://github.com/Anisha-Tiwaryy/ClientDeck/actions/workflows/ci.yml/badge.svg)

![Today's follow-ups](docs/today.png)

## What it does

**1. Lead qualification.** Every lead gets a score out of 100 from what the rep learns in discovery: pain points (need), budget, whether they are talking to the decision maker (authority), when the agency plans to switch tools (timeline), and fit (team size, current tool). The score sets a tier: **Hot** (70+), **Warm** (40-69) or **Cold**, and the lead page shows exactly why ("Budget confirmed +20").

**2. Multi-channel follow-up cadences.** Starting a cadence creates dated tasks for that tier:

| Tier | Steps |
|---|---|
| Hot | Day 0 discovery call and recap email, day 2 LinkedIn, day 4 follow-up call, day 6 Zoom demo invite |
| Warm | Day 0 personalised email, day 2 call, day 5 LinkedIn, day 9 demo invite |
| Cold | Day 0 intro email, day 7 LinkedIn, day 21 check-in email |

Logging a call, email or LinkedIn touch completes the next open step on that channel. A reply or a booked demo stops the cadence, and "not now" pauses it. If new information moves a lead to another tier, its cadence is rebuilt.

**3. Calling windows in IST.** Calls are only scheduled 10:00-17:00 on weekdays in the lead's own time zone. Each window is converted to IST using the real time-zone rules, including daylight saving: New York is 20:30-03:30 IST in January and 19:30-02:30 IST in July. The Today page flags which leads can be called right now.

**4. Today's queue.** The Today page shows every touch due, hottest leads first and overdue items flagged, with one-click outcomes (Connected, No answer, Mark sent, Skip).

**5. Templated emails.** Templates (first touch, follow-up, demo invite) fill in the lead's name, team size, main pain point and current tool. If a field is missing, the email is blocked and the API names the field, so no email goes out with a blank or `{{placeholder}}` in it. Every email is logged.

**6. Zoom demos.** Booking a demo emails an invite showing the time in the lead's zone (the rep also sees it in IST), moves the lead to Demo Scheduled and stops the cadence. A reminder job emails anyone whose demo starts in the next 24 hours, exactly once. Marking a demo as held moves the lead to Demo Done.

**7. Pipeline, close and feedback.** There is a pipeline board by stage with territory, tier and search filters. Closing a lead as Lost requires a reason, and the reasons roll up into a "why we lose" report for the team.

**8. Projects and invoices for won clients.** Won clients get projects with deadlines and invoices with line items. Invoices are turned into PDFs with jsPDF and emailed with the PDF attached via Nodemailer. Each invoice is tracked as paid or unpaid, with automatic overdue detection and payment reminders. Only won clients can be invoiced.

**9. Reporting.** The dashboard shows:
- the funnel: how many leads reached each stage, and the conversion between stages
- response rate by channel
- demos booked and held
- win rate, lost reasons and pipeline by territory
- overdue follow-ups and unpaid invoices

**10. Roles.** Reps only see their own leads; managers see the whole team. Logins use JWT, and passwords are hashed with bcrypt.

![Dashboard](docs/dashboard.png)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Backend | Node.js 22, Express 5, Zod validation |
| Database | PostgreSQL 16 (plain SQL, transactions, `FILTER` aggregates) |
| Auth | JWT + bcrypt, rep and manager roles |
| Documents and email | jsPDF (server-side invoice PDFs), Nodemailer (SMTP, or JSON transport for local runs) |
| Tests and CI | Node test runner + Supertest against a real PostgreSQL database, GitHub Actions |

## Run it locally

You need Node.js 22 and PostgreSQL 16.

```bash
# 1. API
cd server
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npm install
npm run seed                  # creates the tables and 60 demo leads (wipes existing data)
npm start                     # http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Demo logins (password `password123`): `asha@clientdeck.demo` (rep) and `manager@clientdeck.demo` (manager).

Without `SMTP_HOST`, emails are fully built (headers, body and PDF attachment) by Nodemailer's JSON transport but not actually sent. Set the SMTP variables to send real email.

## Tests

```bash
cd server
DATABASE_URL=postgres://postgres:postgres@localhost:5432/clientdeck_test npm test
```

11 API tests run against a real PostgreSQL database. They cover:
- login, and reps not being able to see each other's leads
- qualification scores and tiers
- daylight-saving-correct IST calling windows
- cadence steps being completed by the right channel, and stopped by replies
- cadences being rebuilt when a lead changes tier
- the Today queue order
- emails blocked when a field is missing
- demo booking, reminders that send only once, and held demos moving the stage
- the lost-reason rule
- invoice PDFs (checked to be valid PDFs) emailed with the attachment, overdue reminders, and the funnel and win-rate figures

To check that the tests actually catch bugs, six deliberate bugs were added one at a time:
- reps seeing every lead
- logging an activity completing the wrong channel's step
- demo reminders sending twice
- time zones ignoring daylight saving
- cadences not being rebuilt after a tier change
- open leads being invoiced

The test suite failed for each one.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Leads | `GET/POST /api/leads`, `GET/PATCH /api/leads/:id`, `POST /api/leads/:id/stage`, `POST /api/leads/:id/cadence/start`, `POST /api/leads/:id/activities` |
| Work queue | `GET /api/tasks/today`, `POST /api/tasks/:id/skip` |
| Email | `GET /api/templates`, `POST /api/leads/:id/emails` |
| Demos | `POST /api/leads/:id/demos`, `PATCH /api/demos/:id`, `POST /api/demos/send-reminders` |
| Billing | `POST /api/leads/:id/projects`, `GET /api/projects`, `POST/GET /api/invoices`, `GET /api/invoices/:id/pdf`, `POST /api/invoices/:id/send`, `POST /api/invoices/:id/paid`, `POST /api/invoices/send-reminders` |
| Reports | `GET /api/reports/summary` |

## Project structure

```
server/
  src/schema.sql          tables: users, leads, stage_history, activities, tasks, demos, email_log, projects, invoices
  src/services/           qualify.js, cadence.js, time.js (IST windows), mailer.js, pdf.js
  src/routes/             leads.js, work.js (tasks, email, demos), billing.js, reports.js
  src/seed.js             60 demo recruitment-agency leads
  tests/api.test.js
client/
  src/pages/              Today, Pipeline, LeadDetail, NewLead, Dashboard, Invoices, Login
docs/                     screenshots
```

## Limitations

- The demo data is simulated, and the names and companies are invented.
- Email is not sent unless SMTP settings are provided. Zoom links are entered by hand; there is no Zoom API integration.
- The scheduled jobs (demo and payment reminders) are API endpoints, meant to be called by a cron job or a scheduler. No scheduler is bundled.
- The original plan used MongoDB and Firebase Auth. It was built on PostgreSQL and JWT instead, so every feature could be run and tested end to end.
