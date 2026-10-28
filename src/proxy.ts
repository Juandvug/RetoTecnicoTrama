import { NextResponse, type NextRequest } from "next/server";

import { cabecerasDeSeguridad, generarNonce } from "@/server/security/headers";

// Un nonce por request para la CSP, y las cabeceras de seguridad en todas las
// respuestas, también las de la API (ADR-0005). Next lee el nonce de la CSP
// del request y lo aplica a sus scripts; el layout lo pasa a next-themes.
export function proxy(request: NextRequest) {
  const nonce = generarNonce();
  const cabeceras = cabecerasDeSeguridad(
    nonce,
    process.env.NODE_ENV === "development",
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    cabeceras["Content-Security-Policy"]!,
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [nombre, valor] of Object.entries(cabeceras)) {
    response.headers.set(nombre, valor);
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Todo salvo los archivos estáticos y los prefetch, que no necesitan CSP.
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
