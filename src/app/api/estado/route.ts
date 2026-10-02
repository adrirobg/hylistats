import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { loadStatus } from "@/domain/status";
import { parseProfileSlug } from "@/lib/riot-id";

// Estado barato (F26): `GET /api/estado?perfil=<slug>[&grupo=1]`. `perfil` es el segmento de la
// URL del perfil tal cual (`profileSlug`, ya codificado) como valor de la query; `grupo=1` cuando
// la página muestra la vista del grupo. Devuelve `StatusPayload` (`@/lib/status-payload`). Público
// como la página: sin `puuid` ni textos de error. Nunca se cachea.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const slug = searchParams.get("perfil");
  const riotId = slug === null ? null : parseProfileSlug(slug);
  if (!riotId) {
    return Response.json(
      { error: "perfil" },
      { status: 400, headers: NO_STORE },
    );
  }
  const payload = await loadStatus(getDb(), riotId, {
    group: searchParams.get("grupo") === "1",
  });
  return Response.json(payload, { headers: NO_STORE });
}
