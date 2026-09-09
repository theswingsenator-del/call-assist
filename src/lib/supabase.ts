import { createClient } from "@supabase/supabase-js";

// Fallback placeholders let the build succeed before real env vars are set;
// real requests still need NEXT_PUBLIC_SUPABASE_URL/ANON_KEY configured.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

// True once real env vars are set — routes skip DB calls when false
// so the app still works (in-memory only) before Supabase is wired up.
export const dbConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabase = createClient(url, anonKey);

// Server-only client using the service role key — all writes go through this,
// never the anon key from the browser. Falls back to anon key if service role
// isn't set yet so local dev still works against a fresh Supabase project.
export function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key);
}

export interface SessionRow {
  id: string;
  token: string;
  org_label: string | null;
  brief: string;
  created_at: string;
  updated_at: string;
}

export interface CallRow {
  id: string;
  session_id: string;
  question: string;
  answer: string;
  transcribe_ms: number | null;
  answer_ms: number | null;
  total_ms: number | null;
  created_at: string;
}
