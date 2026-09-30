import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Estados como uniones cerradas: viven en la BD como `text` y se validan en TypeScript.
export const PROFILE_STATUSES = ["resolving", "active", "not_found"] as const;
export const SYNC_JOB_KINDS = ["backfill", "incremental"] as const;
export const SYNC_JOB_STATUSES = [
  "pending",
  "listing",
  "fetching",
  "done",
  "error",
] as const;
export const MATCH_FETCH_STATUSES = [
  "pending",
  "done",
  "missing",
  "error",
] as const;
export const KEY_STATUSES = ["unknown", "ok", "invalid"] as const;

/** Estados en los que un job cuenta como "activo" (índice único parcial por perfil). */
export const ACTIVE_SYNC_JOB_STATUSES = [
  "pending",
  "listing",
  "fetching",
] as const;

// `bytea` <-> `Buffer` (node-postgres ya lo entrega y lo acepta como Buffer).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

// Timestamps de Riot (epoch en ms) no caben en int4.
const epochMs = (name: string) => bigint(name, { mode: "number" });

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  region: text("region").notNull().default("euw"),
  // Forma canónica devuelta por Account-V1 una vez resuelto; al registrar, la tecleada.
  gameName: text("game_name").notNull(),
  tagLine: text("tag_line").notNull(),
  // `lower(gameName) + '#' + lower(tagLine)`: identidad primaria del perfil.
  riotIdNorm: text("riot_id_norm").notNull().unique(),
  // Caché re-resoluble (los PUUID están cifrados por key/proyecto).
  puuid: text("puuid").unique(),
  status: text("status", { enum: PROFILE_STATUSES })
    .notNull()
    .default("resolving"),
  // Challenge 602002 (control frente al cálculo propio).
  challengeValue: doublePrecision("challenge_value"),
  challengeLevel: text("challenge_level"),
  challengeCheckedAt: timestamptz("challenge_checked_at"),
  // Icono de perfil (Data Dragon); nullable hasta que se resuelva.
  profileIconId: integer("profile_icon_id"),
  lastSyncedAt: timestamptz("last_synced_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const matches = pgTable("matches", {
  matchId: text("match_id").primaryKey(),
  queueId: integer("queue_id").notNull(),
  gameCreation: epochMs("game_creation").notNull(),
  gameStartTimestamp: epochMs("game_start_timestamp").notNull(),
  gameEndTimestamp: epochMs("game_end_timestamp").notNull(),
  // Segundos.
  gameDuration: integer("game_duration").notNull(),
  gameVersion: text("game_version").notNull(),
  endOfGameResult: text("end_of_game_result"),
  // JSON crudo de la partida comprimido con gzip (opcional).
  rawGz: bytea("raw_gz"),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
});

export const participants = pgTable(
  "participants",
  {
    matchId: text("match_id")
      .notNull()
      .references(() => matches.matchId, { onDelete: "cascade" }),
    puuid: text("puuid").notNull(),
    participantId: integer("participant_id").notNull(),
    riotIdGameName: text("riot_id_game_name").notNull(),
    riotIdTagline: text("riot_id_tagline").notNull(),
    championId: integer("champion_id").notNull(),
    championName: text("champion_name").notNull(),
    // 1..6: puesto del equipo (1º = placement 1; `win` NO equivale a 1º).
    placement: integer("placement").notNull(),
    // Etiqueta arbitraria 1..6: mismos valores = compañeros.
    playerSubteamId: integer("player_subteam_id").notNull(),
    win: boolean("win").notNull(),
    // playerAugment1..6 (0 = vacío).
    augments: integer("augments")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    // item0..item6 (item6 = amuleto).
    items: integer("items").array().notNull().default(sql`'{}'::integer[]`),
    kills: integer("kills").notNull(),
    deaths: integer("deaths").notNull(),
    assists: integer("assists").notNull(),
    totalDamageDealtToChampions: integer(
      "total_damage_dealt_to_champions",
    ).notNull(),
    goldEarned: integer("gold_earned").notNull(),
    champLevel: integer("champ_level").notNull(),
    // Nullable: las filas anteriores se rellenan desde `matches.raw_gz` (db:backfill-columns).
    totalDamageTaken: integer("total_damage_taken"),
    largestKillingSpree: integer("largest_killing_spree"),
  },
  (t) => [
    primaryKey({ columns: [t.matchId, t.puuid] }),
    index("participants_puuid_idx").on(t.puuid),
  ],
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SYNC_JOB_KINDS }).notNull(),
    interactive: boolean("interactive").notNull().default(false),
    status: text("status", { enum: SYNC_JOB_STATUSES })
      .notNull()
      .default("pending"),
    // matchIds de la temporada del perfil, más reciente primero.
    matchIds: text("match_ids").array().notNull().default(sql`'{}'::text[]`),
    totalIds: integer("total_ids").notNull().default(0),
    fetched: integer("fetched").notNull().default(0),
    // Índice en `ARENA_QUEUE_IDS` de la cola que se está listando (`listCursor` es su paginación).
    listQueueIndex: integer("list_queue_index").notNull().default(0),
    listCursor: integer("list_cursor").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextRunAt: timestamptz("next_run_at"),
    // Round-robin entre perfiles.
    lastServedAt: timestamptz("last_served_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    startedAt: timestamptz("started_at"),
    finishedAt: timestamptz("finished_at"),
  },
  (t) => [
    // Un solo job activo por perfil.
    uniqueIndex("sync_jobs_one_active_per_profile_idx")
      .on(t.profileId)
      .where(sql`${t.status} in ('pending', 'listing', 'fetching')`),
    index("sync_jobs_status_idx").on(t.status),
  ],
);

// Cola de detalle única global por matchId (una partida compartida se pide una sola vez).
export const matchFetch = pgTable("match_fetch", {
  matchId: text("match_id").primaryKey(),
  status: text("status", { enum: MATCH_FETCH_STATUSES })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamptz("next_attempt_at"),
  lastError: text("last_error"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Fila única (id = 1): key de Riot en BD y estado de la key (ver stack.md §7.1).
export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    riotApiKey: text("riot_api_key"),
    keyStatus: text("key_status", { enum: KEY_STATUSES })
      .notNull()
      .default("unknown"),
    keyStatusSince: timestamptz("key_status_since"),
    keyStatusReason: text("key_status_reason"),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

// Grupo fijo (F19): lista de perfiles miembros. Un perfil es miembro como mucho una vez (PK).
export const groupMembers = pgTable("group_members", {
  profileId: integer("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  addedAt: timestamptz("added_at").notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Match = typeof matches.$inferSelect;
export type NewMatch = typeof matches.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
export type MatchFetch = typeof matchFetch.$inferSelect;
export type NewMatchFetch = typeof matchFetch.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
