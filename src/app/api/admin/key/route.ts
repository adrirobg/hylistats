import { getDb } from "@/db";
import { isAdminBearer } from "@/lib/admin/auth";
import { type SaveKeyResult, saveRiotKey } from "@/lib/admin/key-service";
import { safeErrorMessage } from "@/worker/steps";

// Rotar la key desde el shell, sin teclearla en un navegador:
//   curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"key":"RGAPI-..."}' .../api/admin/key
// Ni la respuesta ni los logs llevan la key.

const STATUS: Record<SaveKeyResult, number> = {
  ok: 200,
  invalid: 400,
  invalid_format: 400,
  error: 502,
};

export async function POST(request: Request): Promise<Response> {
  if (!isAdminBearer(request.headers.get("authorization"))) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  let key: unknown;
  try {
    key = ((await request.json()) as { key?: unknown } | null)?.key;
  } catch {
    // Cuerpo que no es JSON: se trata como una key ausente.
  }
  if (typeof key !== "string") {
    return Response.json({ result: "invalid_format" }, { status: 400 });
  }

  let result: SaveKeyResult;
  try {
    result = await saveRiotKey(getDb(), key);
  } catch (error) {
    // Los errores de Drizzle citan los parámetros de la consulta (la key): solo se loguea el
    // mensaje saneado, y Next no llega a registrar el error original.
    console.error(
      `[admin] no se pudo guardar la key: ${safeErrorMessage(error)}`,
    );
    return Response.json({ error: "internal" }, { status: 500 });
  }
  return Response.json({ result }, { status: STATUS[result] });
}
