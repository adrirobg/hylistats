import { Client } from "pg";
import { type Db, getDb } from "@/db";
import { getSeasonStart } from "@/lib/config";
import { getRiotClient, type RiotApi } from "@/lib/riot/client";
import { getRiotApiKey } from "@/lib/riot/key";
import { sleep as realSleep } from "@/lib/riot/limiter";
import { onWake, wakeSeq } from "./queue";
import {
  markKeyOk,
  markKeyUnknown,
  readKeyState,
  runNextStep,
  safeErrorMessage,
} from "./steps";

// Worker único en el proceso de Next (stack.md §3(a), §7): bucle de `runNextStep` con la cola
// en BD, protegido por `pg_try_advisory_lock` para que un solape de despliegues no arranque dos.
// Estado, señal de despertar y guard de arranque viven en `globalThis` (las rutas de Next e
// `instrumentation.ts` pueden cargar copias distintas de este módulo).

/** Sin trabajo: se duerme hasta 2 s o hasta `wakeWorker()`. */
export const IDLE_WAIT_MS = 2_000;
/** En pausa (key rechazada): se consulta `settings` cada 10 s o al recibir `wakeWorker()`. */
export const PAUSED_WAIT_MS = 10_000;
/** Otro proceso tiene el lock: se reintenta cada 15 s. */
export const LOCK_RETRY_MS = 15_000;
/** Error inesperado en el bucle (p. ej. BD caída): espera creciente de 5 s a 1 min. */
export const ERROR_WAIT_MS = 5_000;
export const ERROR_WAIT_MAX_MS = 60_000;
/** Clave del advisory lock del worker (bigint): "hylistat" en ASCII. */
export const WORKER_LOCK_KEY = "7528167452290867572";

export type WorkerState =
  | "starting"
  | "waiting_lock"
  | "running"
  | "idle"
  | "paused"
  | "stopped";

/** Estado para `/api/health`: sin key ni puuids. */
export interface WorkerStatus {
  state: WorkerState;
  lastActivityAt: Date | null;
  currentJobId: number | null;
  lastError: string | null;
}

export type TickResult = "worked" | "idle" | "paused";

/** Advisory lock en una conexión dedicada: se libera solo si esa conexión cae. */
export interface WorkerLock {
  /** `false` si la conexión que lo sostiene se perdió (otro proceso podría tenerlo ya). */
  isHeld(): boolean;
  release(): Promise<void>;
}

export interface WorkerDeps {
  db: Db;
  riot: RiotApi;
  /** Epoch en ms. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Si se pasa, el bucle se detiene en cuanto el lock deja de estar en su poder. */
  lock?: WorkerLock;
  seasonStart?: Date;
  log?: (message: string) => void;
}

export interface Worker {
  /** Un paso de trabajo. */
  tick(): Promise<TickResult>;
  /** Bucle hasta `stop()` (o hasta perder el lock). */
  run(): Promise<void>;
  /** Termina el paso en curso y sale del bucle. */
  stop(): Promise<void>;
}

const defaultLog = (message: string) => console.log(`[worker] ${message}`);

// --- Estado en `globalThis` --------------------------------------------------------------

interface Runtime {
  promise?: Promise<void>;
  stopping: boolean;
  worker?: Worker;
  /** Despierta una espera del supervisor (lock) para que `stopWorker` no espere 15 s. */
  interrupt?: () => void;
  signalsInstalled: boolean;
}

const globalForWorker = globalThis as typeof globalThis & {
  __hylistatsWorkerStatus?: WorkerStatus;
  __hylistatsWorkerRuntime?: Runtime;
};

function statusRef(): WorkerStatus {
  globalForWorker.__hylistatsWorkerStatus ??= {
    state: "stopped",
    lastActivityAt: null,
    currentJobId: null,
    lastError: null,
  };
  return globalForWorker.__hylistatsWorkerStatus;
}

