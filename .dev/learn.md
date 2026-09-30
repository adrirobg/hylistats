# Learn: hylistats — iter-03 compañeros, partidas, panel de campeón y cierre de v1
**Fecha**: 2026-09-30
**Consume**: todos los artefactos de la iteracion
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

La v1 queda completa en funciones:
- pestañas Compañeros, Partidas (con detalle 6×3) y Resumen (curva D4);
- panel de campeón con enlaces a 5 webs;
- auto-refresco D10;
- los estados que faltaban de §5.

Todo abrible por URL. Verify **PASS**: AC1–AC4 contra la app real y Riot, 965 tests, 0 fugas y 25/25 enlaces externos. AC5 (F4, sesión real del grupo) queda como gate manual del supervisor.

## Que funciono <!-- MUST -->

- **Adelantar la task que necesita Riot** (T02, auto-refresco, en segundo lugar):
  - AC3 se verificó contra Riot a las 08:17 UTC, lejos de la caducidad de la key (18:30).
  - El E2E final dio gratis una segunda serie con el código definitivo (jobs 22–25, separados de 5 min 23 s a 5 min 31 s).
- **Verificar la tabla de slugs en el navegador antes de fijarla en tests** (T06): 173 campeones en tres webs más muestras en dos. En el E2E, 25/25 enlaces correctos sin tocar nada.
- **Carga por pestaña con una prueba de frontera** (`OWN_KEYS` en `data.test.ts`): cada pestaña solo trae lo suyo, y el test lo fija. Ninguna task posterior coló datos de más en `ProfileView`.
- **Contrato explícito en lugar de texto libre**: `RATE_LIMIT_MARKER` es un prefijo fijo del mensaje de `RiotRateLimitError`, y `classifyRetry` lo busca. Así, un 503 no se confunde con el límite, y el texto de `lastError` no sale del servidor (comprobado en el HTML).
- **Sacar a una función pura lo que era inline**: `shownProfileData` (pura) sustituye a la lógica de "perfil ajeno" que vivía en un hook. D12 queda cubierta por tests sin jsdom.
- **Semillas de escenarios en el scratchpad** (`seed-perfil.mts` con 10 modos nuevos, incluido un control negativo con 503): los 8 estados de §5 se vieron en el navegador sin gastar cuota de Riot.
- **Reanudar un subagente cortado** por el límite de sesión con `SendMessage` en lugar de relanzarlo: T08 siguió con su contexto y sin rehacer trabajo (18 ficheros ya tocados).
- **Bucle orquestador + subagentes Sonnet en serie**, con "Estado previo" y avisos técnicos en cada prompt: 9 tasks, ninguna escalada y ninguna repetida.

## Que ajustar <!-- MUST -->

- **La evidencia del E2E vivió solo en el transcript** durante un corte de unos 20 min del clasificador de auto mode (8 respuestas sin veredicto seguidas; a la 10ª se corta el turno). Si la sesión se hubiera perdido, AC2, AC4 y el responsive se habrían tenido que repetir. Hay que escribir el verify-report por AC según se verifica, no al final.
- **Supuesto de entorno roto**: el handover decía "servidores parados", pero el supervisor arrancó su propio `npm run dev` en el 3000 durante la sesión. Next 16 no admite dos `next dev` en el mismo directorio. Se resolvió preguntando: el supervisor dio permiso para pararlo. Antes de `preview_start`, hay que comprobar los puertos y tener a mano una alternativa con `next start`.
- **Una instrucción de task inalcanzable**: T08 pedía que "Marcar a mano" conservara `?campeon`, pero con el panel abierto el fondo es `inert` y el botón no se puede pulsar. Se probó la función pura y el caso real sin panel. Al redactar tasks de interacción hay que contrastarlas con la modalidad real de la UI (el mismo patrón que el raíl de 380 px de iter-02).
- **`data.ts` creció de unas 190 a 621 líneas** (carga por pestaña, espera y cola, `arenaQuiet`), y `loadQueue` replica en SQL el orden de `pickWork`. Está documentado y probado, pero es el próximo sitio donde un cambio del worker puede desalinear la UI.
- **Un servidor con el worker y una pestaña visible gasta cuota aunque nadie mire**: 3 peticiones cada ~5,5 min mientras el orquestador estaba bloqueado. Es poco, pero hay que parar el servidor en cuanto la verificación se detiene, no al final.
- **Webs de terceros con bot check**: la primera carga de u.gg se quedó en la comprobación de Cloudflare. Se resolvió sola, pero la verificación de AC4 depende de que sigan dejando leer sin interacción.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| D10: auto-refresco al volver a la pestaña y cada 5 min visible, con el guardia de 5 min en el servidor | Ratificada | Dos series contra Riot (T02 y T09) y el uso real del supervisor: nunca dos incrementales en menos de 5 min; nada con la pestaña oculta |
| D9: panel de campeón en portal, hoja lateral o inferior | Ratificada | Sin scroll horizontal a 375, 960 y 1440 px; foco dentro del diálogo; abrible por URL sobre cualquier pestaña |
| D6: muestra mínima ≥ 3 por defecto y aviso por debajo de 5 | Ratificada | `?min=5` restaurable; tabla de 9 compañeros con BEJITO |
| D4: curva de campeones ganados con el umbral de 60 (sin puesto medio móvil) | Ratificada | Cumple el issue; el puesto medio sigue fuera de alcance |
| D12: perfil ajeno sin capa local (objetivos y marcas) | Ratificada y ahora probada | `shownProfileData` con tests; verificado con datos locales guardados de otro perfil |
| "Arena fuera de rotación" inferido de la BD propia (7 días, cualquier perfil, solo si la última sincronización fue bien) | Ratificada para v1 | Riot no expone la rotación; se redacta como posibilidad. Pendiente de verse en una rotación real |
| La cola compartida en tono neutro (no de aviso); el límite de peticiones en azul acero como la pausa | Ratificada (orquestador) | Esperar turno no es un problema del usuario; el tono se cambia con un ternario si el supervisor lo prefiere |
| Carga bajo demanda por pestaña | Ratificada | Test de frontera `OWN_KEYS`; los datos de pestañas inactivas no viajan |

