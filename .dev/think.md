# Think: hylistats
**Estado**: captured
**Ultima sesion**: 2026-09-29
**Sesiones**: 2026-09-29 (Webapp de estadísticas de perfil de jugador para trackear progreso en el modo Arena de LoL usando la Riot API (inspiración: lolalytics.com/arena, op.gg/lol/modes/arena, metasrc.com/lol/arena, arenasweats.lol, arena.trott.dev))
**Grill**: sin grillar — primer paso: dev-grill

*Contrato del template*: todo contenido `{...}` es placeholder pendiente — los consumidores deterministas (dev-context) lo ignoran como si la celda/campo no existiera; jamas se reporta como estado real. Los markers `<!-- MUST -->`/`<!-- SHOULD -->`/`<!-- MAY -->` marcan obligacion de seccion: un `{...}` dentro de una seccion MUST de un artefacto en uso es deuda visible; en SHOULD/MAY es omision legitima. El header (Estado/Ultima sesion) es MUST.

## Inputs procesados
- {descripcion del input} -> [{nombre}]({path relativo})

---

## CAPTURED — Ideas capturadas

### {nombre de idea} — capturada
{Descripcion bruta de la idea, contexto, origen.}

---

## ORGANIZED — Ideas organizadas

### {nombre de idea} — organizada
{Idea agrupada con otras relacionadas, contexto refinado, relaciones explicitadas.}

*Glosario lazy*: si `dev-grill` descubre terminos reales que reducen ambiguedad, crear aqui `## Glosario del proyecto <!-- MAY -->`; no provisionar una seccion vacia.

---

## DISTILLED — Decisiones tomadas

| ID | Decision | Valor | Estado | Fuente |
|----|----------|-------|--------|--------|
| F1 | {nombre} | {descripcion concisa del valor decidido} | Cerrada | {origen} |

---

## EXPRESSED — Especificaciones cerradas

### §1 — {titulo} CERRADA

{Especificacion completa, accionable, que consume las decisiones destiladas y produce un contrato claro para Spec.}

**Destino inmediato**: {Pasa a Spec | Cerrada sin pasar a Spec | Deferida}

{Si pasa a Spec, indicar que `spec.md` debe consumir esta §N. Si no pasa a Spec, dejar motivo breve de cierre o defer.}

*Regla de handoff*: Spec consume `think.md` cuando el artefacto esta en estado `cerrado`. Cada §N de `EXPRESSED` debe dejar explicito si pasa a Spec o si queda cerrada/deferida.

---

## Investigaciones
- [{nombre}]({path}) — estado: {en curso|cerrada}. Resultado esperado: {descripcion}.

---

## Hilos abiertos <!-- SHOULD -->

| Hilo | Owner | Siguiente accion |
|------|-------|-------------------|
| {descripcion del hilo} | {Supervisor/Triada} | {siguiente paso concreto} |

---

## Principios del proyecto

{Opcional. Se completa cuando emergen principios transversales que guian decisiones futuras.}
