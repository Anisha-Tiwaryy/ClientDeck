-- ClientDeck schema: users, leads (prospects and clients), activities across
-- channels, follow-up tasks (the cadence), demos, email log, projects, invoices.
DROP TABLE IF EXISTS invoice_items, invoices, projects, email_log, demos, tasks, activities, stage_history, leads, users CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('rep', 'manager')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id              SERIAL PRIMARY KEY,
  owner_id        INT NOT NULL REFERENCES users(id),
  company         TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  contact_title   TEXT,
  email           TEXT,
  phone           TEXT,
  linkedin_url    TEXT,
  country         TEXT,
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',   -- IANA zone, used for call windows
  territory       TEXT NOT NULL CHECK (territory IN ('North America', 'Europe', 'APAC')),
  source          TEXT NOT NULL DEFAULT 'outbound' CHECK (source IN ('outbound', 'inbound', 'referral', 'event')),
  team_size       INT,                 -- number of recruiters at the agency
  current_tool    TEXT,                -- e.g. Spreadsheets, Bullhorn, Zoho Recruit
  pain_points     TEXT[] NOT NULL DEFAULT '{}',
  is_decision_maker BOOLEAN NOT NULL DEFAULT false,
  budget_confirmed  BOOLEAN NOT NULL DEFAULT false,
  timeline_months INT,                 -- when they plan to switch tools
  needs_notes     TEXT,
  score           INT NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'Cold' CHECK (tier IN ('Hot', 'Warm', 'Cold')),
  stage           TEXT NOT NULL DEFAULT 'New' CHECK (stage IN
                  ('New', 'Contacted', 'Qualified', 'Demo Scheduled', 'Demo Done', 'Proposal', 'Won', 'Lost')),
  lost_reason     TEXT,
  cadence_status  TEXT NOT NULL DEFAULT 'none' CHECK (cadence_status IN ('none', 'active', 'paused', 'completed', 'stopped')),
  last_contacted_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX leads_owner_stage ON leads(owner_id, stage);

CREATE TABLE stage_history (
  id         SERIAL PRIMARY KEY,
  lead_id    INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage   TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id          SERIAL PRIMARY KEY,
  lead_id     INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id),
  channel     TEXT NOT NULL CHECK (channel IN ('Call', 'Email', 'LinkedIn', 'Zoom demo', 'Note')),
  outcome     TEXT NOT NULL CHECK (outcome IN
              ('Connected', 'No answer', 'Voicemail', 'Sent', 'Replied - interested', 'Replied - not now',
               'Replied - not interested', 'Demo booked', 'Demo held', 'Note')),
  notes       TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead ON activities(lead_id, occurred_at);

CREATE TABLE tasks (
  id           SERIAL PRIMARY KEY,
  lead_id      INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step         INT NOT NULL,
  channel      TEXT NOT NULL,
  purpose      TEXT NOT NULL,
  due_at       TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'skipped')),
  completed_at TIMESTAMPTZ,
  UNIQUE (lead_id, step)
);
CREATE INDEX tasks_due ON tasks(status, due_at);

CREATE TABLE demos (
  id            SERIAL PRIMARY KEY,
  lead_id       INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  duration_min  INT NOT NULL DEFAULT 30,
  meeting_url   TEXT NOT NULL,
  agenda        TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'no-show', 'cancelled')),
  feedback      TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE email_log (
  id         SERIAL PRIMARY KEY,
  lead_id    INT REFERENCES leads(id) ON DELETE CASCADE,
  to_address TEXT NOT NULL,
  subject    TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- follow-up, demo-invite, demo-reminder, invoice, payment-reminder
  message_id TEXT,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id         SERIAL PRIMARY KEY,
  lead_id    INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'completed')),
  deadline   DATE
);

CREATE TABLE invoices (
  id         SERIAL PRIMARY KEY,
  number     TEXT NOT NULL UNIQUE,
  lead_id    INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  project_id INT REFERENCES projects(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date   DATE NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'USD',
  status     TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at    TIMESTAMPTZ,
  sent_at    TIMESTAMPTZ
);

CREATE TABLE invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);