## Deuda y gaps <!-- MAY -->

- **Gates manuales pendientes** (dueño: supervisor; destino: `think.md` §Hilos abiertos):
  - AC5 de #3 (F4, sesión real del grupo);
  - AC8 de #2 (elegir campeón en una partida real), que sigue abierto.
- **`data.ts` (621 líneas)** (dueño: orquestador; destino: backlog técnico, baja): partir la carga de sync (`loadSyncProgress`, `loadRetry`, `loadQueue`) a su propio módulo si crece más.
- **`loadQueue` replica el orden de `pickWork`** (dueño: orquestador; destino: backlog técnico, baja): documentado en ambos sitios y fijado en tests. Una alternativa sería una función compartida de "prioridad de job".
- **`sharing` aproximado** (dueño: supervisor; destino: "Pulido UI"): cuenta los `fetching` ajenos aunque no les quede nada listo, así que la ETA puede salir alta un instante.
- **Detalles menores de UI** (dueño: supervisor; destino: hilo "Pulido y mejora de la UI base"):
  - "Aún no has jugado a X" sale igual en perfiles ajenos;
  - "Ver todos (≥ 1)" de Compañeros no tiene tope;
  - a 375 px se pierde la marca "12 may" del eje de la curva.
- **Payload RSC del polling** (de iter-02; dueño: orquestador; destino: "Pulido UI"): 56–108 kB según la pestaña. La carga por pestaña lo contuvo, pero no lo redujo.
- **Siguen abiertas de iteraciones anteriores**:
  - raíl de 380 px inalcanzable y roving tabindex en el álbum ("Pulido UI" y backlog de accesibilidad);
  - retraso de hasta 30 s para jobs lanzados fuera de la página;
  - sembrar el limitador tras un reinicio y `602001` sin cuadrar (iter-01, baja).
- **Key**: la dev key caduca hoy hacia las 18:30 UTC. Para usar la v1 después (y para AC5) hace falta renovarla por `/admin`.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| AC5 (F4): sesión real de Arena con el grupo, sin abrir otra web. Queda como gate pendiente tras el merge, en `think.md` §Hilos abiertos junto a AC8 de #2 | Supervisor / think.md | alta |
| Ship: PR contra main con `Closes #3`, merge delegado por el supervisor con CI en verde y cierre de iter-03 en main | dev-ship (tramos A, B y C) | alta |
| Renovar la dev key para seguir usando la app tras las 18:30 UTC (o avanzar el hilo de la Personal key) | Supervisor / think.md → hilo "Registro del producto en el portal de Riot" | alta |
| Escribir el verify-report por AC según se verifica, no al final | Runbook `research/orquestacion-v1.md` y plantilla de task E2E | media |
| Comprobar los puertos y la presencia de otro `next dev` antes de `preview_start`; alternativa con `next start` | Runbook `research/orquestacion-v1.md` | media |
| Partir la carga de sync de `data.ts` y compartir la prioridad de job con `pickWork` | Backlog técnico (post-v1) | baja |
| Borrar las ramas `feat/1-motor-de-datos`, `feat/2-perfil-y-album` y, tras el merge, `feat/3-companeros-partidas` | Supervisor | baja |

## Hallazgos para dev-system <!-- MAY -->

- **Bucle reproducido en una tercera iteración**: 9 tasks sin escalar, con avisos que se propagan entre prompts y verify con E2E real. La propuesta de documentar el "modo orquestador" sigue en pie.
- **Reanudar un subagente cortado** (límite de sesión) con `SendMessage` conserva su contexto. Merece entrar en ese modo orquestador como paso de recuperación, frente a relanzar la task desde cero.
- **Evidencia de Verify solo en el transcript** hasta el final: nueva fricción #17 en `dogfood-log.md`.
- Siguen confirmadas en uso real:
  - #10 y #12: `dev-ship` y `dev-task` sin invocación por modelo; el helper `task_status.py` se recreó otra vez de la sesión anterior.
  - #14: abrir iteración sin paso determinista.
  - #15 y #16: merge delegado con gate manual pendiente. Esta vez la autorización va literal en el handover, con los comandos del tramo C, como pedía #16.

## Candidatos a vault <!-- MAY -->

- 2026-09-30 — Un contrato explícito entre productor y consumidor (una marca fija en el mensaje de error) evita clasificar por texto libre y deja probar el extremo a extremo — destino: nota-atomica
- 2026-09-30 — En verificaciones largas, la evidencia se escribe en el artefacto según se obtiene: un corte del entorno se lleva lo que solo vive en el transcript — destino: nota-atomica
