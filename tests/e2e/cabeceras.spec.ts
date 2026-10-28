import type { APIResponse, Response } from "@playwright/test";

import { expect, test } from "./fixtures";

// Las cabeceras de seguridad de ADR-0005 (PLAN F8.5), en la página y en la API.

function comprobarCabeceras(cabeceras: Record<string, string>) {
  const csp = cabeceras["content-security-policy"] ?? "";
  expect(csp).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("unsafe-eval");
  expect(cabeceras["strict-transport-security"]).toBe(
    "max-age=63072000; includeSubDomains",
  );
  expect(cabeceras["x-content-type-options"]).toBe("nosniff");
  expect(cabeceras["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(cabeceras["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  expect(cabeceras["x-frame-options"]).toBe("DENY");
  expect(cabeceras["x-powered-by"]).toBeUndefined();
}

const cabecerasDe = (r: Response | APIResponse) => r.headers();

test("la página lleva las cabeceras y todos sus scripts, el nonce", async ({
  page,
}) => {
  const respuesta = (await page.goto("/"))!;
  const cabeceras = cabecerasDe(respuesta);
  comprobarCabeceras(cabeceras);

  // El nonce cambia en cada request y es el que llevan los scripts.
  const nonce = /'nonce-([^']+)'/.exec(
    cabeceras["content-security-policy"]!,
  )![1];
  const html = await respuesta.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);

  const otra = cabecerasDe((await page.request.get("/"))!);
  expect(otra["content-security-policy"]).not.toContain(nonce);
});

test("la API lleva las cabeceras y no se guarda en caché", async ({
  request,
  baseURL,
}) => {
  const turno = await request.post("/api/interview", {
    headers: { Origin: baseURL! },
    data: {},
  });
  expect(turno.status()).toBe(401);
  comprobarCabeceras(cabecerasDe(turno));
  expect(turno.headers()["cache-control"]).toBe("no-store");

  const ajeno = await request.post("/api/access", {
    headers: { Origin: "https://otro.example" },
    data: { codigo: "x" },
  });
  expect(ajeno.status()).toBe(403);
  expect(ajeno.headers()["cache-control"]).toBe("no-store");
});
