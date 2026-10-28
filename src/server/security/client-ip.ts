import "server-only";

import { createHmac } from "node:crypto";

/**
 * IP del cliente. En Vercel, x-real-ip y x-forwarded-for los pone la
 * plataforma, que reemplaza lo que mande el cliente; fuera de Vercel no son
 * confiables, y por eso el límite global existe aparte del límite por IP.
 */
export function ipDelCliente(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const reenviada = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return reenviada || "desconocida";
}

/**
 * Identificador estable y no reversible para claves de rate limit y logs: ni
 * Redis ni los logs guardan la IP ni el id de sesión en claro.
 */
export function seudonimo(valor: string, clave: string): string {
  return createHmac("sha256", clave).update(valor).digest("hex").slice(0, 32);
}
