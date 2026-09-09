-- Call Assist schema.
-- One row per device/session brief, one row per question answered on a call.

create extension if not exists "pgcrypto";

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  org_label text,
  brief text not null default '',
  device_label text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists sessions_token_idx on sessions (token) where revoked_at is null;

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  question text not null,
  answer text not null,
  transcribe_ms int,
  answer_ms int,
  total_ms int,
  created_at timestamptz not null default now()
);

create index if not exists calls_session_idx on calls (session_id, created_at desc);

-- RLS stays off: all access goes through server-side API routes using the
-- service role key, never the anon key directly from the browser.
alter table sessions enable row level security;
alter table calls enable row level security;
