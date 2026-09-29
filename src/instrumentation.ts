// Next llama a `register()` una vez al arrancar cada servidor (no durante `next build`) y espera a
// que termine antes de atender peticiones: el worker se lanza sin `await` (stack.md §3(a)).
// Solo en el runtime de Node; `WORKER_ENABLED=false` lo desactiva (p. ej. un 2º proceso web).
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.WORKER_ENABLED !== "false"
  ) {
    const { startWorker } = await import("./worker/main");
    void startWorker();
  }
}
