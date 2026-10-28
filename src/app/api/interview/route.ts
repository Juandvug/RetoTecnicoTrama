import { obtenerDependencias } from "@/server/composition";
import { manejarTurno } from "@/server/http/interview-handler";
import { responderSinServicio } from "@/server/http/responses";

// Node.js por el SDK del proveedor y node:crypto; 60 s cubre el plazo del
// turno (50 s) con margen (ADR-0001, ADR-0004).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const composicion = obtenerDependencias();
  if (!composicion.ok) return responderSinServicio();
  return manejarTurno(request, composicion.deps.turno);
}
