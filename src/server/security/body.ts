import "server-only";

// Límite de tamaño del cuerpo (ADR-0005). Se mira primero Content-Length, para
// cortar antes de leer nada, y además se cuenta lo que se lee: un cuerpo sin
// Content-Length (chunked) o con uno falso no puede pasar el límite.

export function excedeContentLength(request: Request, limite: number): boolean {
  const declarado = request.headers.get("content-length");
  if (declarado === null) return false;
  const bytes = Number(declarado);
  return !Number.isFinite(bytes) || bytes < 0 || bytes > limite;
}

export type CuerpoLeido = { ok: true; texto: string } | { ok: false };

export async function leerCuerpo(
  request: Request,
  limite: number,
): Promise<CuerpoLeido> {
  if (!request.body) return { ok: true, texto: "" };
  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await lector.cancel();
      return { ok: false };
    }
    partes.push(value);
  }
  return { ok: true, texto: new TextDecoder().decode(Buffer.concat(partes)) };
}