function setStatus(patch: Partial<WorkerStatus>): void {
  Object.assign(statusRef(), patch);
}

/** Copia del estado del worker de este proceso (`stopped` si no se ha arrancado). */
export function getWorkerStatus(): WorkerStatus {
  return { ...statusRef() };
}

function getRuntime(): Runtime {
  globalForWorker.__hylistatsWorkerRuntime ??= {
    stopping: false,
    signalsInstalled: false,
  };
  return globalForWorker.__hylistatsWorkerRuntime;
}

// --- Worker --------------------------------------------------------------------------------

/** Envuelve el cliente para saber si una petición a Riot salió bien (la key funciona). */
function withSuccessHook(riot: RiotApi, onSuccess: () => void): RiotApi {
  const track =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const result = await fn(...args);
      onSuccess();
      return result;
    };
  return {
    getAccountByRiotId: track(riot.getAccountByRiotId.bind(riot)),
    getMatchIds: track(riot.getMatchIds.bind(riot)),
    getMatch: track(riot.getMatch.bind(riot)),
    getPlayerData: track(riot.getPlayerData.bind(riot)),
    validateKey: riot.validateKey.bind(riot),
  };
}

/**
 * Worker sobre una BD y un cliente Riot inyectados. Máquina de estados de la key (stack §7.1):
 * `ok` --401/403--> `invalid` (pausa: sin llamadas a Riot) --key nueva--> `ok`. En pausa, cada
 * `tick` solo lee `settings` y se reanuda si `keyStatus = 'ok'` o `updatedAt` cambió desde la
 * pausa (lo que hace `/admin` al guardar una key). `wakeWorker()` adelanta esa comprobación,
 * pero por sí sola no reanuda: así registrar perfiles o pulsar "Actualizar" con la key caducada
 * no gasta peticiones que van a dar 401.
 */
