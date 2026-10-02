import { asc, count, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  groupMembers,
  matches,
  participants,
  profiles,
  syncJobs,
} from "@/db/schema";

// Reseteo de datos al cambiar de key/proyecto de Riot: los PUUID van cifrados por key, así que
// los guardados dejan de casar con los que devuelve la key nueva (I1 §11).
//
// - Completo: vacía todo salvo `settings` (key) y las migraciones. Para la BD de desarrollo.
// - `keepProfiles`: vacía partidas y cola, pero conserva perfiles (con sus ids, URL, icono y
//   contador 602002), `group_members` y `settings`. Los perfiles se quedan sin PUUID y con un
//   job `backfill` encolado: el worker vuelve a resolver el Riot ID con la key vigente
//   (`resolveAccount`) y descarga la temporada de nuevo.
//
// Nada de esto sale con PUUID: el resumen solo lleva Riot IDs y recuentos.

/** Corrección de Riot ID: el perfil se registró con un nombre y en su última partida tenía otro. */
export interface RiotIdChange {
  profileId: number;
  from: string;
  to: string;
  gameName: string;
  tagLine: string;
}

export interface ResetProfileSummary {
  id: number;
  riotId: string;
  status: string;
  member: boolean;
  /** Partidas del perfil guardadas (filas de `participants` con su PUUID). */
  matches: number;
  challengeValue: number | null;
}

export interface ResetSummary {
  profiles: ResetProfileSummary[];
  members: number;
  matches: number;
  syncJobs: number;
  /** Riot IDs que `keepProfiles` corregirá antes de borrar las partidas. */
  riotIdChanges: RiotIdChange[];
}

export interface ResetResult {
  riotIdChanges: RiotIdChange[];
  /** Jobs `backfill` encolados (uno por perfil; 0 en el reseteo completo). */
  backfillJobs: number;
}

const riotIdOf = (gameName: string, tagLine: string) =>
  `${gameName}#${tagLine}`;

/**
 * Riot ID de la partida más reciente de cada perfil cuando no coincide con el guardado.
 *
 * El worker nunca actualiza el nombre de un perfil ya resuelto: con PUUID no le hace falta. Pero
 * al vaciar el PUUID, `resolveAccount` lo vuelve a pedir por Riot ID, y con un nombre antiguo
 * Riot responde 404 y el perfil acabaría en `not_found`. Cada partida guarda el Riot ID que el
 * jugador tenía ese día, así que la más reciente da el vigente.
 */
async function findRiotIdChanges(
  db: Pick<Db, "execute">,
): Promise<RiotIdChange[]> {
  const result = await db.execute<{
    id: number;
    game_name: string;
    tag_line: string;
    last_game_name: string;
    last_tag_line: string;
  }>(sql`
    select distinct on (p.id)
      p.id, p.game_name, p.tag_line,
      pa.riot_id_game_name as last_game_name, pa.riot_id_tagline as last_tag_line
    from ${profiles} p
    join ${participants} pa on pa.puuid = p.puuid
    join ${matches} m on m.match_id = pa.match_id
    order by p.id, m.game_end_timestamp desc`);
  return result.rows
    .filter(
      (row) =>
        row.last_game_name.trim() !== "" &&
        row.last_tag_line.trim() !== "" &&
        (row.last_game_name !== row.game_name ||
          row.last_tag_line !== row.tag_line),
    )
    .map((row) => ({
      profileId: row.id,
      from: riotIdOf(row.game_name, row.tag_line),
      to: riotIdOf(row.last_game_name, row.last_tag_line),
      gameName: row.last_game_name,
      tagLine: row.last_tag_line,
    }));
}

/** Foto previa (solo lectura): lo que hay y lo que `keepProfiles` corregiría. */
export async function summarizeReset(db: Db): Promise<ResetSummary> {
  const rows = await db
    .select({
      id: profiles.id,
      gameName: profiles.gameName,
      tagLine: profiles.tagLine,
      status: profiles.status,
      member: sql<boolean>`${groupMembers.profileId} is not null`,
      challengeValue: profiles.challengeValue,
      matches: sql<number>`(select count(*) from ${participants} pa where pa.puuid = ${profiles.puuid})::int`,
    })
    .from(profiles)
    .leftJoin(groupMembers, eq(groupMembers.profileId, profiles.id))
    .orderBy(asc(profiles.id));

  const [[matchCount], [jobCount], riotIdChanges] = await Promise.all([
    db.select({ n: count() }).from(matches),
    db.select({ n: count() }).from(syncJobs),
    findRiotIdChanges(db),
  ]);

  return {
    profiles: rows.map((row) => ({
      id: row.id,
      riotId: riotIdOf(row.gameName, row.tagLine),
      status: row.status,
      member: row.member,
      matches: row.matches,
      challengeValue: row.challengeValue,
    })),
    members: rows.filter((row) => row.member).length,
    matches: matchCount?.n ?? 0,
    syncJobs: jobCount?.n ?? 0,
    riotIdChanges,
  };
}

/**
 * Reseteo en una sola transacción.
 *
 * Con `keepProfiles`, `TRUNCATE` sin `CASCADE`: si algún día otra tabla referencia a las que se
 * vacían, falla en lugar de vaciarla en silencio. Tampoco se reinicia la secuencia de
 * `sync_jobs`: el worker puede estar a mitad de un paso mientras se resetea (en producción sigue
 * vivo), y una escritura tardía sobre un job viejo no debe caer en uno nuevo con el mismo id.
 */
export async function resetData(
  db: Db,
  options: { keepProfiles: boolean },
): Promise<ResetResult> {
  if (!options.keepProfiles) {
    await db.execute(
      sql`TRUNCATE participants, matches, match_fetch, sync_jobs, profiles RESTART IDENTITY CASCADE`,
    );
    return { riotIdChanges: [], backfillJobs: 0 };
  }

  return db.transaction(async (tx) => {
    // Antes de vaciar `participants`: es de donde sale el Riot ID vigente.
    const riotIdChanges = await findRiotIdChanges(tx);
    for (const { profileId, gameName, tagLine } of riotIdChanges) {
      await tx
        .update(profiles)
        .set({ gameName, tagLine })
        .where(eq(profiles.id, profileId));
    }

    await tx.execute(
      sql`TRUNCATE participants, matches, match_fetch, sync_jobs`,
    );
    await tx
      .update(profiles)
      .set({ puuid: null, status: "resolving", lastSyncedAt: null });
    const jobs = await tx.execute(sql`
      insert into ${syncJobs} (profile_id, kind, interactive)
      select id, 'backfill', false from ${profiles} order by id`);

    return { riotIdChanges, backfillJobs: jobs.rowCount ?? 0 };
  });
}
