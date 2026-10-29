import { afterEach, describe, expect, it, vi } from "vitest";

import { enviarCodigo, enviarTurno } from "@/lib/api-client";
import { TURNO_ID, unTurno } from "@tests/fixtures/turnos";

// El cliente de la API (PLAN F7.1): valida las respuestas y normaliza los
// errores; nunca lanza, salvo por una cancelación propia.

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const respuestaValida = (turnId = TURNO_ID) => ({
  turnId,
  mensaje: "¿Desde cuándo lo notan?",
  propuesta: null,
  meta: {
    fase: "delimitar",
    cierre: false,
    promptVersion: "entrevista-1.0.0",
    llamadas: 1,
    reparaciones: 0,
    guardaCifras: "ok",
  },
});

const simular = (respuesta: () => Promise<Response> | Response) => {
  const fetch = vi.fn(async () => respuesta());
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

afterEach(() => vi.unstubAllGlobals());

describe("enviarTurno", () => {
  it("manda el snapshot por POST y devuelve la respuesta validada", async () => {
    const fetch = simular(() => json(respuestaValida()));
    const resultado = await enviarTurno(unTurno());

    expect(resultado).toEqual({ ok: true, datos: respuestaValida() });
    expect(fetch).toHaveBeenCalledWith(
      "/api/interview",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify(unTurno()),
      }),
    );
  });

  it("normaliza el cuerpo de error del servidor", async () => {
    simular(() =>
      json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Esperá.",
            retryable: true,
            retryAfterSec: 12,
          },
        },
        429,
      ),
    );
    expect(await enviarTurno(unTurno())).toEqual({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Esperá.",
        retryable: true,
        retryAfterSec: 12,
        status: 429,
      },
    });
  });

  it("un error de red es reintentable", async () => {
    simular(() => Promise.reject(new TypeError("Failed to fetch")));
    const resultado = await enviarTurno(unTurno());
    expect(resultado).toMatchObject({
      ok: false,
      error: { code: "NETWORK", retryable: true, status: null },
    });
  });

  it.each([
    ["un cuerpo que no es JSON", () => new Response("<html>", { status: 200 })],
    [
      "una respuesta que no cumple el contrato",
      () => json({ mensaje: "hola" }),
    ],
    ["otro turnId", () => json(respuestaValida(crypto.randomUUID()))],
    ["un error sin el formato esperado", () => json({ detalle: "x" }, 502)],
  ])("rechaza %s como BAD_RESPONSE reintentable", async (_, respuesta) => {
    simular(respuesta);
    expect(await enviarTurno(unTurno())).toMatchObject({
      ok: false,
      error: { code: "BAD_RESPONSE", retryable: true },
    });
  });

  it("una cancelación propia rechaza la promesa", async () => {
    const control = new AbortController();
    simular(() => {
      control.abort();
      return Promise.reject(new DOMException("aborted", "AbortError"));
    });
    await expect(enviarTurno(unTurno(), control.signal)).rejects.toThrow(
      "aborted",
    );
  });
});

describe("enviarCodigo", () => {
  it("204 es acceso concedido", async () => {
    const fetch = simular(() => new Response(null, { status: 204 }));
    expect(await enviarCodigo("  codigo-correcto  ")).toEqual({
      ok: true,
      datos: null,
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/access",
      expect.objectContaining({
        body: JSON.stringify({ codigo: "codigo-correcto" }),
      }),
    );
  });

  it("un código vacío no sale del navegador", async () => {
    const fetch = simular(() => new Response(null, { status: 204 }));
    expect(await enviarCodigo("   ")).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("401 devuelve el mensaje del servidor", async () => {
    simular(() =>
      json(
        {
          error: {
            code: "ACCESS_REQUIRED",
            message: "El código de acceso no es correcto.",
            retryable: false,
          },
        },
        401,
      ),
    );
    expect(await enviarCodigo("otro")).toMatchObject({
      ok: false,
      error: { message: "El código de acceso no es correcto.", status: 401 },
    });
  });
});

describe("enviarTurno · flujo NDJSON", () => {
  const ndjson = (...lineas: Array<unknown | string>) =>
    new Response(
      lineas
        .map((l) => (typeof l === "string" ? l : JSON.stringify(l)) + "\n")
        .join(""),
      {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
      },
    );

  it("entrega el texto parcial y devuelve el fin", async () => {
    simular(() =>
      ndjson(
        { tipo: "texto", texto: "¿Desde " },
        { tipo: "reinicio" },
        { tipo: "texto", texto: "¿Desde cuándo?" },
        { tipo: "fin", respuesta: respuestaValida() },
      ),
    );
    const eventos: unknown[] = [];
    const resultado = await enviarTurno(unTurno(), undefined, (e) =>
      eventos.push(e),
    );

    expect(eventos).toEqual([
      { tipo: "texto", texto: "¿Desde " },
      { tipo: "reinicio" },
      { tipo: "texto", texto: "¿Desde cuándo?" },
    ]);
    expect(resultado).toEqual({ ok: true, datos: respuestaValida() });
  });

  it("une las líneas que llegan partidas entre lecturas", async () => {
    const linea = JSON.stringify({ tipo: "fin", respuesta: respuestaValida() });
    const codificador = new TextEncoder();
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(codificador.encode(linea.slice(0, 20)));
        c.enqueue(codificador.encode(linea.slice(20) + "\n"));
        c.close();
      },
    });
    simular(
      () =>
        new Response(cuerpo, {
          headers: { "Content-Type": "application/x-ndjson" },
        }),
    );
    expect(await enviarTurno(unTurno())).toEqual({
      ok: true,
      datos: respuestaValida(),
    });
  });

  it("un evento de error se normaliza con su status y su espera", async () => {
    simular(() =>
      ndjson({
        tipo: "error",
        status: 503,
        error: {
          code: "LLM_UNAVAILABLE",
          message: "No disponible.",
          retryable: true,
          retryAfterSec: 8,
        },
      }),
    );
    expect(await enviarTurno(unTurno())).toEqual({
      ok: false,
      error: {
        code: "LLM_UNAVAILABLE",
        message: "No disponible.",
        retryable: true,
        retryAfterSec: 8,
        status: 503,
      },
    });
  });

  it("un flujo que se corta sin fin es un error reintentable", async () => {
    simular(() => ndjson({ tipo: "texto", texto: "¿Desde " }));
    const r = await enviarTurno(unTurno());
    expect(r).toMatchObject({
      ok: false,
      error: { code: "NETWORK", retryable: true },
    });
  });

  it("una línea que no es un evento válido es BAD_RESPONSE", async () => {
    simular(() => ndjson("{no es json"));
    expect(await enviarTurno(unTurno())).toMatchObject({
      ok: false,
      error: { code: "BAD_RESPONSE" },
    });
  });

  it("descarta un fin de otro turno", async () => {
    simular(() =>
      ndjson({
        tipo: "fin",
        respuesta: respuestaValida("00000000-0000-4000-8000-000000000000"),
      }),
    );
    expect(await enviarTurno(unTurno())).toMatchObject({
      ok: false,
      error: { code: "BAD_RESPONSE" },
    });
  });
});
