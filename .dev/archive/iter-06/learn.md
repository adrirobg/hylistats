# Learn: hylistats — iter-06 maquetación de /admin
**Fecha**: 2026-10-01
**Consume**: `spec.md` (AC1–AC6, issue #11), `tasks/` (T01–T03 en `done`), `verify-report.md` (PASS), commits `d63bbaa`…`845df0b`
**Produce**: decisiones ratificadas, deuda, acciones

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del artefacto. Las `<!-- MAY -->` se usan solo cuando hay valor real en registrarlas.

## Resumen <!-- MUST -->

iter-06, iteración rápida sin grill. Entrega dos cosas:
- `/admin` maquetada con el sistema de diseño: fila Key/Worker, `Box` Grupo con tabla, y login y estado deshabilitado en una caja estrecha.
- `ADMIN_TOKEN` exige al menos 32 caracteres. Es el único requisito que salió de la revisión de seguridad hecha antes de publicar.

Verify da PASS en AC1–AC6, sin gates manuales.

## Que funciono <!-- MUST -->

- **Mirar la página real antes de proponer.** Una captura de `/admin` y la lectura de `hy/*` bastaron para una propuesta que el supervisor aceptó sin cambios. Todo se resolvió con componentes existentes más una variante de `Notice`.
- **Revisar la seguridad antes de cerrar el alcance**, a petición del supervisor. Separó el endurecimiento barato y útil (token mínimo) de lo descartable con razón: rate limit, sesión revocable y anti-iframe. También destapó el riesgo real de publicar, que está fuera de `/admin`: las server actions públicas, que ahora son un hilo de `think.md`.
- **Workers Sonnet en serie (T01 → T02) sobre un único árbol.** No hubo choques con el dev server del supervisor. El build de los workers no lo afectó.
- **La verificación en el navegador encontró lo que los checks no ven**: botón recortado, icono del aviso en línea aparte, grid de 434 px a 375 px y «Quitar» escondido tras el scroll de la tabla. Medir `scrollWidth` frente a `innerWidth` y el `scrollWidth` del contenedor de la tabla dio evidencia numérica en lugar de impresión visual.
- **Probar los flujos con entradas que no mutan nada** (miembro ya existente, Riot ID inválido, key con formato inválido) y ver el login por `curl`. Así se verificó AC4 sin tocar el grupo real, la key vigente ni la sesión del supervisor.

## Que ajustar <!-- MUST -->

- **El prompt de T02 no avisaba de dos trampas de layout del repo.** Un grid de Tailwind necesita `min-w-0` (o `grid-cols-1`) para que una tabla ancha no lo haga crecer. Y `Notice` con `flex-wrap` manda el texto largo bajo el icono. Las dos se arreglaron a mano en Verify. Para próximas tasks de UI, el prompt debe pedir que el worker mida `scrollWidth` a 375 px, o el orquestador debe asumir que lo hará él.
- **Las celdas de `ui/table` llevan `whitespace-nowrap` por defecto.** En tablas con acción a la derecha, a 375 px la acción queda fuera de la vista aunque no haya desbordamiento de página. Merece una nota en el brief de diseño o una variante.
- **Un heredoc largo de Bash se quedó colgado** (pasó a segundo plano tras 120 s), aunque los ficheros se escribieron bien. Para generar varios artefactos conviene usar Write fichero a fichero en lugar de un solo bloque de shell.

## Decisiones ratificadas o corregidas <!-- SHOULD -->

| Decision | Accion | Razon |
|----------|--------|-------|
| `ADMIN_TOKEN` < 32 caracteres cuenta como no configurado (no como error de arranque) | Ratificada | Falla cerrado, igual que sin token, y el mensaje de `/admin` explica cómo generarlo; tests en `auth.test.ts` |
| Sin rate limit en login/`Bearer`, sesión de 30 días sin revocación y sin cabecera anti-iframe | Ratificada | Con un token aleatorio de ≥32 caracteres la fuerza bruta no es viable; la cookie `sameSite: strict` cubre CSRF y el iframe; el rate limit por IP depende del hosting (`X-Forwarded-For`) |
| Variante `danger` en `Notice` | Ratificada | Los errores ya no se confunden con los avisos informativos (`trust`); reutilizable fuera de admin |
| Iteración rápida sin grill, colgada del hilo "Pulido y mejora de la UI base" | Ratificada | Alcance acotado a presentación más una regla de configuración; spec e issue bastaron como contrato |

## Deuda y gaps <!-- MAY -->

- `Notice` sin acciones y con texto largo manda el texto bajo el icono, por su `flex-wrap`. En admin se parchea con `flex-nowrap` en los tres usos; el arreglo correcto está en `Notice`. Viene de Verify, diferido; dueño: supervisor; destino: hilo "Pulido y mejora de la UI base".
- `ui/table` usa `whitespace-nowrap` en todas las celdas: cada tabla con acción tiene que decidir qué columnas pueden partir línea.
- El hilo de abuso de las server actions públicas al publicar queda abierto en `think.md`, junto al de hosting.

## Acciones siguientes <!-- SHOULD -->

| Accion | Destino canonico | Prioridad |
|--------|-----------------|-----------|
| Sesión conjunta de Arena (F18): AC12 de #9 + AC11 de #7 + AC5 de #3 + AC8 de #2 | think.md (hilos AC pendientes) | alta |
| Decidir la protección de las server actions públicas (registro y refrescos) antes de publicar, junto con el hosting | think.md → hilo "Abuso de las server actions públicas" | alta |
| Arreglar el salto de línea de `Notice` en el componente y quitar los `flex-nowrap` de admin | think.md → hilo "Pulido y mejora de la UI base" | baja |
| Al publicar: generar `ADMIN_TOKEN` con `openssl rand -base64 32` en el entorno del hosting | think.md → hilo "Hosting/publicación" | media |

## Hallazgos para dev-system <!-- MAY -->

- Se repite #14 (abrir una iteración a mano: cabecera de `think.md`, `spec.md`, `index.json`). Se añade #24 en `research/dogfood-log.md`: no hay un camino canónico para una «iteración rápida» sin grill. El alcance salió de la conversación (propuesta más revisión de seguridad), y `Consume` de la spec solo puede citarla como «conversación con el supervisor».

## Candidatos a vault <!-- MAY -->

(sin candidatos)
