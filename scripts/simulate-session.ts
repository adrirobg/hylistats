import { parseArgs } from "node:util";
import {
  buildReport,
  initialOffset,
  isPageRender,
  type Mode,
  nextTab,
  type Options,
  PENDING_CONTRACT_MESSAGE,
  pageUrl,
  parseOptions,
  type RawArgs,
  type Report,
  type RequestKind,
  readVersion,
  refreshPollers,
  type Sample,
  STATUS_POLL_MS,
  type Stat,
  shouldRepaint,
  statusUrl,
  type Tab,
  UsageError,
} from "./session-sim-model";

// Sesión simulada: N visores contra una URL base, para medir cuánta carga de servidor genera el
// polling y si aparece algún 5xx (los 502 del 2026-10-02 en producción). Sin dependencias: `fetch`
// de Node. Lógica pura en `session-sim-model.ts` (con tests).
//
// Uso: npm run sim:session -- --base-url http://localhost:3108 --slugs "Hylimichi#EUW,Azpekaa#EUW" \
//        [--clients 5] [--duration 15] [--mode antes|despues] [--start-tab grupo] \
//        [--switch-every 30] [--tabs campeones,resumen,...] [--timeout 60] [--no-rsc] \
//        [--status-path /api/... --version-field ...]
//
//   --base-url      origen sin ruta (por defecto http://localhost:3000).
//   --slugs         perfiles a visitar, `Nombre#TAG` o slug; los clientes los reparten por turnos.
//   --clients       visores simulados (5).
//   --duration      minutos (15; admite decimales).
//   --mode          `antes`: imita `develop` (`router.refresh()` = petición RSC de la página entera
//                   cada 30 s por poller: `AutoRefresh` siempre y `GroupFreshness` además en la
//                   pestaña Grupo). `despues`: consulta el estado cada 10 s y pide la página solo
//                   si cambia la versión (necesita el contrato de T02: --status-path y
//                   --version-field, o rellenar STATUS_CONTRACT en session-sim-model.ts).
//   --start-tab     pestaña inicial de todos los clientes (grupo).
//   --switch-every  segundos entre cambios de pestaña de cada cliente (30; 0 = no cambian, que es
//                   lo que se usa para "N clientes en la pestaña Grupo en reposo").
//   --timeout       segundos de timeout por petición (60); un timeout cuenta como fallo.
//   --no-rsc        navegaciones y refrescos como GET de HTML en vez de petición RSC.
//
// Para al primer 5xx o fallo de red (lo informa) y sale con código 2. Lo que NO simula:
//   - "Actualizar grupo" es una server action (no se puede llamar con `fetch` simple): se pulsa a
//     mano desde una pestaña real a mitad de la prueba y se observa el efecto en el resumen.
//   - Las comprobaciones de frescura cada 60 s del modo `antes` (`ensureFreshOnViewAction` y
//     `ensureGroupFreshAction`, también server actions): solo consultan la BD propia.
// No lo lances contra producción sin el sí del supervisor (AC10 de la iter-10).

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    clients: { type: "string" },
    duration: { type: "string" },
    slugs: { type: "string" },
    mode: { type: "string" },
    tabs: { type: "string" },
    "start-tab": { type: "string" },
    "switch-every": { type: "string" },
    timeout: { type: "string" },
    "no-rsc": { type: "boolean" },
    "status-path": { type: "string" },
    "version-field": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

let options: Options;
try {
  if (values.help) throw new UsageError("");
  options = parseOptions(values as RawArgs);
  if (
    options.mode === "despues" &&
    (!options.statusPath || !options.versionField)
  ) {
    throw new UsageError(PENDING_CONTRACT_MESSAGE);
  }
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  if (error.message) console.error(`${error.message}\n`);
  console.error(
    'Uso: npm run sim:session -- --base-url <url> --slugs "Nombre#TAG,..." [--clients 5] [--duration 15]\n' +
      "       [--mode antes|despues] [--start-tab grupo] [--switch-every 30] [--tabs a,b] [--timeout 60]\n" +
      "       [--no-rsc] [--status-path <ruta> --version-field <campo>]\n" +
      "Detalle de los argumentos y de lo que no simula: cabecera de scripts/simulate-session.ts.",
  );
  process.exit(error.message ? 1 : 0);
}