export function createWorker(deps: WorkerDeps): Worker {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const log = deps.log ?? defaultLog;
  const seasonStart = deps.seasonStart ?? getSeasonStart();

  let riotSucceeded = false;
  const riot = withSuccessHook(deps.riot, () => {
    riotSucceeded = true;
  });

  let initialized = false;
  let pause: { baseline: Date } | null = null;
  let keyConfirmed = false;
  let stopping = false;
  let running: Promise<void> | null = null;
  let interrupt: (() => void) | null = null;

  async function init() {
    const key = await readKeyState(deps.db);
    let keyStatus = key.keyStatus;
    if (keyStatus === "invalid") {
      // Sin key en BD la key sale de `RIOT_API_KEY`: un reinicio puede traer una nueva en el
      // entorno, así que se reprueba una vez (si sigue mal, vuelve a pausar). Con una key
      // guardada desde `/admin` se mantiene la pausa hasta que se guarde otra.
      const current = await getRiotApiKey(deps.db);
      if (
        current?.source !== "db" &&
        (await markKeyUnknown(deps.db, new Date(now())))
      ) {
        keyStatus = "unknown";
        log(
          "la key del entorno estaba marcada como inválida: se reprueba una vez",
        );
      } else {
        pause = { baseline: key.updatedAt };
        log("la key está marcada como inválida: arranca en pausa");
      }
    }
    keyConfirmed = keyStatus === "ok";
    initialized = true;
  }

  async function tick(): Promise<TickResult> {
    if (!initialized) await init();

    if (pause) {
      const key = await readKeyState(deps.db);
      const changed = key.updatedAt.getTime() > pause.baseline.getTime();
      if (key.keyStatus !== "ok" && !changed) {
        setStatus({ state: "paused" });
        return "paused";
      }
      pause = null;
      keyConfirmed = key.keyStatus === "ok";
      setStatus({ lastError: null });
      log("key actualizada: se reanuda");
    }

    riotSucceeded = false;
    const result = await runNextStep({
      db: deps.db,
      riot,
      now,
      seasonStart,
      log,
    });

    if (result.outcome === "paused") {
      pause = { baseline: result.baseline };
      keyConfirmed = false;
      setStatus({
        state: "paused",
        currentJobId: result.jobId,
        lastError: result.reason,
        lastActivityAt: new Date(now()),
      });
      return "paused";
    }
    if (result.outcome === "idle") {
      if (statusRef().state !== "idle") log("sin trabajo pendiente");
      setStatus({ state: "idle", currentJobId: null });
      return "idle";
    }
    if (riotSucceeded && !keyConfirmed) {
      await markKeyOk(deps.db, new Date(now()));
      keyConfirmed = true;
    }
    setStatus({
      state: "running",
      currentJobId: result.jobId,
      lastActivityAt: new Date(now()),
    });
    return "worked";
  }

  /** Espera `ms`, o hasta `wakeWorker()`, o hasta `stop()`. */
  function wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        unsubscribe();
        interrupt = null;
        resolve();
      };
      const unsubscribe = onWake(finish);
      interrupt = finish;
      sleep(ms).then(finish, finish);
    });
  }

  async function loop() {
    setStatus({ state: "running" });
    let errorWait = ERROR_WAIT_MS;
    while (!stopping) {
      if (deps.lock && !deps.lock.isHeld()) {
        log("se perdió la conexión del lock: el bucle se detiene");
        break;
      }
      // Una señal que llegue durante el paso no se pierde: se compara el contador después.
      const seq = wakeSeq();
      let result: TickResult;
      try {
        result = await tick();
        errorWait = ERROR_WAIT_MS;
      } catch (error) {
        const message = safeErrorMessage(error);
        log(`error: ${message}`);
        setStatus({ lastError: message });
        await wait(errorWait);
        errorWait = Math.min(errorWait * 2, ERROR_WAIT_MAX_MS);
        continue;
      }
      if (stopping || result === "worked" || wakeSeq() !== seq) continue;
      await wait(result === "idle" ? IDLE_WAIT_MS : PAUSED_WAIT_MS);
    }
    setStatus({ state: "stopped", currentJobId: null });
  }

  return {
    tick,
    run() {
      running ??= loop().finally(() => {
        running = null;
      });
      return running;
    },
    async stop() {
      stopping = true;
      interrupt?.();
      await running;
    },
  };
}

// --- Advisory lock -------------------------------------------------------------------------

/**
 * `pg_try_advisory_lock` en una conexión propia (fuera del pool, para que el lock no se pierda
 * al devolver conexiones). `null` si otro proceso ya lo tiene. Postgres lo libera solo si la
 * conexión cae (p. ej. `kill -9` del proceso), así que no hace falta limpieza tras una caída.
 */
export async function acquireAdvisoryLock(
  connectionString: string,
): Promise<WorkerLock | null> {
  const client = new Client({ connectionString, keepAlive: true });
  let held = false;
  let ended = false;
  // Sin manejador, un error de una conexión ociosa tumbaría el proceso.
  client.on("error", () => {
    held = false;
  });
  client.on("end", () => {
    held = false;
    ended = true;
  });
  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1::bigint) as locked",
      [WORKER_LOCK_KEY],
    );
    held = result.rows[0]?.locked === true;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
  if (!held) {
    await client.end().catch(() => {});
    return null;
  }
  return {
    isHeld: () => held,
    async release() {
      const wasHeld = held;
      held = false;
      if (ended) return;
      if (wasHeld) {
        await client
          .query("select pg_advisory_unlock($1::bigint)", [WORKER_LOCK_KEY])
          .catch(() => {});
      }
      await client.end().catch(() => {});
    },
  };
}

// --- Arranque en el proceso de Next -------------------------------------------------------

