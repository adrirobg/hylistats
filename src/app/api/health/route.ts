import { count, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ACTIVE_SYNC_JOB_STATUSES, matchFetch, syncJobs } from "@/db/schema";
import { getKeyStatus } from "@/lib/admin/key-service";
import { getRiotMetrics } from "@/lib/riot/client";
import { getWorkerStatus } from "@/worker/main";
import { safeErrorMessage } from "@/worker/steps";

// Diagnóstico sin logs (stack.md §7 "Salud"): BD, worker, key, cola y métricas de Riot. Público
// y sin datos sensibles: nunca la key ni puuids (`key.source` solo dice de dónde sale).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let dbState: "ok" | "error" = "ok";
  let key: { status: string; since: Date | null; source: string } = {
    status: "unknown",
    since: null,
    source: "none",
  };
  let queue = { activeJobs: 0, pendingMatches: 0 };

  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    const [keyStatus, [jobs], [matches]] = await Promise.all([
      getKeyStatus(db),
      db
        .select({ n: count() })
        .from(syncJobs)
        .where(inArray(syncJobs.status, [...ACTIVE_SYNC_JOB_STATUSES])),
      db
        .select({ n: count() })
        .from(matchFetch)
        .where(eq(matchFetch.status, "pending")),
    ]);
    key = {
      status: keyStatus.status,
      since: keyStatus.since,
      source: keyStatus.source,
    };
    queue = { activeJobs: jobs.n, pendingMatches: matches.n };
  } catch (error) {
    dbState = "error";
    console.error(`[health] BD no accesible: ${safeErrorMessage(error)}`);
  }

  const ok = dbState === "ok";
  return Response.json(
    {
      ok,
      db: dbState,
      worker: getWorkerStatus(),
      key,
      queue,
      riot: getRiotMetrics(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
