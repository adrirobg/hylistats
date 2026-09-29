#!/usr/bin/env python3
"""dev-context.py — Genera .dev/context.md desde señales verificables.

context.md es un snapshot derivado y regenerable para handover/reanudación.
No es source of truth ni output de fase; no manda sobre sus fuentes.
Contrato: .dev/research/contrato-v2-artefactos-y-fases.md (Decisión 2).

Uso:
    python3 scripts/dev-context.py [ruta-proyecto] [--full | --json]

Fuentes (inventario completo por ciclo de vida): .dev/think.md, .dev/spec.md,
.dev/tasks/index.json, .dev/verify-report.md, .dev/learn.md,
.dev/archive/iter-NN/ (la última cerrada) y estado git. Si una fuente falta,
se marca como ausente — este script nunca inventa estado.

Regla de placeholder (compartida con dev-close-iter.py, PLACEHOLDER_RE en
scripts/dev-close-iter.py:61): un valor/celda/línea cuyo contenido stripped
casa el patrón `^\\{.*\\}$` (o sus variantes de línea completa — bullet,
celda de tabla, negrita) es placeholder y nunca se reporta como estado real.

Salida por defecto: compacto — cuerpo ≤ 30 líneas (formato Adri F-09); la
sección Avisos no tiene cap (la deuda visible no se trunca). `--full`
produce el snapshot extenso equivalente al v1. `--json` emite el mismo
contexto estructurado sin escribir `.dev/context.md`.

Refs: #16, #31, spec.md M2
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

MISSING = "(fuente no disponible)"
GRILL_PENDING_LINE = "**Grill**: sin grillar — primer paso: dev-grill"
GRILL_PENDING_AVISO = "think.md: idea sin grillar — ejecutar dev-grill antes de Spec"

# Regla compartida con dev-close-iter.py (PLACEHOLDER_RE, scripts/dev-close-iter.py:61).
# Duplicada aquí en vez de importada: los dos scripts deben permanecer
# invocables de forma independiente y el nombre del módulo origen tiene un
# guion (no es importable como módulo Python sin trucos de importlib).
PLACEHOLDER_RE = re.compile(r"^\{.*\}$|^- \{.*\}$|^- \[[ xX]\] \{.*\}$|^\| \{.*\}|\*\*\{.*\}\*\*$")
TEMPLATE_BRACES_RE = re.compile(r"^\{.*\}$")
VERDICT_RE = re.compile(r"(^|[^A-Z])(PASS|FAIL)($|[^A-Z])")
ARCHIVE_DIR_RE = re.compile(r"^iter-(\d+)$")

TASK_REQUIRED_FIELDS = (
    "id", "title", "status", "owner", "depends_on",
    "artifact_path", "created_at", "updated_at",
)
OPEN_STATUSES = ("pending", "in_progress", "blocked", "todo")

SPEC_MUST_SECTIONS = ("Objetivo", "Alcance", "Entregables", "Criterios de aceptacion")
VERIFY_MUST_SECTIONS = (
    "Alcance validado",
    "Checks ejecutados",
    "Resultados observados",
    "Juicio de coherencia y sentido",
    "Conclusion",
)
LEARN_MUST_SECTIONS = ("Resumen", "Que funciono", "Que ajustar")


# ---------------------------------------------------------------------------
# Utilidades básicas
# ---------------------------------------------------------------------------

def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def first_match(pattern: str, text: str) -> str | None:
    m = re.search(pattern, text, re.MULTILINE)
    return m.group(1).strip() if m else None


def is_placeholder(value: str | None) -> bool:
    """Valor aislado (header, celda ya separada) — full match contra `{...}`."""
    if not value:
        return False
    return bool(TEMPLATE_BRACES_RE.match(value.strip()))


def line_has_placeholder(line: str) -> bool:
    """Línea cruda de una sección: bullet, fila de tabla o texto plano.

    Si la línea ES una fila de tabla markdown (empieza por '|'), cada celda
    se evalúa por separado — así una fila con columnas reales mezcladas con
    una columna placeholder (p.ej. `| 1 | {nombre} | {descripcion} |`) se
    detecta igual, cosa que un match de línea completa se perdería.
    Ojo: no basta con "contiene '|'" — un placeholder de texto plano como
    `{PASS | FAIL}` también lleva una barra sin ser una fila de tabla.
    """
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith("|"):
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        return any(is_placeholder(c) for c in cells if c)
    return bool(PLACEHOLDER_RE.search(stripped))


def extract_section(text: str, heading: str) -> str:
    """Replica el criterio de dev-close-iter: línea que EMPIEZA con '## {heading}'."""
    marker = f"## {heading}"
    out: list[str] = []
    in_section = False
    for line in text.splitlines():
        if not in_section:
            if line.startswith(marker):
                in_section = True
            continue
        if line.startswith("## "):
            break
        out.append(line)
    return "\n".join(out)


def parse_table_rows(text: str, heading: str, header_first_cells: tuple[str, ...]) -> list[list[str]]:
    """Filas reales (no separador, no header, no placeholder) de una tabla markdown
    bajo `## {heading}`."""
    section = extract_section(text, heading)
    rows: list[list[str]] = []
    for line in section.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if not cells or not cells[0]:
            continue
        if set(cells[0]) <= {"-", " ", ":"}:
            continue  # fila separadora
        if cells[0].lower() in header_first_cells:
            continue  # fila de encabezado
        if any(is_placeholder(c) for c in cells):
            continue  # fila placeholder de plantilla
        rows.append(cells)
    return rows


# ---------------------------------------------------------------------------
# Fuente: think.md
# ---------------------------------------------------------------------------

def parse_think(text: str | None) -> dict:
    out = {"estado": MISSING, "ultima_sesion": MISSING, "hilos": []}
    if not text:
        return out
    estado = first_match(r"^\*\*Estado\*\*:\s*(.+)$", text)
    sesion = first_match(r"^\*\*[ÚU]ltima sesi[oó]n\*\*:\s*(.+)$", text)
    out["estado"] = (estado if estado and not is_placeholder(estado) else None) or "(no declarada en think.md)"
    out["ultima_sesion"] = (sesion if sesion and not is_placeholder(sesion) else None) or "(no declarada en think.md)"
    for cells in parse_table_rows(text, "Hilos abiertos", ("hilo", "thread")):
        out["hilos"].append(cells[0])
    return out


def grill_pending_avisos(text: str | None) -> list[str]:
    if not text:
        return []
    if any(line.strip() == GRILL_PENDING_LINE for line in text.splitlines()):
        return [GRILL_PENDING_AVISO]
    return []


# ---------------------------------------------------------------------------
# Fuente: spec.md
# ---------------------------------------------------------------------------

def parse_spec(text: str | None) -> dict:
    out = {"titulo": MISSING, "estado": MISSING, "objetivo": MISSING, "plantilla": True}
    if not text:
        return out  # spec.md ausente => sin iteración activa (conservador)

    titulo = first_match(r"^#\s*Spec:\s*(.+)$", text) or "(sin título)"
    estado_raw = first_match(r"^\*\*Estado\*\*:\s*(.+)$", text)
    estado = estado_raw or "(sin estado)"
    obj_block = extract_section(text, "Objetivo")
    obj_lines = [l.strip() for l in obj_block.splitlines() if l.strip()]
    objetivo = obj_lines[0] if obj_lines else "(sin objetivo declarado)"

    out["titulo"] = titulo
    out["estado"] = estado
    out["objetivo"] = objetivo

    if estado_raw is None:
        out["plantilla"] = True
    elif estado_raw.strip().lower() == "plantilla":
        out["plantilla"] = True
    else:
        out["plantilla"] = False
    return out


# ---------------------------------------------------------------------------
# Fuente: tasks/index.json
# ---------------------------------------------------------------------------

def parse_tasks(text: str | None) -> dict:
    """Contrato canonico: solo `{"tasks": [...]}` es shape valido (paridad con
    scripts/dev-close-iter.py). Una raiz lista u otra shape marca parse_error."""
    out = {
        "total": None, "por_estado": {}, "tasks": [], "parse_error": False,
        "entries_invalidas": 0,
    }
    if not text:
        return out
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        out["parse_error"] = True
        return out
    if not isinstance(data, dict) or "tasks" not in data or not isinstance(data["tasks"], list):
        out["parse_error"] = True
        return out
    tasks = data["tasks"]
    out["total"] = len(tasks)
    out["tasks"] = [t for t in tasks if isinstance(t, dict)]
    out["entries_invalidas"] = len(tasks) - len(out["tasks"])
    for t in out["tasks"]:
        status = str(t.get("status", "?"))
        out["por_estado"][status] = out["por_estado"].get(status, 0) + 1
    return out


def tasks_shape_avisos(tasks: list[dict], root: Path) -> list[str]:
    avisos: list[str] = []
    for t in tasks:
        tid = t.get("id", "?")
        missing = [f for f in TASK_REQUIRED_FIELDS if f not in t]
        if missing:
            avisos.append(
                f"tasks/index.json: task {tid} sin campo(s) obligatorio(s): {', '.join(missing)}"
            )
        artifact_path = t.get("artifact_path")
        artifact, path_error = resolve_project_artifact(root, artifact_path)
        if artifact_path and path_error:
            avisos.append(
                f"tasks/index.json: task {tid} — artifact_path {path_error}: {artifact_path}"
            )
    return avisos


def resolve_project_artifact(root: Path, value: object) -> tuple[Path | None, str | None]:
    """Resuelve un artefacto sin permitir lecturas fuera de ``root``.

    ``resolve()`` cubre tanto segmentos ``..`` como escapes mediante symlink.
    Las rutas absolutas se rechazan incluso cuando apuntan dentro del proyecto:
    el contrato versionado de tasks exige ``artifact_path`` relativo.
    """
    if not isinstance(value, str) or not value.strip():
        return None, "ausente o inválido"
    relative = Path(value)
    if relative.is_absolute():
        return None, "debe ser relativo al proyecto"
    project_root = root.resolve()
    candidate = (project_root / relative).resolve()
    try:
        candidate.relative_to(project_root)
    except ValueError:
        return None, "sale del proyecto"
    if not candidate.is_file():
        return None, "no existe en disco"
    return candidate, None


def pick_open_task(tasks: list[dict]) -> dict | None:
    for status in ("in_progress", "pending"):
        for t in tasks:
            if t.get("status") == status:
                return t
    return None


def format_task(t: dict) -> str:
    return f"[{t.get('status', '?')}] {t.get('id', '?')}: {t.get('title', '?')}"


def section_contract(text: str, heading: str) -> str | None:
    """Devuelve una sección contractual real o ``None`` si está vacía/placeholder."""
    section = extract_section(text, heading).strip()
    if not section:
        return None
    real_lines = [line for line in section.splitlines() if not line_has_placeholder(line)]
    value = "\n".join(real_lines).strip()
    return value or None


def parse_acceptance_criteria(text: str) -> list[dict]:
    criteria: list[dict] = []
    for line in extract_section(text, "Criterios de aceptacion").splitlines():
        match = re.match(r"^\s*-\s*\[([ xX])\]\s+(.+?)\s*$", line)
        if not match or is_placeholder(match.group(2)):
            continue
        criteria.append({"text": match.group(2), "checked": match.group(1).lower() == "x"})
    return criteria


def compile_active_task(tasks: list[dict], root: Path) -> tuple[dict | None, list[str]]:
    """Compila la primera task ``in_progress`` en orden de ``index.json``."""
    active = [task for task in tasks if task.get("status") == "in_progress"]
    if not active:
        return None, []

    warnings: list[str] = []
    if len(active) > 1:
        warnings.append(
            "tasks/index.json: más de una task in_progress; active_task usa la primera según el índice"
        )

    task = active[0]
    detail = {
        key: task.get(key)
        for key in (
            "id", "title", "status", "owner", "updated_at", "depends_on", "artifact_path"
        )
    }
    detail.update({
        "objective": None,
        "context": None,
        "delegation_prompt": None,
        "acceptance_criteria": [],
    })

    artifact, path_error = resolve_project_artifact(root, task.get("artifact_path"))
    if path_error:
        warnings.append(
            f"active_task {task.get('id', '?')}: artifact_path {path_error}: "
            f"{task.get('artifact_path')}"
        )
        return detail, warnings

    task_text = read_text(artifact)
    if task_text is None:
        warnings.append(f"active_task {task.get('id', '?')}: no se pudo leer artifact_path")
        return detail, warnings

    detail.update({
        "objective": section_contract(task_text, "Objetivo"),
        "context": section_contract(task_text, "Contexto"),
        "delegation_prompt": section_contract(task_text, "Prompt / instrucciones para worker"),
        "acceptance_criteria": parse_acceptance_criteria(task_text),
    })
    return detail, warnings


# ---------------------------------------------------------------------------
# Fuente: verify-report.md
# ---------------------------------------------------------------------------

def parse_verify(text: str | None) -> dict:
    out = {"veredicto": MISSING, "active": False}
    if not text:
        return out
    fecha = first_match(r"^\*\*Fecha\*\*:\s*(.+)$", text)
    if fecha is None or is_placeholder(fecha):
        out["veredicto"] = "en plantilla"
        return out
    # Fecha real declarada: el reporte está en uso. El veredicto solo cuenta
    # si aparece fuera de líneas placeholder (evita el falso PASS de la
    # plantilla literal "**{PASS | FAIL}**" cuando el resto del archivo ya
    # se tocó pero Conclusión sigue sin completar).
    content = extract_section(text, "Conclusion")
    real_lines = [l for l in content.splitlines() if not line_has_placeholder(l)]
    joined = " ".join(real_lines)
    m = VERDICT_RE.search(joined)
    out["veredicto"] = m.group(2) if m else "sin veredicto"
    out["active"] = True
    return out


# ---------------------------------------------------------------------------
# Fuente: learn.md (activo)
# ---------------------------------------------------------------------------

def parse_learn(text: str | None) -> dict:
    out = {"estado": MISSING, "active": False}
    if not text:
        return out
    fecha = first_match(r"^\*\*Fecha\*\*:\s*(.+)$", text)
    if fecha is None or is_placeholder(fecha):
        out["estado"] = "sin cosecha activa"
        return out
    out["estado"] = fecha
    out["active"] = True
    return out


# ---------------------------------------------------------------------------
# Fuente: archive/iter-NN (la última cerrada)
# ---------------------------------------------------------------------------

def find_last_archive(dev: Path) -> dict:
    out = {"iter": None, "fecha": None, "acciones_alta": []}
    archive_root = dev / "archive"
    max_n = 0
    max_name = None
    if archive_root.is_dir():
        for entry in archive_root.iterdir():
            if not entry.is_dir():
                continue
            m = ARCHIVE_DIR_RE.match(entry.name)
            if m and int(m.group(1)) >= max_n:
                max_n = int(m.group(1))
                max_name = entry.name
    if max_name is None:
        return out
    out["iter"] = max_name
    learn_text = read_text(archive_root / max_name / "learn.md")
    if not learn_text:
        return out
    fecha = first_match(r"^\*\*Fecha\*\*:\s*(.+)$", learn_text)
    if fecha and not is_placeholder(fecha):
        out["fecha"] = fecha
    for cells in parse_table_rows(learn_text, "Acciones siguientes", ("accion", "acción")):
        if len(cells) >= 3 and cells[2].strip().lower() == "alta":
            out["acciones_alta"].append(cells[0])
    return out


def find_archive_timeline(dev: Path) -> list[dict]:
    """Lista todas las iteraciones archivadas y sus acciones de prioridad alta."""
    archive_root = dev / "archive"
    if not archive_root.is_dir():
        return []

    entries: list[tuple[int, Path]] = []
    for entry in archive_root.iterdir():
        if not entry.is_dir():
            continue
        match = ARCHIVE_DIR_RE.match(entry.name)
        if match:
            entries.append((int(match.group(1)), entry))

    timeline: list[dict] = []
    for _, entry in sorted(entries):
        item = {"iter": entry.name, "fecha": None, "acciones_alta": []}
        learn_text = read_text(entry / "learn.md")
        if learn_text:
            fecha = first_match(r"^\*\*Fecha\*\*:\s*(.+)$", learn_text)
            if fecha and not is_placeholder(fecha):
                item["fecha"] = fecha
            for cells in parse_table_rows(
                learn_text, "Acciones siguientes", ("accion", "acción")
            ):
                if len(cells) >= 3 and cells[2].strip().lower() == "alta":
                    item["acciones_alta"].append(cells[0])
        timeline.append(item)
    return timeline


# ---------------------------------------------------------------------------
# git
# ---------------------------------------------------------------------------

def git_info(root: Path) -> dict:
    def run(*args: str) -> str | None:
        try:
            r = subprocess.run(
                ["git", "-C", str(root), *args],
                capture_output=True, text=True, timeout=10,
            )
            return r.stdout.strip() if r.returncode == 0 else None
        except OSError:
            return None

    branch = run("rev-parse", "--abbrev-ref", "HEAD")
    status = run("status", "--porcelain")
    log1 = run("log", "--format=%h %s", "-1")
    log3 = run("log", "--format=%h %s", "-3")
    worktrees = run("worktree", "list", "--porcelain")
    n_worktrees = worktrees.count("worktree ") if worktrees else 0
    return {
        "branch": branch or MISSING,
        "dirty": (len(status.splitlines()) if status is not None else None),
        "last_commit": log1 or MISSING,
        "commits": log3.splitlines() if log3 else [],
        "worktrees": n_worktrees,
    }


# ---------------------------------------------------------------------------
# Avisos (F-05/F-16/F-18)
# ---------------------------------------------------------------------------

def must_placeholder_avisos(text: str | None, artifact_label: str, headings: tuple[str, ...], active: bool) -> list[str]:
    if not active or not text:
        return []
    avisos = []
    for heading in headings:
        section = extract_section(text, heading)
        content_lines = [line for line in section.splitlines() if line.strip()]
        if not content_lines:
            avisos.append(f"{artifact_label}: sección MUST '{heading}' ausente o vacía")
        elif any(line_has_placeholder(l) for l in content_lines):
            avisos.append(f"{artifact_label}: sección MUST '{heading}' con placeholder sin rellenar")
    return avisos


def has_dev_skills(skills_dir: Path) -> bool:
    if not skills_dir.is_dir():
        return False
    return any(p.is_dir() and p.name.startswith("dev-") for p in skills_dir.iterdir())


def env_avisos(root: Path) -> list[str]:
    avisos = []
    if shutil.which("git") is None:
        avisos.append("entorno: git no disponible en PATH")
    if shutil.which("jq") is None:
        avisos.append("entorno: jq no disponible en PATH")
    if not (has_dev_skills(root / ".claude" / "skills") or has_dev_skills(root / ".agents" / "skills")):
        avisos.append("entorno: ninguna skill dev-* visible en .claude/skills/ ni .agents/skills/")
    # Solo aplica donde el proyecto distribuye sync-skills.py (p.ej. dev-system
    # self-hosting); en proyectos sin ese script el aviso sería ruido falso.
    if (root / "scripts" / "sync-skills.py").is_file() and importlib.util.find_spec("yaml") is None:
        avisos.append("entorno: PyYAML no disponible (requerido por sync-skills.py)")
    return avisos


# ---------------------------------------------------------------------------
# Inferencia de fase (determinista, §4 del task)
# ---------------------------------------------------------------------------

def infer_phase(spec: dict, tasks: dict, verify: dict, learn: dict, archive: dict) -> str:
    if spec["plantilla"]:
        if archive["iter"] is None:
            return "Think (proyecto sin iteraciones)"
        return f"Entre iteraciones ({archive['iter']} cerrada)"

    total = tasks["total"] or 0
    if total == 0:
        return "Spec"

    abiertas = any(t.get("status") in OPEN_STATUSES for t in tasks["tasks"])
    if abiertas:
        return "Execute"

    if verify["veredicto"] not in ("PASS", "FAIL"):
        return "Verify (pendiente)"

    if not learn["active"]:
        return "Learn (pendiente)"

    return "Cierre (listo para ship/close-iter)"


def siguiente_accion(fase: str, spec: dict, tasks: dict, archive: dict, hilos: list[str]) -> str:
    t = pick_open_task(tasks["tasks"])
    if t:
        return format_task(t)
    if fase.startswith("Verify"):
        return "ejecutar Verify — tasks cerradas sin veredicto (verify-report.md)"
    if fase.startswith("Learn"):
        return "ejecutar Learn (dev-learn) — Verify con veredicto"
    if fase.startswith("Cierre"):
        return "cerrar la iteración — /dev-ship → dev-close-iter"
    if spec["plantilla"] and archive["acciones_alta"]:
        return f"{archive['acciones_alta'][0]} (learn {archive['iter']})"
    if hilos:
        return f"hilo abierto: {hilos[0]}"
    return "(no derivable de las fuentes)"


# ---------------------------------------------------------------------------
# Recolección
# ---------------------------------------------------------------------------

def collect(root: Path) -> dict:
    dev = root / ".dev"
    think_text = read_text(dev / "think.md")
    spec_text = read_text(dev / "spec.md")
    verify_text = read_text(dev / "verify-report.md")
    learn_text = read_text(dev / "learn.md")
    think = parse_think(think_text)
    spec = parse_spec(spec_text)
    tasks = parse_tasks(read_text(dev / "tasks" / "index.json"))
    verify = parse_verify(verify_text)
    learn = parse_learn(learn_text)
    archive = find_last_archive(dev)
    git = git_info(root)

    avisos: list[str] = []
    avisos += grill_pending_avisos(think_text)
    avisos += must_placeholder_avisos(spec_text, "spec.md", SPEC_MUST_SECTIONS, not spec["plantilla"])
    avisos += must_placeholder_avisos(verify_text, "verify-report.md", VERIFY_MUST_SECTIONS, verify["active"])
    avisos += must_placeholder_avisos(learn_text, "learn.md", LEARN_MUST_SECTIONS, learn["active"])
    if tasks["parse_error"]:
        avisos.append("tasks/index.json: JSON inválido o de shape inesperado")
    else:
        avisos += tasks_shape_avisos(tasks["tasks"], root)
        if tasks["entries_invalidas"] > 0:
            avisos.append(
                f"tasks/index.json: {tasks['entries_invalidas']} entrada(s) que no son objeto task"
            )
    avisos += env_avisos(root)

    fase = infer_phase(spec, tasks, verify, learn, archive)
    return {
        "name": root.name,
        "think": think,
        "spec": spec,
        "tasks": tasks,
        "verify": verify,
        "learn": learn,
        "archive": archive,
        "git": git,
        "avisos": avisos,
        "fase": fase,
        "siguiente": siguiente_accion(fase, spec, tasks, archive, think["hilos"]),
    }


# ---------------------------------------------------------------------------
# Render: compacto (default, ≤ 30 líneas)
# ---------------------------------------------------------------------------

def build_compact(ctx: dict, ts: str) -> list[str]:
    spec = ctx["spec"]
    git = ctx["git"]
    archive = ctx["archive"]

    if spec["plantilla"]:
        iter_txt = "ninguna (spec en plantilla)"
    else:
        iter_txt = f"{spec['titulo']} [{spec['estado']}] · {spec['objetivo']}"

    ultima_iter_txt = f"{archive['iter']} ({archive['fecha'] or 'sin fecha'})" if archive["iter"] else "ninguna"

    dirty = git["dirty"]
    dirty_txt = MISSING if dirty is None else ("limpio" if dirty == 0 else f"{dirty} cambios")

    lines = [
        f"# Context: {ctx['name']}",
        f"> Derivado y regenerable (scripts/dev-context.py, {ts}). No manda sobre sus fuentes.",
        "",
        "## Estado",
        f"- Fase: {ctx['fase']} — think.md: {ctx['think']['estado']}",
        f"- Última acción: {git['last_commit']}; última iteración cerrada: {ultima_iter_txt}",
        f"- Iteración activa: {iter_txt}",
        f"- Git: {git['branch']} · {dirty_txt} · worktrees {git['worktrees']}",
        "",
        "## Siguiente acción",
        f"- {ctx['siguiente']}",
        "",
        "## Hilos abiertos (think.md)",
    ]
    hilos = ctx["think"]["hilos"][:8]
    lines += [f"- {h}" for h in hilos] if hilos else ["- (ninguno detectado)"]

    if ctx["avisos"]:
        lines += ["", "## Avisos"]
        lines += [f"- {a}" for a in ctx["avisos"]]

    return lines


# ---------------------------------------------------------------------------
# Render: extenso (--full)
# ---------------------------------------------------------------------------

def build_full(ctx: dict, ts: str) -> list[str]:
    spec = ctx["spec"]
    think = ctx["think"]
    tasks = ctx["tasks"]
    verify = ctx["verify"]
    learn = ctx["learn"]
    archive = ctx["archive"]
    git = ctx["git"]

    spec_line = f"{spec['titulo']} [estado: {spec['estado']}]"
    if spec["plantilla"]:
        spec_line += " — sin iteración activa (spec en plantilla)"

    if tasks["total"] is None:
        tasks_resumen = MISSING if not tasks["parse_error"] else "(tasks/index.json invalido)"
    else:
        por_estado = ", ".join(f"{k}: {v}" for k, v in sorted(tasks["por_estado"].items())) or "sin tasks"
        tasks_resumen = f"{tasks['total']} totales ({por_estado})"

    activas = [t for t in tasks["tasks"] if t.get("status") in OPEN_STATUSES]

    dirty = git["dirty"]
    dirty_txt = MISSING if dirty is None else ("limpio" if dirty == 0 else f"{dirty} cambios sin commitear")

    lines = [
        f"# Context: {ctx['name']}",
        "",
        "> Snapshot derivado y regenerable — NO editar a mano.",
        f"> Generado: {ts} por scripts/dev-context.py --full",
        "> Fuentes: .dev/think.md, .dev/spec.md, .dev/tasks/index.json, "
        ".dev/verify-report.md, .dev/learn.md, .dev/archive/, git.",
        "> No manda sobre sus fuentes (contrato v2, Decisión 2).",
        "",
        "## Fase e iteración",
        f"- Fase inferida: {ctx['fase']}",
        f"- Estado declarado en think.md: {think['estado']}",
        f"- Última sesión registrada: {think['ultima_sesion']}",
        f"- Iteración activa (spec.md): {spec_line}",
        f"- Objetivo de la iteración: {spec['objetivo']}",
        "",
        "## Git",
        f"- Branch: {git['branch']} | Working tree: {dirty_txt} | Worktrees: {git['worktrees']}",
    ]
    lines += [f"- {c}" for c in git["commits"]] or ["- (sin commits visibles)"]
    lines += [
        "",
        "## Tasks",
        f"- Resumen: {tasks_resumen}",
    ]
    lines += [f"- {format_task(t)}" for t in activas[:5]]
    lines += [
        "",
        "## Verify (verify-report.md)",
        f"- Veredicto: {verify['veredicto']}",
        "",
        "## Learn (learn.md activo)",
        f"- {learn['estado']}",
        "",
        "## Última iteración archivada",
    ]
    if archive["iter"] is None:
        lines += ["- (ninguna)"]
    else:
        lines += [f"- {archive['iter']} ({archive['fecha'] or 'sin fecha declarada'})"]
        if archive["acciones_alta"]:
            lines += [f"  - acción alta: {a}" for a in archive["acciones_alta"]]
    lines += [
        "",
        "## Hilos abiertos (think.md)",
    ]
    lines += [f"- {h}" for h in think["hilos"][:8]] or ["- (ninguno detectado)"]
    lines += [
        "",
        "## Siguiente acción recomendada",
        f"- {ctx['siguiente']}",
        "",
        "## Avisos",
    ]
    lines += [f"- {a}" for a in ctx["avisos"]] or ["- (ninguno)"]
    lines += [
        "",
        "> Decisiones activas: no se duplican aquí — ver `.dev/think.md` (DISTILLED) y `.dev/spec.md`.",
        "",
    ]
    return lines


# ---------------------------------------------------------------------------
# Render: JSON (--json)
# ---------------------------------------------------------------------------

def build_json(ctx: dict, ts: str, root: Path) -> str:
    """Serializa el contexto operativo sin mutar ``ctx`` ni ``context.md``."""
    payload = dict(ctx)
    payload["avisos"] = list(ctx["avisos"])
    active_task, active_warnings = compile_active_task(ctx["tasks"]["tasks"], root)
    payload["avisos"].extend(active_warnings)
    payload["active_task"] = active_task
    payload["archive_timeline"] = find_archive_timeline(root / ".dev")
    payload["generado"] = ts
    return json.dumps(payload, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genera .dev/context.md desde señales verificables.")
    parser.add_argument("project_root", nargs="?", default=None, help="raíz del proyecto; por defecto cwd")
    parser.add_argument("--full", action="store_true", help="snapshot extenso en vez del compacto")
    parser.add_argument(
        "--json",
        action="store_true",
        help="contexto operativo como JSON a stdout; no escribe context.md",
    )
    args = parser.parse_args(argv)

    if args.json and args.full:
        parser.error("--json y --full son incompatibles; usa solo uno")

    root = Path(args.project_root).resolve() if args.project_root else Path.cwd()
    dev = root / ".dev"
    if not dev.is_dir():
        print(f"ERROR: no existe {dev} — ¿es un proyecto dev-system?", file=sys.stderr)
        return 1

    ctx = collect(root)
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if args.json:
        print(build_json(ctx, ts, root))
        return 0

    lines = build_full(ctx, ts) if args.full else build_compact(ctx, ts)

    (dev / "context.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OK: generado {dev / 'context.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
