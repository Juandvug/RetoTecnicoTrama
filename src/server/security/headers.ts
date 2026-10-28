// Cabeceras de seguridad (ADR-0005). Sin "server-only": lo importa src/proxy.ts,
// y no contiene ningún secreto.

export function generarNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function politicaDeContenido(
  nonce: string,
  desarrollo: boolean,
): string {
  return [
    "default-src 'self'",
    // En desarrollo React usa eval para reconstruir las pilas de error.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ""}`,
    // Radix posiciona elementos con estilos inline; para estilos el riesgo es acotado.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(desarrollo ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function cabecerasDeSeguridad(
  nonce: string,
  desarrollo: boolean,
): Record<string, string> {
  return {
    "Content-Security-Policy": politicaDeContenido(nonce, desarrollo),
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=()",
    // Repite frame-ancestors para navegadores antiguos.
    "X-Frame-Options": "DENY",
  };
}
