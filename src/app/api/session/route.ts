import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";
import { createSession, getSessionByToken, setSessionCookie, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await getSessionByToken(token);
  return NextResponse.json({
    brief: session?.brief ?? "",
    orgLabel: session?.org_label ?? "",
    hasSession: Boolean(session),
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const text = (form.get("text") as string) ?? "";
  const orgLabel = (form.get("orgLabel") as string) ?? "";
  const file = form.get("file") as File | null;

  let brief = text.trim();
  if (file) {
    const fileText = await file.text();
    brief = [brief, fileText.trim()].filter(Boolean).join("\n\n");
  }

  if (!brief) {
    return NextResponse.json({ error: "Briefing is empty." }, { status: 400 });
  }

  const db = getAdminClient();
  if (!db) {
    return NextResponse.json(
      { error: "Database not configured yet — set NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 }
    );
  }

  let token = req.cookies.get(SESSION_COOKIE)?.value;
  let session = await getSessionByToken(token);

  if (!session) {
    const created = await createSession(req.headers.get("user-agent"));
    if (!created) {
      return NextResponse.json({ error: "Could not create session." }, { status: 500 });
    }
    token = created.token;
  }

  const { error } = await db
    .from("sessions")
    .update({ brief, org_label: orgLabel || null, updated_at: new Date().toISOString() })
    .eq("token", token!);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, chars: brief.length });
  setSessionCookie(res, token!);
  return res;
}