export interface StartWorkerOptions {
  /** Por defecto, el cliente real (`getRiotClient()`). */
  riot?: RiotApi;
  /** Por defecto, `DATABASE_URL`. */
  connectionString?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  lockRetryMs?: number;
  /** Instalar los manejadores de SIGTERM/SIGINT (por defecto, sí). */
  handleSignals?: boolean;
  log?: (message: string) => void;
}

/** Espera del supervisor que `stopWorker()` puede interrumpir. */
function supervisorWait(
  runtime: Runtime,
  sleep: (ms: number) => Promise<void>,
  ms: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      runtime.interrupt = undefined;
      resolve();
    };
    runtime.interrupt = finish;
    sleep(ms).then(finish, finish);
  });
}

async function supervise(runtime: Runtime, options: StartWorkerOptions) {
  const log = options.log ?? defaultLog;
  const sleep = options.sleep ?? realSleep;
  const lockRetryMs = options.lockRetryMs ?? LOCK_RETRY_MS;
  if (options.handleSignals !== false) installSignalHandlers(log);

  setStatus({ state: "starting", currentJobId: null, lastError: null });
  log("arrancando");
  while (!runtime.stopping) {
    let lock: WorkerLock | null;
    try {
      const connectionString =
        options.connectionString ?? process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL no está definida");
      lock = await acquireAdvisoryLock(connectionString);
    } catch (error) {
      const message = safeErrorMessage(error);
      log(`no se pudo pedir el lock: ${message}`);
      setStatus({ state: "waiting_lock", lastError: message });
      await supervisorWait(runtime, sleep, lockRetryMs);
      continue;
    }
    if (!lock) {
      if (statusRef().state !== "waiting_lock") {
        log("otro proceso tiene el lock del worker: se reintenta");
      }
      setStatus({ state: "waiting_lock" });
      await supervisorWait(runtime, sleep, lockRetryMs);
      continue;
    }

    log("lock obtenido");
    try {
      const worker = createWorker({
        db: getDb(),
        riot: options.riot ?? getRiotClient(),
        now: options.now,
        sleep: options.sleep,
        lock,
        log,
      });
      runtime.worker = worker;
      if (!runtime.stopping) await worker.run();
    } finally {
      runtime.worker = undefined;
      await lock.release();
    }
  }
  setStatus({ state: "stopped", currentJobId: null });
  log("detenido");
}

/**
 * Arranca el worker en segundo plano (idempotente: guard en `globalThis`). Nunca rechaza: un
 * fallo de arranque (p. ej. `SEASON_START` inválida) queda en el log y en `getWorkerStatus()`.
 * `instrumentation.ts` lo llama sin `await`.
 */
export function startWorker(options: StartWorkerOptions = {}): Promise<void> {
  const runtime = getRuntime();
  if (runtime.promise) return runtime.promise;
  const log = options.log ?? defaultLog;
  runtime.stopping = false;
  runtime.promise = supervise(runtime, options).catch((error: unknown) => {
    const message = safeErrorMessage(error);
    log(`detenido por un error: ${message}`);
    setStatus({ state: "stopped", currentJobId: null, lastError: message });
  });
  return runtime.promise;
}

/** Para el worker (termina el paso en curso) y libera el lock. */
export async function stopWorker(): Promise<void> {
  const runtime = getRuntime();
  const running = runtime.promise;
  if (!running) return;
  runtime.stopping = true;
  runtime.interrupt?.();
  await runtime.worker?.stop();
  await running;
  runtime.promise = undefined;
}

function installSignalHandlers(log: (message: string) => void) {
  const runtime = getRuntime();
  if (runtime.signalsInstalled) return;
  runtime.signalsInstalled = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      log(`${signal}: parando el worker`);
      void stopWorker().finally(() => {
        // Con `next start` Next también atiende la señal y cierra el proceso. Si nadie más la
        // atiende, se vuelve a emitir para que el proceso termine como lo haría sin nosotros.
        if (process.listenerCount(signal) === 0) {
          process.kill(process.pid, signal);
        }
      });
    });
  }
}
