import { cookies } from "next/headers";
import { Box } from "@/components/hy/box";
import { Btn } from "@/components/hy/btn";
import { Notice } from "@/components/hy/notice";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { listGroupMembers, NOT_REGISTERED_MESSAGE } from "@/domain/group";
import {
  ADMIN_COOKIE,
  ADMIN_TOKEN_MIN_LENGTH,
  isAdminConfigured,
  isAdminSession,
} from "@/lib/admin/auth";
import { getKeyStatus } from "@/lib/admin/key-service";
import { getWorkerStatus } from "@/worker/main";
import { TopBar } from "../euw/[slug]/top-bar";
import { loginAction, logoutAction } from "./actions";
import { GroupBox } from "./group-box";
import { KeyBox } from "./key-box";
import { NarrowPage } from "./narrow-box";
import { WorkerBox } from "./worker-box";

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
      <NarrowPage>
        <Box title="Admin" titleAs="h2">
          <p className="text-sm">
            Admin deshabilitado: define ADMIN_TOKEN con al menos{" "}
            {ADMIN_TOKEN_MIN_LENGTH} caracteres (por ejemplo,{" "}
            <code>openssl rand -base64 32</code>).
          </p>
        </Box>
      </NarrowPage>
    );
  }

  const { result, error, group } = await searchParams;
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!isAdminSession(session)) {
    return (
      <NarrowPage>
        <Box title="Admin" titleAs="h2">
          {error === "token" && (
            <Notice role="alert" variant="danger" className="mb-3 flex-nowrap">
              Token incorrecto.
            </Notice>
          )}
          <form action={loginAction} className="flex flex-col gap-2">
            <label
              htmlFor="admin-token"
              className="text-sm text-muted-foreground"
            >
              Token de admin
            </label>
            <Input
              id="admin-token"
              type="password"
              name="token"
              autoComplete="off"
              required
            />
            <Btn type="submit" className="mt-1 w-full justify-center">
              Entrar
            </Btn>
          </form>
        </Box>
      </NarrowPage>
    );
  }

  const key = await getKeyStatus(getDb());
  const worker = getWorkerStatus();
  const message = typeof result === "string" ? RESULT_MESSAGES[result] : null;
  const members = await listGroupMembers(getDb());
  const groupMessage = typeof group === "string" ? GROUP_MESSAGES[group] : null;

  return (
    <main className="flex flex-1 flex-col">
      <TopBar />
      <div className="mx-auto w-full max-w-[960px] min-w-0 px-0 pt-2 sm:pt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-[40px] leading-none font-extrabold uppercase">
            Admin
          </h1>
          <form action={logoutAction}>
            <Btn type="submit" size="small">
              Cerrar sesión
            </Btn>
          </form>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <KeyBox status={key} result={result} message={message} />
          <WorkerBox worker={worker} />
          <div className="md:col-span-2">
            <GroupBox members={members} group={group} message={groupMessage} />
          </div>
        </div>
      </div>
    </main>
  );
}
