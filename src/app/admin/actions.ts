"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE_S,
  adminSessionValue,
  checkAdminToken,
  isAdminSession,
} from "@/lib/admin/auth";
import { type SaveKeyResult, saveRiotKey } from "@/lib/admin/key-service";
import { safeErrorMessage } from "@/worker/steps";

// Server Actions de `/admin`. Son alcanzables por POST directo, no solo desde el formulario:
// cada una comprueba la sesión por su cuenta. Resultado y errores viajan en la URL como códigos
// cerrados (`?result=`, `?error=`); la key no se devuelve ni se vuelve a pintar nunca.

/** Sesión de admin: comprueba el token y pone la cookie. */
export async function loginAction(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string" || !checkAdminToken(token)) {
    redirect("/admin?error=token");
  }
  (await cookies()).set(ADMIN_COOKIE, adminSessionValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_S,
  });
  redirect("/admin");
}

/** Valida la key contra Riot, la guarda y despierta al worker. */
export async function saveKeyAction(formData: FormData): Promise<void> {
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!isAdminSession(session)) redirect("/admin");

  const key = formData.get("key");
  let result: SaveKeyResult = "invalid_format";
  if (typeof key === "string") {
    try {
      result = await saveRiotKey(getDb(), key);
    } catch (error) {
      // Los errores de Drizzle citan los parámetros de la consulta (la key): solo se loguea
      // el mensaje saneado.
      console.error(
        `[admin] no se pudo guardar la key: ${safeErrorMessage(error)}`,
      );
      result = "error";
    }
  }
  redirect(`/admin?result=${result}`);
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin");
}
