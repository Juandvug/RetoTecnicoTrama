import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";
import { codigoCorrecto } from "@/server/security/access-code";
import { excedeContentLength, leerCuerpo } from "@/server/security/body";
import { ipDelCliente, seudonimo } from "@/server/security/client-ip";
import {
  cabecerasDeSeguridad,
  politicaDeContenido,
} from "@/server/security/headers";
import { origenPermitido } from "@/server/security/origin";
import {
  cabeceraDeCookie,
  DURACION_SESION_MS,
  emitirSesion,
  leerCookie,
  verificarSesion,
} from "@/server/security/session-cookie";
import { FIRMA, HOST } from "@tests/fixtures/http";

const con = (
  cabeceras: Record<string, string>,
  url = `${HOST}/api/interview`,
) => new Request(url, { method: "POST", headers: cabeceras });

describe("origenPermitido", () => {
  it("acepta el mismo host", () => {
    expect(origenPermitido(con({ origin: HOST }))).toBe(true);
  });

  it.each([
    ["otro host", { origin: "https://atacante.test" }],
    ["otro puerto", { origin: "https://trama.test:8443" }],
    ["sin Origin", {}],
    ["un Origin inválido", { origin: "no es una url" }],
    ["el Origin null de un iframe sandbox", { origin: "null" }],
  ])("rechaza %s", (_, cabeceras) => {
    expect(origenPermitido(con(cabeceras))).toBe(false);
  });
});

describe("límite de tamaño", () => {
  it("corta por Content-Length antes de leer", () => {
    expect(excedeContentLength(con({ "content-length": "65537" }), 65536)).toBe(
      true,
    );
    expect(excedeContentLength(con({ "content-length": "65536" }), 65536)).toBe(
      false,
    );
    expect(excedeContentLength(con({ "content-length": "-1" }), 65536)).toBe(
      true,
    );
    expect(excedeContentLength(con({ "content-length": "abc" }), 65536)).toBe(
      true,
    );
    expect(excedeContentLength(con({}), 65536)).toBe(false);
  });

  it("lee un cuerpo dentro del límite", async () => {
    const request = new Request(HOST, { method: "POST", body: "ñandú" });
    expect(await leerCuerpo(request, 100)).toEqual({
      ok: true,
      texto: "ñandú",
    });
  });

  it("cuenta bytes reales aunque no haya Content-Length", async () => {
    const request = new Request(HOST, {
      method: "POST",
      body: "x".repeat(101),
    });
    expect(await leerCuerpo(request, 100)).toEqual({ ok: false });
  });

  it("lee un cuerpo vacío", async () => {
    expect(
      await leerCuerpo(new Request(HOST, { method: "POST" }), 100),
    ).toEqual({
      ok: true,
      texto: "",
    });
  });
});

describe("codigoCorrecto", () => {
  it("compara en tiempo constante, sin importar el largo", () => {
    expect(codigoCorrecto("codigo-de-prueba-123", "codigo-de-prueba-123")).toBe(
      true,
    );
    expect(codigoCorrecto("codigo-de-prueba-12", "codigo-de-prueba-123")).toBe(
      false,
    );
    expect(codigoCorrecto("", "codigo-de-prueba-123")).toBe(false);
    expect(codigoCorrecto("x".repeat(500), "codigo-de-prueba-123")).toBe(false);
  });
});

