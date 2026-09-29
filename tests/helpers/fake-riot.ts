import type { MatchIdsQuery, RiotApi } from "@/lib/riot/client";
import { RiotNotFoundError } from "@/lib/riot/errors";
import type { AccountDto, MatchDto, PlayerDataDto } from "@/lib/riot/schemas";
import { normalizeRiotId } from "@/worker/queue";
import { loadMatchFixtures, SELF_PUUID } from "./matches";
import { readFixtureJson } from "./riot";

// `RiotApi` falso para los tests del worker: sirve las partidas de `tests/fixtures/` (y las
// variantes que se añadan), sintetiza las páginas de ids a partir de ellas y registra cada
// llamada. Sin red ni key.

export type FakeMethod = "account" | "matchIds" | "match" | "playerData";

export interface FakeCall {
  method: FakeMethod;
  /** Riot ID (`account`), puuid (`matchIds`, `playerData`) o matchId (`match`). */
  arg: string;
  query?: MatchIdsQuery;
  priority: number;
}

export interface FakeRiot extends RiotApi {
  /** Todas las llamadas, en orden (también las que acaban en error). */
  calls: FakeCall[];
  /** Si devuelve un error, la llamada (ya registrada) lo lanza. */
  failWith?: (call: FakeCall) => Error | undefined;
  addMatch(entry: { match: MatchDto; raw: string }): void;
  addAccount(account: AccountDto): void;
  /** Sustituye el historial de ids de un jugador (ids solo para listar). */
  setMatchIds(puuid: string, ids: string[]): void;
  count(method: FakeMethod, arg?: string): number;
  /** matchIds pedidos a `getMatch`, en orden. */
  matchCalls(): string[];
}

export function createFakeRiot(
  options: { withFixtures?: boolean } = {},
): FakeRiot {
  const store = new Map<string, { match: MatchDto; raw: string }>();
  const accounts = new Map<string, AccountDto>();
  const idOverrides = new Map<string, string[]>();
  const calls: FakeCall[] = [];

  function addMatch(entry: { match: MatchDto; raw: string }) {
    store.set(entry.match.metadata.matchId, entry);
    for (const p of entry.match.info.participants) {
      const key = normalizeRiotId(p.riotIdGameName, p.riotIdTagline);
      if (!accounts.has(key)) {
        accounts.set(key, {
          puuid: p.puuid,
          gameName: p.riotIdGameName,
          tagLine: p.riotIdTagline,
        });
      }
    }
  }

  function addAccount(account: AccountDto) {
    accounts.set(normalizeRiotId(account.gameName, account.tagLine), account);
  }

  if (options.withFixtures !== false) {
    addAccount(readFixtureJson<AccountDto>("account.json"));
    for (const f of loadMatchFixtures()) addMatch(f);
  }

  const fake: FakeRiot = {
    calls,
    addMatch,
    addAccount,
    setMatchIds(puuid, ids) {
      idOverrides.set(puuid, ids);
    },
    count(method, arg) {
      return calls.filter(
        (c) => c.method === method && (arg === undefined || c.arg === arg),
      ).length;
    },
    matchCalls() {
      return calls.filter((c) => c.method === "match").map((c) => c.arg);
    },

    async getAccountByRiotId(gameName, tagLine, priority) {
      record({ method: "account", arg: `${gameName}#${tagLine}`, priority });
      const account = accounts.get(normalizeRiotId(gameName, tagLine));
      if (!account) throw notFound("/riot/account/v1/accounts/by-riot-id");
      return account;
    },

    async getMatchIds(puuid, query, priority) {
      record({ method: "matchIds", arg: puuid, query, priority });
      const override = idOverrides.get(puuid);
      const history =
        override ??
        [...store.values()]
          .filter(
            ({ match }) =>
              match.info.queueId === query.queue &&
              match.info.participants.some((p) => p.puuid === puuid) &&
              (query.startTime === undefined ||
                match.info.gameCreation >= query.startTime * 1000),
          )
          .sort(
            (a, b) =>
              b.match.info.gameCreation - a.match.info.gameCreation ||
              b.match.metadata.matchId.localeCompare(a.match.metadata.matchId),
          )
          .map(({ match }) => match.metadata.matchId);
      return history.slice(query.start, query.start + query.count);
    },

    async getMatch(matchId, priority) {
      record({ method: "match", arg: matchId, priority });
      const entry = store.get(matchId);
      if (!entry) throw notFound(`/lol/match/v5/matches/${matchId}`);
      return entry;
    },

    async getPlayerData(puuid, priority) {
      record({ method: "playerData", arg: puuid, priority });
      if (puuid === SELF_PUUID) {
        return readFixtureJson<PlayerDataDto>("player-data.json");
      }
      return { challenges: [] };
    },

    async validateKey() {
      return "ok";
    },
  };

  function record(call: FakeCall) {
    calls.push(call);
    const error = fake.failWith?.(call);
    if (error) throw error;
  }

  return fake;
}

function notFound(path: string) {
  return new RiotNotFoundError({ host: "europe", path, status: 404 });
}
