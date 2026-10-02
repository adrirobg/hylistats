# Learn: hylistats — iter-10 carga, refrescos y flujo de ramas
**Fecha**: 2026-10-02
**Consume**: todos los artefactos de la iteracion (`spec.md`, `tasks/` T01–T10, `verify-report.md`, think §5, F26 y F27, `research/carga-y-refrescos.md`)
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

La web deja de rehacer páginas por reloj. Los clientes consultan un estado barato con versión de datos, la vista del grupo se calcula una vez por versión y la comparten todos, y `/grupo` desaparece. Además, `develop` pasa a ser la rama de trabajo, con releases versionadas a `main` (`v1.0.0` ya etiquetada).

Verify da PASS:
- En local, con 5 visores en la pestaña Grupo y en reposo, se pasa de 21 renders de página por minuto a 0. El estado responde en 11 ms (p50).
- La prueba en producción (AC10) y la aceptación del grupo (AC11) quedan abiertas tras la release `v1.1.0`.

## Que funciono <!-- MUST -->

- **Medir antes de diseñar y medir igual después.** La investigación de los 502 (`carga-y-refrescos.md`) dio las palancas. El script de sesión simulada (T08) midió el "antes" sobre `develop` y el "después" sobre la rama en las mismas condiciones, y el resultado de AC8 se lee sin interpretación: 21 → 0 renders por minuto.
- **Workers en paralelo en worktrees aislados**, propuesta de la fricción #23:
  - Siete workers en dos oleadas: T02, T05, T06 y T08 primero; T03, T04 y T07 sobre T02.
  - Cada uno con su BD de tests y su puerto.
  - Siete ramas integradas con merge sin ningún conflicto, y la batería completa en verde en el árbol principal tras cada integración.
  - La iteración, de la spec al verify, se hizo en una sesión.
- **Contratos entre tasks pasados por el orquestador.** T02 dejó en su informe el JSON del estado y la API de versiones, y se copiaron tal cual en los prompts de T03, T04 y T08. T04 añadió las versiones iniciales por props siguiendo el aviso de T02 (sin él se habría perdido un cambio entre el render y la primera consulta).
- **Modelo por task** (F28): Opus para lo delicado (versiones, memo, poller) y Sonnet para lo acotado (redirect, payload, script, incremental). Ninguna task tuvo que repetirse.
- **Verificar con el worker real** (decisión del supervisor: migrar la BD local a la Personal key). Así se vio en vivo lo que los tests no cubren:
  - el backfill que repinta cada 5 s;
  - las pausas del limitador sin repintados;
  - el toast "Sin partidas nuevas" sin repintar;
  - las precargas de pestañas tras un repintado (baratas gracias a `loading.tsx`).
- **T09 con el supervisor jugando.** Una partida real respondió la pregunta de Spectator y además enseñó cómo publica Riot las partidas de Arena (al terminar el lobby, no al caer el jugador). Ese dato cambia el valor de "sincronizar al terminar".
- **Escalar la desviación de T07 en vez de esconderla.** El worker vio que la regla literal dejaba sin 602002 al que gana una partida ya descargada por un amigo (el caso habitual del grupo). Añadió el criterio y lo dijo; el supervisor lo aceptó.

## Que ajustar <!-- MUST -->

