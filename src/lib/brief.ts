// On-device session store. No server, no login — the briefing lives in this
// browser only and rides along with each /api/ask request.

export interface Source {
  id: string;
  name: string;
  kind: "pdf" | "text" | "image";
  text: string;
  pages?: number;
  ocrPages?: number;
}

export interface Session {
  label: string;
  notes: string;
  sources: Source[];
}

const KEY = "ca_session_v2";
const LEGACY_BRIEF = "ca_brief";
const LEGACY_ORG = "ca_org_label";

export const MAX_BRIEF_CHARS = 400_000;

export function emptySession(): Session {
  return { label: "", notes: "", sources: [] };
}

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Session>;
      return {
        label: s.label ?? "",
        notes: s.notes ?? "",
        sources: Array.isArray(s.sources) ? s.sources : [],
      };
    }
    const legacy = localStorage.getItem(LEGACY_BRIEF);
    if (legacy) return { label: localStorage.getItem(LEGACY_ORG) ?? "", notes: legacy, sources: [] };
  } catch {
    // storage unavailable or corrupt — start clean
  }
  return emptySession();
}

/** Returns false when the device refused to store it (quota / private mode). */
export function saveSession(s: Session): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.removeItem(LEGACY_BRIEF);
    localStorage.removeItem(LEGACY_ORG);
    return true;
  } catch {
    return false;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_BRIEF);
    localStorage.removeItem(LEGACY_ORG);
  } catch {
    // nothing to do
  }
}

export function hasContent(s: Session): boolean {
  return Boolean(s.notes.trim()) || s.sources.some((x) => x.text.trim());
}

export function composeBrief(s: Session): string {
  const parts: string[] = [];
  if (s.label.trim()) parts.push(`SESSION: ${s.label.trim()}`);
  if (s.notes.trim()) parts.push(`NOTES FROM THE AGENT:\n${s.notes.trim()}`);
  for (const src of s.sources) {
    if (src.text.trim()) parts.push(`DOCUMENT: ${src.name}\n${src.text.trim()}`);
  }
  return parts.join("\n\n---\n\n");
}

export function countWords(text: string): number {
  const m = text.match(/\S+/g);
  return m ? m.length : 0;
}
