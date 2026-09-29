import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Acceso de operador a `/admin` y `/api/admin/*` (stack.md §7.1): no es un login de usuarios,
// es un secreto único (`ADMIN_TOKEN`). Sin librería de auth: comparaciones en tiempo constante
// y una cookie de sesión derivada del token por HMAC (cambiar el token invalida las sesiones).

/** Nombre de la cookie de sesión de `/admin`. */
export const ADMIN_COOKIE = "hylistats_admin";
/** Duración de la sesión de `/admin`. */
export const ADMIN_SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Mensaje que firma la cookie: fija, solo sirve para que la cookie no sea el token. */
const SESSION_MESSAGE = "hylistats-admin";

/** `ADMIN_TOKEN` del entorno (sin espacios en los extremos); `null` si falta o está vacío. */
function getAdminToken(): string | null {
  return process.env.ADMIN_TOKEN?.trim() || null;
}

/** SHA-256 de ambas cadenas + `timingSafeEqual`: tiempo constante aunque cambie la longitud. */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/** ¿Hay `ADMIN_TOKEN`? Sin él, `/admin` y `/api/admin/*` quedan deshabilitados. */
export function isAdminConfigured(): boolean {
  return getAdminToken() !== null;
}

/** ¿`candidate` es el `ADMIN_TOKEN`? Siempre `false` si no hay token configurado. */
export function checkAdminToken(candidate: string | null | undefined): boolean {
  const token = getAdminToken();
  if (token === null || typeof candidate !== "string") return false;
  return safeEqual(candidate.trim(), token);
}

/**
 * Valor de la cookie de sesión: HMAC-SHA256(`ADMIN_TOKEN`, 'hylistats-admin') en hex.
 * Lanza si no hay `ADMIN_TOKEN` (solo se pide tras `checkAdminToken`).
 */
export function adminSessionValue(): string {
  const token = getAdminToken();
  if (token === null) throw new Error("ADMIN_TOKEN no está definido");
  return createHmac("sha256", token).update(SESSION_MESSAGE).digest("hex");
}

/** ¿El valor de la cookie `hylistats_admin` es una sesión válida? */
export function isAdminSession(
  cookieValue: string | null | undefined,
): boolean {
  if (!isAdminConfigured() || typeof cookieValue !== "string") return false;
  return safeEqual(cookieValue, adminSessionValue());
}

/** ¿La cabecera `Authorization` es `Bearer <ADMIN_TOKEN>`? (esquema sin distinguir mayúsculas). */
export function isAdminBearer(
  authorizationHeader: string | null | undefined,
): boolean {
  if (typeof authorizationHeader !== "string") return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  return match !== null && checkAdminToken(match[1]);
}
