// Comparación de la app con el recálculo independiente (iter-12, T03, AC8): ejecuta
// `computeGroupElo` de la app sobre el mismo `rows.json` que `check_f28.py` y saca rating, liga y
// racha en curso por miembro. Uso: `ROWS=/ruta/rows.json npx tsx compare_app.ts`.
import { readFileSync } from "node:fs";
import { computeGroupElo } from "../../../src/domain/elo";

interface Row {
  match_id: string;
  ts: number;
  member: number;
  pl: number;
  st: number;
}

const rows: Row[] = JSON.parse(readFileSync(process.env.ROWS ?? "rows.json", "utf8"));
const groupRows = rows.map((r) => ({
  puuid: String(r.member),
  matchId: r.match_id,
  gameStartTimestamp: r.ts,
  gameCreation: r.ts,
  playerSubteamId: r.st,
  placement: r.pl,
  totalDamageDealtToChampions: 0,
}));
const keys = [...new Set(groupRows.map((r) => r.puuid))];
const elo = computeGroupElo(groupRows, keys, Date.now());
const out: Record<string, unknown> = {};
for (const s of elo.standings) {
  out[s.key] = {
    rating: Number(s.rating.toFixed(4)),
    league: s.league.name,
    streak: s.streak,
    games: s.games,
    history: s.history.map((m) => [
      m.matchId,
      Number(m.delta.toFixed(6)),
      m.streak,
    ]),
  };
}
console.log(JSON.stringify(out, null, 1));
