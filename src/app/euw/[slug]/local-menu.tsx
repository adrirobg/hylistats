"use client";

import { Settings2 } from "lucide-react";
import {
  type ChangeEvent,
  type ComponentProps,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Btn } from "@/components/hy/btn";
import { importState, type LocalState } from "@/lib/local-store";
import { normalizeRiotId, type RiotId } from "@/lib/riot-id";
import { localActions, useLocalStore } from "@/lib/use-local-store";
import { cn } from "@/lib/utils";

// Menú local (brief §4.12, F6): datos del navegador. Exportar e importar están siempre; olvidar
// «mi perfil» y borrar objetivos y marcas solo en «mi perfil» (D12) y piden un segundo clic.

/** Un export real pesa unos KB; algo mucho mayor no es un export de hylistats. */
const MAX_IMPORT_BYTES = 1_000_000;
/** El primer clic de un borrado se "desarma" solo pasado este tiempo. */
const ARM_MS = 5_000;

type Armed = "forget" | "clear" | null;
type Notice =
  | { kind: "info"; text: string }
  | { kind: "error"; text: string }
  | { kind: "confirm-import"; text: string; fileName: string }
  | null;

const selectMyProfile = (state: LocalState) => state.myProfile;

function MenuItem({
  danger,
  className,
  ...props
}: ComponentProps<"button"> & { danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm hover:bg-surface-1",
        danger && "text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function LocalMenu({ riotId }: { riotId: RiotId }) {
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<Armed>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const norm = normalizeRiotId(riotId.gameName, riotId.tagLine);
  const myProfile = useLocalStore(selectMyProfile);
  const mine =
    myProfile !== null &&
    normalizeRiotId(myProfile.gameName, myProfile.tagLine) === norm;

  const close = useCallback(() => {
    setOpen(false);
    setArmed(null);
    setNotice(null);
  }, []);

  // Cierra con Escape (devolviendo el foco al botón) o al pulsar fuera.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      trigger.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  // El primer clic de un borrado se desarma solo: no debe quedar "cargado" indefinidamente.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(null), ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  function exportJson() {
    const blob = new Blob([localActions.exportText()], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hylistats-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setNotice({ kind: "info", text: "Datos exportados." });
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite volver a elegir el mismo fichero
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice({ kind: "error", text: "El fichero es demasiado grande." });
      return;
    }
    const text = await file.text();
    const result = importState(text);
    setNotice(
      result.ok
        ? { kind: "confirm-import", text, fileName: file.name }
        : { kind: "error", text: result.error },
    );
  }

  function confirmImport(text: string) {
    const result = localActions.importText(text);
    setNotice(
      result.ok
        ? { kind: "info", text: "Datos importados." }
        : { kind: "error", text: result.error },
    );
  }

  /** Dos pasos: el primer clic arma el borrado, el segundo lo ejecuta. */
  function destructive(which: Exclude<Armed, null>) {
    if (armed !== which) {
      setArmed(which);
      setNotice(null);
      return;
    }
    setArmed(null);
    if (which === "forget") {
      localActions.clearMyProfile();
      setNotice({ kind: "info", text: "Ya no hay «mi perfil» guardado." });
    } else {
      localActions.clearProfileData(norm);
      setNotice({
        kind: "info",
        text: "Objetivos y marcas de este perfil borrados.",
      });
    }
  }

  return (
    <div ref={root} className="relative">
      <Btn
        ref={trigger}
        aria-label="Datos locales: exportar, importar y borrar"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))}
        className="px-2.5"
      >
        <Settings2 aria-hidden="true" size={16} />
      </Btn>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-10 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-0.5 rounded-lg border border-line bg-surface-2 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >
          <p className="px-3 pt-1.5 pb-1 text-xs text-faint">
            Datos guardados solo en este navegador.
          </p>
          <MenuItem onClick={exportJson}>Exportar datos (JSON)</MenuItem>
          <MenuItem onClick={() => fileInput.current?.click()}>
            Importar datos (JSON)…
          </MenuItem>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Fichero JSON a importar"
            onChange={onFile}
          />
          {mine && (
            <>
              <div className="my-1 border-t border-line" />
              <MenuItem danger onClick={() => destructive("forget")}>
                {armed === "forget"
                  ? "Pulsa otra vez para olvidar «mi perfil»"
                  : "Olvidar «mi perfil»"}
              </MenuItem>
              <MenuItem danger onClick={() => destructive("clear")}>
                {armed === "clear"
                  ? "Pulsa otra vez para borrar objetivos y marcas"
                  : "Borrar objetivos y marcas de este perfil"}
              </MenuItem>
            </>
          )}
          <MenuNotice
            notice={notice}
            onConfirm={confirmImport}
            onCancel={() => setNotice(null)}
          />
        </div>
      )}
    </div>
  );
}

function MenuNotice({
  notice,
  onConfirm,
  onCancel,
}: {
  notice: Notice;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  if (!notice) return null;
  if (notice.kind === "confirm-import") {
    return (
      <div
        role="alert"
        className="mt-1 grid gap-2 rounded-md bg-surface-1 p-3 text-sm"
      >
        <p>
          «{notice.fileName}» sustituirá todos los datos de este navegador («mi
          perfil», favoritos, recientes, objetivos y marcas). No se fusionan.
        </p>
        <div className="flex gap-1.5">
          <Btn size="small" onClick={() => onConfirm(notice.text)}>
            Sustituir
          </Btn>
          <Btn size="small" variant="trust" onClick={onCancel}>
            Cancelar
          </Btn>
        </div>
      </div>
    );
  }
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className={cn(
        "mt-1 rounded-md bg-surface-1 px-3 py-2 text-sm",
        notice.kind === "error" ? "text-danger" : "text-muted-foreground",
      )}
    >
      {notice.text}
    </p>
  );
}