interface Client {
  id: number;
  slug: string;
  tab: Tab;
  /** Última versión de datos vista (modo `despues`). */
  version: string | null;
}

const t0 = performance.now();
const now = () => performance.now() - t0;
const samples: Sample[] = [];
const timers = new Set<ReturnType<typeof setTimeout>>();
const inflight = new Set<Promise<unknown>>();
const stopController = new AbortController();
let incident: Sample | null = null;
let finished = false;

function after(ms: number, fn: () => void): void {
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (!finished) fn();
  }, ms);
  timers.add(timer);
}

function every(periodMs: number, fn: () => void): void {
  after(initialOffset(periodMs, Math.random), function tick() {
    fn();
    after(periodMs, tick);
  });
}

function stop(): void {
  finished = true;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
}

/** Una petición medida hasta el final del cuerpo. Un 5xx o un fallo de red detiene la prueba. */
async function measure(
  kind: RequestKind,
  client: Client,
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  const started = now();
  let status = 0;
  let bytes = 0;
  let text: string | null = null;
  let failure: string | undefined;
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.any([
        stopController.signal,
        AbortSignal.timeout(options.timeoutMs),
      ]),
    });
    status = response.status;
    const body = await response.arrayBuffer();
    bytes = body.byteLength;
    if (kind === "estado") text = new TextDecoder().decode(body);
  } catch (error) {
    // Abortada por la parada de la prueba: no es una muestra.
    if (stopController.signal.aborted) return null;
    failure = describeError(error);
  }
  const sample: Sample = {
    kind,
    tab: client.tab,
    status,
    ms: now() - started,
    bytes,
    at: started,
    error: failure,
  };
  samples.push(sample);
  if ((status === 0 || status >= 500) && !incident) {
    incident = sample;
    stop();
    stopController.abort();
  }
  return text;
}

