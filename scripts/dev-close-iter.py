#!/usr/bin/env python3
"""dev-close-iter.py — Cierre determinista de una iteracion dev-system.

Valida precondiciones mecanicas (spec.md con sus 4 secciones MUST cubiertas
— Objetivo, Alcance, Entregables, Criterios de aceptacion —, think.md con
headers **Estado**/**Ultima sesion** presentes, tasks/index.json con shape
valido y todo done/cancelled con evidencias reales, verify-report.md con
fecha, secciones MUST basicas materializadas y veredicto explicito, learn.md
con secciones MUST cubiertas, archive/iter-NN inedito).
Si todas pasan: archiva spec.md, verify-report.md, learn.md y tasks/ bajo
`.dev/archive/iter-NN/`, resetea los activos a plantillas (resolucion:
`.dev/templates/` del proyecto, o `templates/project/.dev/` del repo del
script en self-hosting), borra los task_*.md y tasks/evidence/ activos
y actualiza el header de `.dev/think.md`
(**Estado** / **Ultima sesion**). Si alguna precondicion falla, no toca
nada y reporta la causa.

Fallo atomico (P9): todas las precondiciones se validan antes de la
primera escritura. Si algo falla durante el cierre (I/O), se revierte lo
ya escrito antes de salir con error.

Uso:
    python3 scripts/dev-close-iter.py [--iter iter-NN] [--date YYYY-MM-DD] \
        [--project-root PATH]

Salida: un unico JSON en stdout.
    {"status": "closed"|"blocked", "iter": "iter-NN", "archived": [...],
     "reset": [...], "think_header_updated": true|false, "errors": [...]}

Exit 0 solo en cierre completo; exit 1 en cualquier bloqueo.

Refs: #29, spec.md M1, .dev/tasks/task_T1.md
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def resolve_template_dev(project_root: Path) -> Path | None:
    """Plantillas de reset, en orden de precedencia:

    1. `<project-root>/.dev/templates/` — proyecto autocontenido
       (project-init.sh las copia pristinas al crear el proyecto).
    2. `templates/project/.dev/` del repo que contiene este script —
       caso self-hosting de dev-system.
    """
    candidates = (
        project_root / ".dev" / "templates",
        REPO_ROOT / "templates" / "project" / ".dev",
    )
    for c in candidates:
        if (c / "spec.md").is_file() and (c / "tasks" / "index.json").is_file():
            return c
    return None

PLACEHOLDER_RE = re.compile(r"^\{.*\}$|^- \{.*\}$|^- \[[ xX]\] \{.*\}$|^\| \{.*\}|\*\*\{.*\}\*\*$")
TEMPLATE_BRACES_RE = re.compile(r"^\{.*\}$")
VERDICT_RE = re.compile(r"(^|[^A-Z])(PASS|FAIL)($|[^A-Z])")
ITER_RE = re.compile(r"^iter-\d{2}$")
ARCHIVE_DIR_RE = re.compile(r"^iter-(\d+)$")
SPEC_MUST_SECTIONS = ("Objetivo", "Alcance", "Entregables", "Criterios de aceptacion")
VERIFY_MUST_SECTIONS = (
    "Alcance validado",
    "Checks ejecutados",
    "Resultados observados",
    "Juicio de coherencia y sentido",
    "Conclusion",
)


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def extract_section(text: str, heading: str) -> str:
    """Replica el awk del harness bash: linea que EMPIEZA con '## {heading}'."""
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


def line_has_placeholder(line: str) -> bool:
    """Paridad con dev-context.py: si la línea es fila de tabla markdown,
    cada celda se evalúa por separado (una fila `| 1 | {nombre} |` es
    placeholder aunque no empiece por `| {`)."""
    stripped = line.strip()
    if not stripped:
        return False
    if stripped.startswith("|"):
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        return any(TEMPLATE_BRACES_RE.match(c) for c in cells if c)
    return bool(PLACEHOLDER_RE.search(stripped))


def section_has_real_content(text: str, heading: str) -> bool:
    content = extract_section(text, heading)
    lines = [l for l in content.splitlines() if l.strip()]
    if not lines:
        return False
    return not any(line_has_placeholder(l) for l in lines)


def verify_has_explicit_verdict(text: str) -> bool:
    content = extract_section(text, "Conclusion")
    joined = " ".join(content.splitlines())
    return bool(VERDICT_RE.search(joined))


def verify_has_real_date(text: str) -> bool:
    match = re.search(r"^\*\*Fecha\*\*:\s*(.+)$", text, re.MULTILINE)
    if not match:
        return False
    value = match.group(1).strip()
    return bool(value) and not bool(PLACEHOLDER_RE.search(value))


def infer_next_iter(archive_root: Path) -> str:
    max_n = 0
    if archive_root.is_dir():
        for entry in archive_root.iterdir():
            if not entry.is_dir():
                continue
            m = ARCHIVE_DIR_RE.match(entry.name)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return f"iter-{max_n + 1:02d}"


def validate(project_root: Path, iter_arg: str | None) -> tuple[list[str], str | None, dict | None]:
    """Valida TODAS las precondiciones antes de tocar nada.

    Devuelve (errores, iter_name, tasks_data). iter_name puede ser None si
    el argumento --iter tiene formato invalido.
    """
    dev = project_root / ".dev"
    errors: list[str] = []

    # --- plantillas de reset resolubles ---
    if resolve_template_dev(project_root) is None:
        errors.append(
            "no se encontraron plantillas de reset: ni .dev/templates/ en el "
            "proyecto ni templates/project/.dev/ en el repo del script"
        )

    # --- iteracion objetivo ---
    iter_name: str | None
    if iter_arg is not None:
        if not ITER_RE.match(iter_arg):
            errors.append(f"formato de iteracion invalido: {iter_arg}")
            iter_name = None
        else:
            iter_name = iter_arg
    else:
        iter_name = infer_next_iter(dev / "archive")

    if iter_name is not None:
        archive_dir = dev / "archive" / iter_name
        if archive_dir.exists():
            errors.append(f"{archive_dir} ya existe; no se sobreescribe una iteracion archivada")

    # --- spec.md ---
    spec_path = dev / "spec.md"
    spec_text = read_text(spec_path)
    if spec_text is None:
        errors.append("falta .dev/spec.md")
    else:
        for heading in SPEC_MUST_SECTIONS:
            if not section_has_real_content(spec_text, heading):
                errors.append(f".dev/spec.md no cubre ## {heading} (vacía o placeholder)")

    # --- think.md ---
    think_path = dev / "think.md"
    think_text = read_text(think_path)
    if think_text is None:
        errors.append("falta .dev/think.md")
    else:
        if not re.search(r"^\*\*Estado\*\*:", think_text, re.MULTILINE):
            errors.append(".dev/think.md sin header **Estado**")
        if not re.search(r"^\*\*[ÚU]ltima sesi[oó]n\*\*:", think_text, re.MULTILINE):
            errors.append(".dev/think.md sin header **Última sesión**")

    # --- tasks/index.json ---
    tasks_path = dev / "tasks" / "index.json"
    tasks_text = read_text(tasks_path)
    tasks_data: dict | None = None
    if tasks_text is None:
        errors.append("falta .dev/tasks/index.json")
    else:
        try:
            tasks_data = json.loads(tasks_text)
        except json.JSONDecodeError:
            errors.append(".dev/tasks/index.json no es JSON valido")
            tasks_data = None
        else:
            if not isinstance(tasks_data, dict):
                errors.append(
                    '.dev/tasks/index.json con shape inválido: la raíz debe ser '
                    'un objeto {"tasks": [...]}'
                )
                tasks_data = None
            elif "tasks" not in tasks_data:
                errors.append(
                    '.dev/tasks/index.json con shape inválido: falta la clave "tasks"'
                )
                tasks_data = None
            elif not isinstance(tasks_data["tasks"], list):
                errors.append(
                    '.dev/tasks/index.json con shape inválido: "tasks" debe ser una lista'
                )
                tasks_data = None
            else:
                invalid_indices = [
                    i for i, t in enumerate(tasks_data["tasks"]) if not isinstance(t, dict)
                ]
                if invalid_indices:
                    indices_txt = ", ".join(str(i) for i in invalid_indices)
                    errors.append(
                        f'.dev/tasks/index.json con shape inválido: '
                        f'{len(invalid_indices)} entrada(s) que no son objeto task '
                        f'(índices: {indices_txt})'
                    )
                    tasks_data = None
                else:
                    tasks_list = tasks_data["tasks"]
                    open_tasks = [
                        t for t in tasks_list
                        if t.get("status") not in ("done", "cancelled")
                    ]
                    if open_tasks:
                        listado = "; ".join(
                            f"{t.get('id', '?')} [{t.get('status', '?')}] {t.get('title', '?')}"
                            for t in open_tasks
                        )
                        errors.append(f"hay tasks no cerradas: {listado}")

    # --- verify-report.md ---
    verify_path = dev / "verify-report.md"
    verify_text = read_text(verify_path)
    if verify_text is None:
        errors.append("falta .dev/verify-report.md")
    else:
        if not verify_has_real_date(verify_text):
            errors.append(".dev/verify-report.md no tiene una Fecha real")
        for heading in VERIFY_MUST_SECTIONS:
            if not section_has_real_content(verify_text, heading):
                errors.append(f".dev/verify-report.md no cubre ## {heading}")
        if not verify_has_explicit_verdict(verify_text):
            errors.append(".dev/verify-report.md no tiene PASS o FAIL explicito en Conclusion")

    # --- learn.md ---
    learn_path = dev / "learn.md"
    learn_text = read_text(learn_path)
    if learn_text is None:
        errors.append("falta .dev/learn.md")
    else:
        for heading in ("Resumen", "Que funciono", "Que ajustar"):
            if not section_has_real_content(learn_text, heading):
                errors.append(f".dev/learn.md no cubre ## {heading}")

    # --- evidencias de tasks done ---
    if tasks_data and isinstance(tasks_data, dict):
        for t in tasks_data.get("tasks", []):
            if not isinstance(t, dict) or t.get("status") != "done":
                continue
            task_id = t.get("id", "?")
            artifact_path = t.get("artifact_path")
            if not artifact_path:
                errors.append(f"la task {task_id} esta en done pero no tiene artifact_path")
                continue
            artifact_file = project_root / artifact_path
            artifact_text = read_text(artifact_file)
            if artifact_text is None:
                errors.append(f"falta artifact_path para task {task_id}: {artifact_path}")
                continue
            if not section_has_real_content(artifact_text, "Evidencias"):
                errors.append(f"la task {task_id} esta en done pero no tiene ## Evidencias cerrada")

    return errors, iter_name, tasks_data


def render_template(template_text: str, project_name: str) -> str:
    return template_text.replace("{nombre o identificador}", project_name)


def update_think_header(text: str, iter_name: str, date_str: str) -> tuple[str, bool]:
    """Devuelve (texto_actualizado, ambas_sustituciones_aplicadas).

    El booleano solo es True si tanto **Estado** como **Ultima sesion**
    existian y se sustituyeron; si alguno faltaba, es un no-op silencioso
    para ese header y el caller debe reportarlo honestamente.
    """
    text, n_estado = re.subn(
        r"^(\*\*Estado\*\*:\s*).+$",
        lambda m: f"{m.group(1)}{iter_name} cerrada — sin iteración activa",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    text, n_sesion = re.subn(
        r"^(\*\*[ÚU]ltima sesi[oó]n\*\*:\s*).+$",
        lambda m: f"{m.group(1)}{date_str}",
        text,
        count=1,
        flags=re.MULTILINE,
    )
    return text, (n_estado > 0 and n_sesion > 0)


def close_iteration(project_root: Path, iter_name: str, date_str: str) -> dict:
    """Ejecuta el cierre. Precondiciones ya validadas por el caller.

    Archiva primero (copia), luego resetea los activos. Si algo falla en
    medio, revierte lo ya escrito (best-effort) y re-lanza.
    """
    dev = project_root / ".dev"
    archive_dir = dev / "archive" / iter_name
    project_name = project_root.name

    archived: list[str] = []
    reset: list[str] = []
    think_header_updated = False
    archive_created = False
    # Backups de activos que vamos a sobreescribir, para poder revertir.
    backups: dict[Path, str] = {}
    deleted_task_files: dict[Path, str] = {}
    evidence_deleted = False

    def rel(p: Path) -> str:
        try:
            return str(p.relative_to(project_root))
        except ValueError:
            return str(p)

    try:
        # 1. Archivar (copia, no move)
        archive_dir.mkdir(parents=True, exist_ok=False)
        archive_created = True

        for name in ("spec.md", "verify-report.md", "learn.md"):
            src = dev / name
            dst = archive_dir / name
            shutil.copy2(src, dst)
            archived.append(rel(dst))

        tasks_src = dev / "tasks"
        tasks_dst = archive_dir / "tasks"
        shutil.copytree(tasks_src, tasks_dst)
        archived.append(rel(tasks_dst))

        # 2. Resetear activos desde templates (preservando backups primero)
        for name in ("spec.md", "verify-report.md", "learn.md"):
            active = dev / name
            backups[active] = active.read_text(encoding="utf-8")

        tasks_index = dev / "tasks" / "index.json"
        backups[tasks_index] = tasks_index.read_text(encoding="utf-8")

        template_dev = resolve_template_dev(project_root)
        if template_dev is None:
            raise FileNotFoundError("plantillas de reset no resolubles")

        for name in ("spec.md", "verify-report.md", "learn.md"):
            template_text = (template_dev / name).read_text(encoding="utf-8")
            rendered = render_template(template_text, project_name)
            active = dev / name
            active.write_text(rendered, encoding="utf-8")
            reset.append(rel(active))

        tasks_template_text = (template_dev / "tasks" / "index.json").read_text(encoding="utf-8")
        tasks_index.write_text(tasks_template_text, encoding="utf-8")
        reset.append(rel(tasks_index))

        # 3. Borrar task_*.md activos (conservando README.md y task_template.md)
        for f in sorted((dev / "tasks").glob("task_*.md")):
            if f.name == "task_template.md":
                continue
            deleted_task_files[f] = f.read_text(encoding="utf-8")
            f.unlink()

        # 3b. Borrar tasks/evidence/ activa (ya archivada en tasks_dst)
        evidence_dir = dev / "tasks" / "evidence"
        if evidence_dir.is_dir():
            shutil.rmtree(evidence_dir)
            evidence_deleted = True

        # 4. Actualizar header de think.md
        think_path = dev / "think.md"
        backups[think_path] = think_path.read_text(encoding="utf-8")
        new_think, think_header_updated = update_think_header(backups[think_path], iter_name, date_str)
        think_path.write_text(new_think, encoding="utf-8")

    except Exception as exc:  # noqa: BLE001 - rollback y re-lanzar como error controlado
        # Revertir archivos sobreescritos
        for path, original in backups.items():
            try:
                path.write_text(original, encoding="utf-8")
            except OSError:
                pass
        # Restaurar task_*.md borrados
        for path, original in deleted_task_files.items():
            try:
                path.write_text(original, encoding="utf-8")
            except OSError:
                pass
        # Restaurar tasks/evidence/ desde la copia archivada
        if evidence_deleted:
            try:
                shutil.copytree(archive_dir / "tasks" / "evidence", dev / "tasks" / "evidence", dirs_exist_ok=True)
            except OSError:
                pass
        # Eliminar archivo parcial
        if archive_created and archive_dir.exists():
            shutil.rmtree(archive_dir, ignore_errors=True)
        raise RuntimeError(f"fallo durante el cierre: {exc}") from exc

    return {
        "archived": archived,
        "reset": reset,
        "think_header_updated": think_header_updated,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cierre determinista de una iteracion dev-system.")
    parser.add_argument("--iter", dest="iter_name", default=None, help="iter-NN objetivo; por defecto se infiere de .dev/archive/")
    parser.add_argument("--date", dest="date_str", default=None, help="fecha YYYY-MM-DD; por defecto hoy")
    parser.add_argument("--project-root", dest="project_root", default=None, help="raiz del proyecto; por defecto cwd")
    args = parser.parse_args(argv)

    project_root = Path(args.project_root).resolve() if args.project_root else Path.cwd()

    date_str = args.date_str or date.today().isoformat()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        result = {
            "status": "blocked",
            "iter": args.iter_name,
            "archived": [],
            "reset": [],
            "think_header_updated": False,
            "errors": [f"formato de fecha invalido: {date_str}; se espera YYYY-MM-DD"],
        }
        print(json.dumps(result, ensure_ascii=False))
        return 1

    errors, iter_name, _tasks_data = validate(project_root, args.iter_name)

    if errors:
        result = {
            "status": "blocked",
            "iter": iter_name if iter_name is not None else args.iter_name,
            "archived": [],
            "reset": [],
            "think_header_updated": False,
            "errors": errors,
        }
        print(json.dumps(result, ensure_ascii=False))
        return 1

    assert iter_name is not None  # invariante: sin errores, iter_name esta resuelto

    try:
        outcome = close_iteration(project_root, iter_name, date_str)
    except RuntimeError as exc:
        result = {
            "status": "blocked",
            "iter": iter_name,
            "archived": [],
            "reset": [],
            "think_header_updated": False,
            "errors": [str(exc)],
        }
        print(json.dumps(result, ensure_ascii=False))
        return 1

    result = {
        "status": "closed",
        "iter": iter_name,
        "archived": outcome["archived"],
        "reset": outcome["reset"],
        "think_header_updated": outcome["think_header_updated"],
        "errors": [],
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
