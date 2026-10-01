# Verify Report: hylistats — iter-06 maquetación de /admin
**Fecha**: 2026-10-01
**Consume**: commits `4de5246` (T01), `ab20559` (T02) y ajuste final en la rama `feat/11-maquetacion-admin`; AC1–AC6 de `spec.md` (#11)
**Produce**: veredicto PASS/FAIL con evidencia reproducible

*Contrato del template*: completar todas las secciones marcadas como `<!-- MUST -->`. Las `<!-- SHOULD -->` elevan la calidad del reporte. Las `<!-- MAY -->` se usan solo cuando hay algo real que documentar.

## Alcance validado <!-- MUST -->

- spec.md AC1: `ADMIN_TOKEN` <32 caracteres (tras `trim`) deshabilita login, cookie y `Bearer`; mensaje de deshabilitado con el mínimo y `openssl rand -base64 32`.
- spec.md AC2: `.env.example` documenta mínimo y generación.
- spec.md AC3: `/admin` maquetada con `Box`, `Chip`, `Notice` (`okay`/`trust`/`danger`), `Input`, `Btn` y `ui/table`.
- spec.md AC4: flujos intactos (login, token incorrecto, guardar key, añadir/quitar miembro, cerrar sesión).
- spec.md AC5: 2 columnas a 1280 px; 1 columna sin scroll horizontal a 375 px.
- spec.md AC6: lint, typecheck, tests y build en verde.

## Entorno <!-- SHOULD -->

- OS: macOS (Darwin 25.5), Node con `next dev` del supervisor en :3000 (BD de desarrollo, sesión de admin real), Postgres de test en :5433.
- Navegador integrado del desktop app, viewport emulado 1280×800 y 375×812.

## Checks ejecutados <!-- MUST -->

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

```bash
# Login sin sesión con token incorrecto (estructura del HTML)
curl -s "http://localhost:3000/admin?error=token"
```

Manual en navegador (sesión iniciada): `/admin`, añadir `Azpekaa#EUW` (ya miembro), añadir `xx` (Riot ID inválido), guardar key `foo` (formato inválido; no llega a Riot ni toca la key vigente), `?group=added` a 1280 px, todo a 375 px con `document.documentElement.scrollWidth` frente a `innerWidth`.

## Resultados observados <!-- MUST -->

- AC1: `auth.test.ts` cubre 31 caracteres (no configurado; `checkAdminToken`, `isAdminSession`, `isAdminBearer` rechazan y `adminSessionValue` lanza), 32 (funciona) y espacios en los extremos. Mensaje de deshabilitado en `page.tsx` con `ADMIN_TOKEN_MIN_LENGTH`. El token local (48) sigue funcionando.
- AC2: `.env.example` líneas 7–8.
- AC3/AC4: `?group=already` → `Notice` `trust` "Ese perfil ya estaba en el grupo…"; `?group=invalid` → `Notice` `danger`; `?result=invalid_format` → `Notice` `danger` en el `Box` Key; chips `ok` e `idle` en verde. Login: `curl` devuelve `h1` (sr-only) "Admin", `Box` "Admin", aviso "Token incorrecto." (`role="alert"`), `label` "Token de admin", input y botón "Entrar". Las server actions no cambian (`git diff main -- src/app/admin/actions.ts` vacío).
- AC5: 1280 px → `grid-template-columns: 472px 472px`; 375 px → `scrollWidth 375 = innerWidth 375`, tabla 313/313 (sin scroll interno, "Quitar" visible).
- AC6: exit 0; biome 204 ficheros sin fixes; 59 ficheros / 1268 tests; build con `/admin` dinámica.

## Juicio de coherencia y sentido <!-- MUST -->

La página reutiliza el patrón de `/grupo` (TopBar, contenedor de 960 px, `h1` display) y solo componentes existentes más una variante de `Notice`; no hay lógica nueva salvo la elección de tono por código de resultado. El estado y su acción quedan juntos (Key + "Nueva key"), y el grupo es una tabla escaneable. El endurecimiento del token cierra el único requisito previo a publicar detectado en la revisión de seguridad; el resto (rate limit, sesión revocable, anti-iframe) se descartó con razón en la spec.

## Revision de calidad del codigo <!-- SHOULD -->

Diff limpio: componentes locales pequeños con una responsabilidad (`KeyBox`, `WorkerBox`, `GroupBox`, `DefList`, `NarrowPage`). Smell menor: `flex-nowrap` repetido en los tres `Notice` de admin, porque `Notice` usa `flex-wrap` y sin acciones manda el texto bajo el icono (duplicated code / el defecto vive en `Notice`). Fila input + botón repetida en `KeyBox` y `GroupBox` (2 usos; no compensa extraerla).

## Replay / validacion independiente <!-- SHOULD -->

No aplica: cambio de presentación y una regla de configuración cubierta por tests; riesgo bajo.

## Hallazgos <!-- MAY -->

| Hallazgo | Disposicion (`resuelto` o `diferido`) | Dueno | Destino / evidencia |
|----------|----------------------------------------|-------|---------------------|
| Botón "Validar y guardar" recortado y más alto que el input | resuelto | N/A | `shrink-0` + `sm:h-auto` en `key-box.tsx`/`group-box.tsx` |
| Icono de `Notice` en línea aparte del texto | resuelto | N/A | `flex-nowrap` en los avisos de admin |
| Grid de 434 px a 375 px (ancho mínimo de la tabla) | resuelto | N/A | `grid-cols-1` + `[&>*]:min-w-0` en `page.tsx` |
| "Quitar" escondido tras scroll interno a 375 px | resuelto | N/A | Riot ID y fecha con `whitespace-normal` |
| "1 miembros" | resuelto | N/A | plural en `group-box.tsx` |
| `Notice` sin acciones hace saltar el texto bajo el icono (`flex-wrap`); en admin se parchea con `flex-nowrap` | diferido | Supervisor | Hilo "Pulido y mejora de la UI base" (learn de iter-06) |

## Conclusion <!-- MUST -->

**PASS**

AC1–AC6 cumplidos con evidencia.