function track(promise: Promise<unknown>): void {
  inflight.add(promise);
  promise.finally(() => inflight.delete(promise));
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.name} ${error.message}${cause}`;
}

const rscHeaders = (): Record<string, string> =>
  options.rsc ? { RSC: "1" } : {};

function fetchPage(kind: RequestKind, client: Client): Promise<unknown> {
  const url = pageUrl(options.baseUrl, client.slug, client.tab);
  // La carga inicial es siempre HTML (abrir el enlace); el resto, lo que hace Next en el cliente.
  const headers = kind === "carga" ? {} : rscHeaders();
  const promise = measure(kind, client, url, headers);
  track(promise);
  return promise;
}

function startClient(client: Client): void {
  fetchPage("carga", client);

  // Cambio de pestaña: navegación del cliente (petición RSC de la nueva pestaña).
  if (options.switchEveryMs > 0) {
    every(options.switchEveryMs, () => {
      client.tab = nextTab(options.tabs, client.tab);
      fetchPage("navegacion", client);
    });
  }

  if (options.mode === "antes") {
    // Un poller por entrada de `refreshPollers`; el de cada lista que ya no aplica a la pestaña
    // actual (p. ej. `GroupFreshness` fuera de Grupo) no dispara. Se arrancan los dos posibles.
    const periods = refreshPollers("antes", "grupo");
    periods.forEach((periodMs, index) => {
      every(periodMs, () => {
        if (refreshPollers("antes", client.tab).length > index) {
          fetchPage("refresco", client);
        }
      });
    });
    return;
  }

  // Modo `despues`: consulta el estado y repinta solo si cambió la versión.
  every(STATUS_POLL_MS, () => {
    const promise = (async () => {
      const text = await measure(
        "estado",
        client,
        statusUrl(
          options.baseUrl,
          options.statusPath as string,
          client.slug,
          client.tab,
        ),
      );
      if (text === null) return;
      let current: string | null = null;
      try {
        current = readVersion(JSON.parse(text), options.versionField as string);
      } catch {
        // Respuesta que no es JSON: sin versión, no repinta.
      }
      const repaint = shouldRepaint(client.version, current);
      client.version = current ?? client.version;
      if (repaint) await fetchPage("refresco", client);
    })();
    track(promise);
  });
}

const fmt = (ms: number) => (Number.isNaN(ms) ? "-" : `${Math.round(ms)}`);
const statLine = (name: string, s: Stat) =>
  `  ${name.padEnd(28)} n=${String(s.n).padStart(4)}  p50=${fmt(s.p50).padStart(6)} ms  p95=${fmt(s.p95).padStart(6)} ms  max=${fmt(s.max).padStart(6)} ms`;

function printReport(report: Report, elapsedMs: number, mode: Mode): void {
  console.log(
    `\n=== Resumen (${options.baseUrl}, modo ${mode}, ${options.clients} clientes, ${(elapsedMs / 60_000).toFixed(2)} min de ${(options.durationMs / 60_000).toFixed(2)}) ===`,
  );
  console.log(
    `Peticiones: ${report.total} (${Object.entries(report.byKind)
      .map(([k, s]) => `${k}: ${s.n}`)
      .join(", ")})`,
  );
  console.log(
    `Estados HTTP: ${Object.entries(report.byStatus)
      .map(([k, n]) => `${k}=${n}`)
      .join(", ")}  |  5xx o fallos de red: ${report.failures}`,
  );
  console.log(
    `Renders de página: ${report.pageRenders} = ${report.rendersPerMinute.toFixed(1)}/min  (por minuto: ${report.rendersPerMinuteBuckets.join(", ")})`,
  );
  console.log(
    `Tamaño medio de respuesta: ${(report.bytesMean / 1024).toFixed(0)} KB`,
  );
  console.log("\nTiempos por tipo de petición:");
  for (const [k, s] of Object.entries(report.byKind))
    console.log(statLine(k, s));
  console.log("\nTiempos por pestaña (solo renders de página):");
  for (const [k, s] of Object.entries(report.byTab))
    console.log(statLine(k, s));
  console.log("\nTiempos por tipo y pestaña:");
  for (const [k, s] of Object.entries(report.byKindTab))
    console.log(statLine(k, s));
}

console.log(
  `Sesión simulada: ${options.clients} clientes, modo ${options.mode}, ${(options.durationMs / 60_000).toFixed(2)} min, ` +
    `pestaña inicial ${options.startTab}, cambio de pestaña ${options.switchEveryMs ? `cada ${options.switchEveryMs / 1000} s` : "desactivado"}, ` +
    `contra ${options.baseUrl}`,
);
if (options.mode === "antes") {
  console.log(
    'Recuerda: "Actualizar grupo" (server action) se pulsa a mano desde una pestaña real a mitad de la prueba.',
  );
}

for (let id = 0; id < options.clients; id++) {
  startClient({
    id,
    slug: options.slugs[id % options.slugs.length] as string,
    tab: options.startTab,
    version: null,
  });
}

// Progreso cada minuto, hasta el final o hasta el primer 5xx.
const progress = setInterval(() => {
  if (finished) return;
  const renders = samples.filter((s) => isPageRender(s.kind)).length;
  console.log(
    `[${(now() / 60_000).toFixed(1)} min] peticiones=${samples.length} renders=${renders}`,
  );
}, 60_000);

await new Promise<void>((resolve) => {
  const finish = () => {
    clearTimeout(deadline);
    clearInterval(poll);
    resolve();
  };
  const deadline = setTimeout(finish, options.durationMs);
  const poll = setInterval(() => {
    if (incident) finish();
  }, 200);
});
clearInterval(progress);
const elapsed = now();
stop();
await Promise.allSettled([...inflight]);

printReport(buildReport(samples, elapsed), elapsed, options.mode);

const bad = incident as Sample | null;
if (bad) {
  console.error(
    `\nPARADA: ${bad.status === 0 ? `fallo de red o timeout (${bad.error})` : `HTTP ${bad.status}`} en ${bad.kind} de la pestaña ${bad.tab} a los ${(bad.at / 1000).toFixed(1)} s (${fmt(bad.ms)} ms).`,
  );
  process.exit(2);
}
console.log("\nSin 5xx.");
