import { cookies } from "next/headers";
import { getSessionByToken, SESSION_COOKIE } from "@/lib/session";
import { dbConfigured } from "@/lib/supabase";
import Shell from "@/components/Shell";

export default async function Home() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = dbConfigured ? await getSessionByToken(token) : null;

  return (
    <Shell
      initialBrief={session?.brief ?? ""}
      initialOrgLabel={session?.org_label ?? ""}
      dbConfigured={dbConfigured}
    />
  );
}
