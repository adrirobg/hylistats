import { MatchDto } from "@/lib/riot/schemas";
import { listMatchFixtureIds, readFixtureText } from "./riot";

// Helpers para tests del dominio (ingesta y stats) a partir de las partidas reales de
// `tests/fixtures/matches/`. Sin red ni key. El jugador de prueba es `anon-puuid-self`.

export const SELF_PUUID = "anon-puuid-self";

export interface MatchFixture {
  id: string;
  /** JSON original tal cual está en disco (lo que devolvería `getMatch().raw`). */
  raw: string;
  match: MatchDto;
}

/** Las partidas grabadas, ordenadas por id (= cronológico ascendente). */
export function loadMatchFixtures(): MatchFixture[] {
  return listMatchFixtureIds().map((id) => {
    const raw = readFixtureText(`matches/${id}.json`);
    return { id, raw, match: MatchDto.parse(JSON.parse(raw)) };
  });
}

/** Vista laxa del JSON crudo de una partida, solo lo que los tests modifican. */
export interface FixtureJson {
  metadata: { matchId: string };
  info: {
    queueId: number;
    gameCreation: number;
    participants: Array<{
      puuid: string;
      placement: number;
      playerSubteamId: number;
      win: boolean;
      subteamPlacement?: number;
    }>;
  };
}

/**
 * Copia de una partida real con otro `matchId` y los cambios de `mutate` (p. ej. otra cola, otra
 * fecha o un puesto distinto). Devuelve el DTO ya validado y su JSON crudo, como `getMatch`.
 */
export function variantOf(
  fixture: MatchFixture,
  matchId: string,
  mutate?: (json: FixtureJson) => void,
): { match: MatchDto; raw: string } {
  const json = JSON.parse(fixture.raw) as FixtureJson;
  json.metadata.matchId = matchId;
  mutate?.(json);
  return { match: MatchDto.parse(json), raw: JSON.stringify(json) };
}

function setPlacement(
  participant: FixtureJson["info"]["participants"][number],
  placement: number,
) {
  participant.placement = placement;
  if (participant.subteamPlacement !== undefined) {
    participant.subteamPlacement = placement;
  }
  // `win` es true para los puestos 1-3 (no significa 1º).
  participant.win = placement <= 3;
}

/**
 * Deja al trío de `puuid` en 1º puesto y da al trío que ganó de verdad el puesto que tenía
 * `puuid`, de modo que la partida siga teniendo un único 1º (la muestra real no contiene 1º
 * del jugador de prueba).
 */
export function promoteTrioToFirst(json: FixtureJson, puuid: string): void {
  const self = json.info.participants.find((p) => p.puuid === puuid);
  if (!self) throw new Error(`${puuid} no juega esta partida`);
  const previous = self.placement;
  const subteam = self.playerSubteamId;
  for (const participant of json.info.participants) {
    if (participant.playerSubteamId === subteam) setPlacement(participant, 1);
    else if (participant.placement === 1) setPlacement(participant, previous);
  }
}
