// On-device briefing store. No server, no login — the brief lives in this
// browser only and rides along with each /api/ask request.

const BRIEF_KEY = "ca_brief";
const ORG_KEY = "ca_org_label";

export interface StoredBrief {
  brief: string;
  orgLabel: string;
}

export function loadBrief(): StoredBrief {
  if (typeof window === "undefined") return { brief: "", orgLabel: "" };
  try {
    return {
      brief: localStorage.getItem(BRIEF_KEY) ?? "",
      orgLabel: localStorage.getItem(ORG_KEY) ?? "",
    };
  } catch {
    return { brief: "", orgLabel: "" };
  }
}

export function saveBrief({ brief, orgLabel }: StoredBrief) {
  try {
    localStorage.setItem(BRIEF_KEY, brief);
    localStorage.setItem(ORG_KEY, orgLabel);
  } catch {
    // private mode / storage disabled — brief stays in memory for this session only
  }
}

export function clearBrief() {
  try {
    localStorage.removeItem(BRIEF_KEY);
    localStorage.removeItem(ORG_KEY);
  } catch {
    // nothing to do
  }
}
