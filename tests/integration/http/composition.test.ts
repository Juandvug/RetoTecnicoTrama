import { afterEach, describe, expect, it, vi } from "vitest";

import { construirDependencias } from "@/server/composition";
import { manejarAcceso } from "@/server/http/access-handler";
import { manejarTurno } from "@/server/http/interview-handler";
import { unTurno } from "@tests/fixtures/turnos";
import { CENTINELA, CODIGO, FIRMA, unPost } from "@tests/fixtures/http";

// La raíz de composición con un entorno real, con una key centinela en
// OPENAI_API_KEY: ninguna respuesta ni línea de log puede contenerla.

const entorno = {
  NODE_ENV: "test",
  LLM_PROVIDER: "fake",
  FAKE_LLM_SCENARIO: "ejemplo",
  OPENAI_API_KEY: CENTINELA,
  ACCESS_CODE: CODIGO,
  SESSION_SECRET: FIRMA,
};

describe("construirDependencias", () => {
  it("arma un servidor completo con el fake, y la key centinela no aparece en nada", async () => {
    const logs: string[] = [];
    const deps = construirDependencias(entorno, { sink: (l) => logs.push(l) });
    const respuestas: string[] = [];

    const acceso = await manejarAcceso(
      unPost("/api/access", { codigo: CODIGO }),
      deps.acceso,
    );
    expect(acceso.status).toBe(204);
    const cookie = acceso.headers.get("set-cookie")!.split(";")[0]!;
    respuestas.push(JSON.stringify([...acceso.headers]));

    // El escenario "ejemplo" responde texto en la primera llamada.
    const turno = await manejarTurno(
      unPost("/api/interview", unTurno(), { cookie }),
      deps.turno,
    );
    expect(turno.status).toBe(200);
    respuestas.push(await turno.text(), JSON.stringify([...turno.headers]));

    // Dos turnos más del escenario: una tool call que no valida (se repara y
    // termina en texto) y un rechazo. Se corta antes de los pasos con esperas
    // reales; el camino de error con la centinela lo cubre el test del handler.
    for (let i = 0; i < 2; i++) {
      const r = await manejarTurno(
        unPost("/api/interview", unTurno(), { cookie }),
        deps.turno,
      );
      respuestas.push(await r.text());
    }

    expect(respuestas.join("\n")).not.toContain(CENTINELA);
    expect(logs.join("\n")).not.toContain(CENTINELA);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("la cookie del acceso es Secure salvo en desarrollo", () => {
    expect(construirDependencias(entorno).acceso.cookieSegura).toBe(true);
    expect(
      construirDependencias({ ...entorno, NODE_ENV: "development" }).acceso
        .cookieSegura,
    ).toBe(false);
  });

  it("aplica la configuración al engine y a los límites", () => {
    const deps = construirDependencias({
      ...entorno,
      LLM_MAX_OUTPUT_TOKENS: "1234",
      MAX_MENSAJES_DELIMITAR: "2",
      RATE_LIMIT_SESSION: "7",
    });
    expect(deps.turno.interview.config.maxOutputTokens).toBe(1234);
    expect(deps.turno.interview.config.umbrales.maxMensajesDelimitar).toBe(2);
    expect(deps.turno.reglas.sesion.limite).toBe(7);
  });
});

describe("obtenerDependencias", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("con la configuración inválida responde 503 sin decir qué falta, y lo registra sin valores", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", CENTINELA);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});

    const { obtenerDependencias } = await import("@/server/composition");
    const { POST } = await import("@/app/api/interview/route");

    expect(obtenerDependencias()).toEqual({ ok: false });
    const r = await POST(unPost("/api/interview", unTurno()));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "El servicio no está disponible en este momento.",
        retryable: false,
      },
    });

    const registrado = consola.mock.calls.flat().join("\n");
    expect(registrado).toContain("ACCESS_CODE");
    expect(registrado).not.toContain(CENTINELA);
  });

  it("memoiza las dependencias de la instancia", async () => {
    for (const [clave, valor] of Object.entries(entorno))
      vi.stubEnv(clave, valor);
    const { obtenerDependencias } = await import("@/server/composition");
    const primera = obtenerDependencias();
    expect(primera.ok).toBe(true);
    expect(obtenerDependencias()).toBe(primera);
  });
});
