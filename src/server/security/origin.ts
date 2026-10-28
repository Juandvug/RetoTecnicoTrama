import "server-only";

/**
 * Solo se aceptan POST cuyo Origin coincide con el host del request (ADR-0005).
 * Un POST sin Origin también se rechaza: los navegadores lo envían siempre en
 * un fetch POST, así que su ausencia indica que no viene de la app. Complementa
 * la cookie SameSite=Strict como defensa contra CSRF.
 */
export function origenPermitido(request: Request): boolean {
  const origen = request.headers.get("origin");
  if (!origen) return false;
  try {
    return new URL(origen).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