describe("cookie de sesión firmada", () => {
  const ahora = Date.parse("2026-10-28T12:00:00.000Z");

  it("emite una sesión que se verifica con la misma clave", () => {
    const sesion = emitirSesion(FIRMA, ahora, "id-1");
    expect(sesion.expira).toBe(ahora + DURACION_SESION_MS);
    expect(verificarSesion(sesion.valor, FIRMA, ahora)).toEqual({ id: "id-1" });
  });

  it("los ids de sesión son aleatorios", () => {
    expect(emitirSesion(FIRMA, ahora).id).not.toBe(
      emitirSesion(FIRMA, ahora).id,
    );
  });

  it("rechaza una cookie vencida", () => {
    const { valor } = emitirSesion(FIRMA, ahora);
    expect(
      verificarSesion(valor, FIRMA, ahora + DURACION_SESION_MS - 1),
    ).not.toBeNull();
    expect(
      verificarSesion(valor, FIRMA, ahora + DURACION_SESION_MS),
    ).toBeNull();
  });

  it("rechaza una cookie firmada con otra clave", () => {
    const { valor } = emitirSesion("g".repeat(48), ahora);
    expect(verificarSesion(valor, FIRMA, ahora)).toBeNull();
  });

  it("rechaza un contenido alterado aunque se conserve la firma", () => {
    const { valor } = emitirSesion(FIRMA, ahora);
    const [, firma] = valor.split(".");
    const otro = Buffer.from(
      JSON.stringify({ v: 1, sid: "otro", exp: ahora + 1e9 }),
    ).toString("base64url");
    expect(verificarSesion(`${otro}.${firma}`, FIRMA, ahora)).toBeNull();
  });

  it.each(["", "sin-punto", "a.b.c", ".firma", "datos."])(
    "rechaza el formato %j",
    (valor) => {
      expect(verificarSesion(valor, FIRMA, ahora)).toBeNull();
    },
  );

  it("rechaza un contenido bien firmado pero malformado", () => {
    const datos = Buffer.from("no es json").toString("base64url");
    const firma = createHmac("sha256", FIRMA).update(datos).digest("base64url");
    expect(verificarSesion(`${datos}.${firma}`, FIRMA, ahora)).toBeNull();
  });

  it("arma un Set-Cookie HttpOnly, Secure y SameSite=Strict", () => {
    expect(cabeceraDeCookie("v", { segura: true })).toBe(
      "trama_sesion=v; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict; Secure",
    );
    expect(cabeceraDeCookie("v", { segura: false })).not.toContain("Secure");
  });

  it("lee la cookie entre otras", () => {
    const request = con({ cookie: "a=1; trama_sesion=x.y=; b=2" });
    expect(leerCookie(request, "trama_sesion")).toBe("x.y=");
    expect(leerCookie(con({}), "trama_sesion")).toBeUndefined();
  });
});

describe("IP del cliente", () => {
  it("prefiere x-real-ip y si no usa la primera de x-forwarded-for", () => {
    expect(
      ipDelCliente(
        con({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }),
      ),
    ).toBe("1.1.1.1");
    expect(ipDelCliente(con({ "x-forwarded-for": " 2.2.2.2 , 3.3.3.3" }))).toBe(
      "2.2.2.2",
    );
    expect(ipDelCliente(con({}))).toBe("desconocida");
  });

  it("el seudónimo es estable, no reversible y depende de la clave", () => {
    const a = seudonimo("203.0.113.7", FIRMA);
    expect(a).toBe(seudonimo("203.0.113.7", FIRMA));
    expect(a).not.toContain("203");
    expect(a).not.toBe(seudonimo("203.0.113.7", "g".repeat(48)));
    expect(a).toHaveLength(32);
  });
});

describe("cabeceras de seguridad", () => {
  it("arma la CSP de ADR-0005 con el nonce", () => {
    expect(politicaDeContenido("abc", false)).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
    );
  });

  it("solo en desarrollo permite eval y no fuerza HTTPS", () => {
    const desarrollo = politicaDeContenido("abc", true);
    expect(desarrollo).toContain("'unsafe-eval'");
    expect(desarrollo).not.toContain("upgrade-insecure-requests");
    expect(politicaDeContenido("abc", false)).not.toContain("unsafe-eval");
  });

  it("incluye todas las cabeceras de ADR-0005", () => {
    expect(Object.keys(cabecerasDeSeguridad("n", false)).sort()).toEqual(
      [
        "Content-Security-Policy",
        "Permissions-Policy",
        "Referrer-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
      ].sort(),
    );
  });
});

describe("proxy", () => {
  it("pone las cabeceras de seguridad y pasa el nonce al render", () => {
    const respuesta = proxy(new NextRequest(`${HOST}/`));
    const csp = respuesta.headers.get("content-security-policy")!;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(nonce).toBeTruthy();
    expect(respuesta.headers.get("x-frame-options")).toBe("DENY");
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(respuesta.headers.get("strict-transport-security")).toContain(
      "max-age=63072000",
    );
    // Next pasa al render las cabeceras del request reescritas con este prefijo.
    expect(respuesta.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      respuesta.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
  });

  it("genera un nonce distinto en cada request", () => {
    const nonce = () =>
      proxy(new NextRequest(`${HOST}/`)).headers.get(
        "x-middleware-request-x-nonce",
      );
    expect(nonce()).not.toBe(nonce());
  });

  it("también cubre las rutas de la API", () => {
    const respuesta = proxy(
      new NextRequest(`${HOST}/api/interview`, { method: "POST" }),
    );
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
