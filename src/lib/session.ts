// Per-device session: a random token in a cookie, backed by a `sessions` row
// holding that device's briefing. No login — whoever holds the device/browser
// holds the session, same trust model as the tool itself (it's on the agent's
// own phone, mid-call).

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase";

export const SESSION_COOKIE = "ca_session";

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function deviceLabelFromUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/ipad/i.test(ua)) return "iPad";
  if (/iphone/i.test(ua)) return "iPhone";
  if (/android/i.test(ua)) return "Android";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows PC";
  return "Unknown device";
}

export async function createSession(userAgent: string | null): Promise<{ id: string; token: string } | null> {
  const db = getAdminClient();
  if (!db) return null;
  const token = randomToken();
  const { data, error } = await db
    .from("sessions")
    .insert({ token, device_label: deviceLabelFromUA(userAgent), user_agent: userAgent })
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: data.id as string, token };
}

export async function getSessionByToken(token: string | undefined) {
  if (!token) return null;
  const db = getAdminClient();
  if (!db) return null;
  const { data } = await db
    .from("sessions")
    .select("id, token, org_label, brief, created_at, updated_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  return data ?? null;
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