- **El modo worktree necesitó tres correcciones en vivo** (dogfood #33):
  - el worktree nace de la rama por defecto, sin la spec ni lo ya integrado;
  - la BD de tests tiene que acabar en `hylistats_test`;
  - cada worker copia `.env.local`.
  El primer worker (T05) lo descubrió y los avisos llegaron a los demás a mitad de trabajo. Debe ir en el prompt desde el principio.
- **Un worker imprimió un secreto** (`SUPABASE_DATABASE_URL`) con un `grep` sobre `.env.local` (dogfood #34). Las reglas comunes solo hablaban de la Riot key. A partir de ahora, prohibido leer `.env.local` con herramientas que vuelcan el contenido.
- **La verificación en el navegador dependió de que el panel estuviera visible.** El poller (bien) no consulta con la pestaña oculta, y con el panel del navegador oculto ninguna pestaña es visible. Hubo que imitar al "otro cliente" con `curl` y pedir al supervisor que abriera el panel. En pruebas de visibilidad, comprobarlo primero.
- **El primer diagnóstico durante el backfill fue apresurado.** Leí "49" en una captura reducida (era "40") y tomé la espera del limitador por un fallo del cliente. Leer el DOM y `/api/health` antes de sospechar del código.
- **Tipos obsoletos en `.next/dev`** rompieron el primer build tras borrar `/grupo`. Al quitar una ruta, limpiar `.next/dev` si hubo un `next dev` antes.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| F26: estado con versión (10 s / 5 s, pestaña visible) y repintado solo si cambia | Ratificada (pendiente de AC10 y AC11) | 0 renders en reposo, estado de ~11 ms, propagación ≤ 10 s y toasts como antes. Falta verlo en Render con el grupo |
| F26: grupo calculado una vez por versión, día y semana (memo en memoria) | Ratificada | 95 cálculos = 95 versiones durante el backfill; 1 para 5 visores; 0 tras un "Actualizar grupo" sin partidas |
| F26: guardia de frescura de 2 min | Ratificada | La partida apareció ~2 min después del final del lobby, como prevé P3 |
| F26: incremental sin partidas sin 602002 ni icono | Corregida (ampliada) | Se piden también si el perfil tiene una partida guardada posterior a su última lectura (partida descargada por un amigo). Aceptado por el supervisor |
| F27: `develop` + releases SemVer + runbook, sin staging | Ratificada | `v1.0.0` etiquetada; `dev-ship` y `dev-close-iter` adaptadas; la propia iteración se entrega por `develop` |
| Spectator-V5 fuera de alcance (P1) | Ratificada | Funciona con Arena, pero Match-V5 solo publica al terminar el lobby: sincronizar al terminar ganaría como mucho los ~2 min de la guardia |
| Ejecución en serie en un único árbol (iter-09, por #23) | Corregida | En paralelo en worktrees aislados funcionó con siete workers y cero conflictos, con las salvedades de #33 |

## Deuda y gaps <!-- MAY -->

- **AC10 abierto**: prueba de carga en producción tras `v1.1.0`, en un rato sin partidas y con el sí del supervisor en el momento (script de T08 contra `hylistats.onrender.com`, 5 clientes, 15 min). Si falla, hotfix (P6).
- **AC11 abierto** (F18): en la próxima sesión conjunta, sin 502 ni esperas notables, partidas ~2–3 min después del final del lobby y lo de uno visible para los demás. Va junto a los gates manuales anteriores (AC12 de #9, AC11 de #7, AC5 de #3, AC9 de #13).
- **Expectativa que hay que explicar al grupo**: en Arena, quien cae pronto no ve su partida hasta que termina todo el lobby (Match-V5). No es un fallo de la app.
- **602002**: en 2 de 7 perfiles el contador oficial va 1 por encima del recuento propio (dirección contraria a un retraso; T07). Sin investigar.
- **Retraso del 602002**: no se pudo medir con los datos locales (solo se guarda la última lectura). Riesgo aceptado con el criterio ampliado de T07.
- **Secreto impreso** (verify, diferido al supervisor): rotar `SUPABASE_DATABASE_URL` es opcional; quedó solo en el transcript local de un worker.
- **Turbopack y `next/font/google`** fallaron en el build de un worktree (T06); no se reprodujo en el árbol principal ni en otros worktrees. Observar.
- **Render de cada pestaña**: no cambia en esta iteración (fuera de alcance). Si AC10 da tiempos altos de pestaña sin 502, se apunta como deuda, no se amplía.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Release `v1.1.0` con el runbook (PR `develop → main`, tag, deploy de Render) y AC10 en producción con el sí del supervisor; resultado al verify-report archivado | `docs/deploy.md` (runbook) / `archive/iter-10/verify-report.md` | alta |
| Sesión conjunta de Arena (F18): AC11 de #22 junto con los gates abiertos; avisar de que la partida aparece al terminar el lobby, no al caer | think.md (hilo AC12 de #9) | alta |
| En prompts de worker en worktree: `git merge --ff-only` de la rama de iteración al empezar, BD `tNN_hylistats_test`, puerto propio y prohibido leer `.env.local` con `cat`/`grep` | `.dev/research/orquestacion-v1.md` | media |
| Reorganizar pestañas e información (lo más usado primero), con su propio grill | think.md (hilo abierto) | media |
| Investigar el 602002 oficial +1 en 2 perfiles (campeón repetido en dos 1º) | think.md (hilo nuevo) | baja |

## Hallazgos para dev-system <!-- MAY -->

- **Dogfood #32**: rama de integración configurable y paso de release opcional en `dev-ship` (adaptación local hecha en hylistats por petición del supervisor).
- **Dogfood #33**: modo worktree para workers en paralelo. Funciona y resuelve #23, pero el template de task tiene que declarar la base de la rama, los recursos aislados (BD, puerto) y quién hace los checks globales tras integrar.
- **Dogfood #34**: regla común sobre secretos en `.env.local` para los workers.
- **Cosecha pendiente**: las entradas #14–#34 siguen `abierta` en el log. El `think.md` de dev-system tiene una sesión de cosecha sin commitear en `maint/49-dogfood-hylistats`. No se escribe ahí desde aquí, para no pisarla; esa sesión las recoge.

## Candidatos a vault <!-- MAY -->

- 2026-10-02 — Un refresco por reloj multiplica el trabajo del servidor por visores × pestañas aunque nada cambie; una versión de datos barata convierte el coste en proporcional a los cambios reales — destino: nota-atomica
- 2026-10-02 — En Arena (y en cualquier modo por eliminación), Riot publica la partida al terminar el lobby, no cuando cae el jugador; la latencia percibida la fija el último equipo en pie — destino: nota-atomica
