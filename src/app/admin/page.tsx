import { cookies } from "next/headers";
import { getDb } from "@/db";
import { listGroupMembers, NOT_REGISTERED_MESSAGE } from "@/domain/group";
import {
  ADMIN_COOKIE,
  isAdminConfigured,
  isAdminSession,
} from "@/lib/admin/auth";
import { getKeyStatus } from "@/lib/admin/key-service";
import { formatDateTime } from "@/lib/format";
import { getWorkerStatus } from "@/worker/main";
import {
  addGroupMemberAction,
  loginAction,
  logoutAction,
  removeGroupMemberAction,
  saveKeyAction,
} from "./actions";

// Depende de la cookie y de la BD: nunca se prerenderiza.
export const dynamic = "force-dynamic";

const RESULT_MESSAGES: Record<string, string> = {
  ok: "Key válida guardada. El worker se ha despertado.",
  invalid: "Riot ha rechazado la key (401/403): no se ha guardado.",
  invalid_format:
    "Formato no válido: debe empezar por RGAPI- y no llevar espacios.",
  error:
    "No se pudo comprobar la key con Riot (fallo temporal): no se ha guardado. Reintenta.",
};

const GROUP_MESSAGES: Record<string, string> = {
  added: "Miembro añadido al grupo.",
  already: "Ese perfil ya estaba en el grupo: no se ha cambiado nada.",
  removed: "Miembro quitado del grupo.",
  not_member: "Ese perfil no estaba en el grupo.",
  not_registered: `${NOT_REGISTERED_MESSAGE}.`,
  invalid:
    "Riot ID no válido. Usa el formato Nombre#TAG (también Nombre-TAG o la URL de op.gg).",
  error: "No se pudo actualizar el grupo (fallo temporal). Reintenta.",
};

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  if (!isAdminConfigured()) {
    return (
      <main className="p-6">
        <p>Admin deshabilitado: define ADMIN_TOKEN</p>
      </main>
    );
  }

  const { result, error, group } = await searchParams;
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!isAdminSession(session)) {
    return (
      <main className="p-6">
        <h1>Admin</h1>
        {error === "token" && <p role="alert">Token incorrecto.</p>}
        <form action={loginAction}>
          <label>
            Token de admin{" "}
            <input type="password" name="token" autoComplete="off" required />
          </label>{" "}
          <button type="submit">Entrar</button>
        </form>
      </main>
    );
  }

  const key = await getKeyStatus(getDb());
  const worker = getWorkerStatus();
  const message = typeof result === "string" ? RESULT_MESSAGES[result] : null;
  const members = await listGroupMembers(getDb());
  const groupMessage = typeof group === "string" ? GROUP_MESSAGES[group] : null;

  return (
    <main className="p-6">
      <h1>Admin</h1>

      <h2>Key de Riot</h2>
      <ul>
        <li>Estado: {key.status}</li>
        <li>Desde: {formatDateTime(key.since)}</li>
        {key.reason && <li>Motivo: {key.reason}</li>}
        <li>Fuente: {key.source}</li>
        <li>Guardada: {formatDateTime(key.updatedAt)}</li>
        {key.expiresHint && (
          <li>
            Caduca aprox.: {formatDateTime(key.expiresHint)} (última key + 24 h)
          </li>
        )}
      </ul>

      <h2>Worker</h2>
      <ul>
        <li>Estado: {worker.state}</li>
        <li>Última actividad: {formatDateTime(worker.lastActivityAt)}</li>
        <li>Job actual: {worker.currentJobId ?? "-"}</li>
        {worker.lastError && <li>Último error: {worker.lastError}</li>}
      </ul>

      <h2>Nueva key</h2>
      {message && <output>{message}</output>}
      <form action={saveKeyAction}>
        <label>
          Key de Riot{" "}
          <input type="password" name="key" autoComplete="off" required />
        </label>{" "}
        <button type="submit">Validar y guardar</button>
      </form>

      <h2>Grupo</h2>
      {groupMessage && <output>{groupMessage}</output>}
      {members.length === 0 ? (
        <p>Sin miembros.</p>
      ) : (
        <ul>
          {members.map((m) => (
            <li key={m.profileId}>
              {m.gameName}#{m.tagLine} (última sync:{" "}
              {formatDateTime(m.lastSyncedAt)}){" "}
              <form
                action={removeGroupMemberAction}
                style={{ display: "inline" }}
              >
                <input type="hidden" name="profileId" value={m.profileId} />
                <button type="submit">Quitar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={addGroupMemberAction}>
        <label>
          Riot ID del perfil registrado{" "}
          <input
            type="text"
            name="riotId"
            placeholder="Nombre#TAG"
            autoComplete="off"
            required
          />
        </label>{" "}
        <button type="submit">Añadir al grupo</button>
      </form>

      <form action={logoutAction}>
        <button type="submit">Cerrar sesión</button>
      </form>
    </main>
  );
}
