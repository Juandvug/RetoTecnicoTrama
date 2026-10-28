import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Cookie de sesión firmada con HMAC-SHA256 (ADR-0005). Contiene un id de
// sesión aleatorio y el vencimiento; no hay estado en el servidor. Formato:
// base64url(JSON) "." base64url(firma).

export const NOMBRE_COOKIE = "trama_sesion";
export const DURACION_SESION_MS = 24 * 60 * 60 * 1000;

type Contenido = { v: 1; sid: string; exp: number };

const firmar = (datos: string, clave: string) =>
  createHmac("sha256", clave).update(datos).digest("base64url");

export function emitirSesion(
  clave: string,
  ahoraMs: number,
  id: string = randomUUID(),
): { valor: string; id: string; expira: number } {
  const contenido: Contenido = {
    v: 1,
    sid: id,
    exp: ahoraMs + DURACION_SESION_MS,
  };
  const datos = Buffer.from(JSON.stringify(contenido)).toString("base64url");
  return {
    valor: `${datos}.${firmar(datos, clave)}`,
    id,
    expira: contenido.exp,
  };
}

/** Devuelve el id de sesión si la cookie está bien firmada y no venció. */
export function verificarSesion(
  valor: string | undefined,
  clave: string,
  ahoraMs: number,
): { id: string } | null {
  if (!valor) return null;
  const [datos, firma, ...resto] = valor.split(".");
  if (!datos || !firma || resto.length > 0) return null;

  const esperada = Buffer.from(firmar(datos, clave));
  const recibida = Buffer.from(firma);
  if (
    esperada.length !== recibida.length ||
    !timingSafeEqual(esperada, recibida)
  )
    return null;

  try {
    const contenido = JSON.parse(
      Buffer.from(datos, "base64url").toString("utf8"),
    ) as Partial<Contenido>;
    if (
      contenido.v !== 1 ||
      typeof contenido.sid !== "string" ||
      typeof contenido.exp !== "number"
    )
      return null;
    if (contenido.exp <= ahoraMs) return null;
    return { id: contenido.sid };
  } catch {
    return null;
  }
}

/** Set-Cookie: HttpOnly, SameSite=Strict y, salvo en desarrollo local, Secure. */
export function cabeceraDeCookie(
  valor: string,
  { segura }: { segura: boolean },
): string {
  return [
    `${NOMBRE_COOKIE}=${valor}`,
    "Path=/",
    `Max-Age=${DURACION_SESION_MS / 1000}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(segura ? ["Secure"] : []),
  ].join("; ");
}

export function leerCookie(
  request: Request,
  nombre: string,
): string | undefined {
  const cabecera = request.headers.get("cookie");
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(";")) {
    const [clave, ...valor] = parte.trim().split("=");
    if (clave === nombre) return valor.join("=");
  }
  return undefined;
}
