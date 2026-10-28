import { obtenerDependencias } from "@/server/composition";
import { manejarAcceso } from "@/server/http/access-handler";
import { responderSinServicio } from "@/server/http/responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const composicion = obtenerDependencias();
  if (!composicion.ok) return responderSinServicio();
  return manejarAcceso(request, composicion.deps.acceso);
}
