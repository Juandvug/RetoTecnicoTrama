import { describe, expect, it } from "vitest";

import { manejarAcceso } from "@/server/http/access-handler";
import { manejarTurno } from "@/server/http/interview-handler";
import { texto } from "@/server/llm/fake/client";
import { verificarSesion } from "@/server/security/session-cookie";
import { unTurno } from "@tests/fixtures/turnos";
import { armarDeps, CODIGO, FIRMA, unPost } from "@tests/fixtures/http";

const RUTA = "/api/access";

describe("POST /api/access", () => {
  it("con el código correcto responde 204 con una cookie HttpOnly, Secure y SameSite=Strict", async () => {
    const { acceso, reloj } = armarDeps();
    const r = await manejarAcceso(unPost(RUTA, { codigo: CODIGO }), acceso);

    expect(r.status).toBe(204);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^trama_sesion=[\w-]+\.[\w-]+; /);
    for (const atributo of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=86400",
    ]) {
      expect(cookie).toContain(atributo);
    }

    const valor = cookie.split(";")[0]!.split("=").slice(1).join("=");
    expect(verificarSesion(valor, FIRMA, reloj.now())).toEqual({
      id: expect.any(String),
    });
  });

  it("sin Secure solo cuando se configura para desarrollo local", async () => {
    const { acceso } = armarDeps();
    const r = await manejarAcceso(unPost(RUTA, { codigo: CODIGO }), {
      ...acceso,
      cookieSegura: false,
    });
    expect(r.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("con un código incorrecto responde 401 y no emite cookie", async () => {
    const { acceso } = armarDeps();
    const r = await manejarAcceso(
      unPost(RUTA, { codigo: "otro-codigo" }),
      acceso,
    );
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(await r.json()).toEqual({
      error: {
        code: "ACCESS_REQUIRED",
        message: "El código de acceso no es correcto.",
        retryable: false,
      },
    });
  });

  it("con 6 intentos incorrectos, el sexto responde 429", async () => {
    const { acceso } = armarDeps();
    const intentar = (codigo: string) =>
      manejarAcceso(unPost(RUTA, { codigo }), acceso);
    for (let i = 0; i < 5; i++)
      expect((await intentar(`incorrecto-${i}`)).status).toBe(401);

    const sexto = await intentar("incorrecto-5");
    expect(sexto.status).toBe(429);
    expect(Number(sexto.headers.get("retry-after"))).toBeGreaterThan(0);
    // Bloqueado: tampoco entra con el código correcto hasta que pase la ventana.
    expect((await intentar(CODIGO)).status).toBe(429);
  });

  it("el bloqueo es por IP: otra IP puede intentar", async () => {
    const { acceso } = armarDeps();
    for (let i = 0; i < 5; i++)
      await manejarAcceso(unPost(RUTA, { codigo: "x" }), acceso);
    const otraIp = await manejarAcceso(
      unPost(RUTA, { codigo: CODIGO }, { ip: "198.51.100.9" }),
      acceso,
    );
    expect(otraIp.status).toBe(204);
  });

  it("se libera después de 10 minutos", async () => {
    const { acceso, reloj } = armarDeps();
    for (let i = 0; i < 5; i++)
      await manejarAcceso(unPost(RUTA, { codigo: "x" }), acceso);
    reloj.avanzar(10 * 60 * 1000 + 1);
    expect(
      (await manejarAcceso(unPost(RUTA, { codigo: CODIGO }), acceso)).status,
    ).toBe(204);
  });

  it.each([
    [
      "un origen ajeno",
      { codigo: CODIGO },
      { origen: "https://atacante.test" },
      403,
    ],
    ["un body inválido", "{no", {}, 400],
    ["un body sin código", { clave: CODIGO }, {}, 400],
    ["un body demasiado grande", { codigo: "x".repeat(2000) }, {}, 413],
  ] as const)("rechaza %s", async (_, cuerpo, opciones, status) => {
    const { acceso } = armarDeps();
    const r = await manejarAcceso(unPost(RUTA, cuerpo, opciones), acceso);
    expect(r.status).toBe(status);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("la cookie emitida habilita el turno", async () => {
    const { acceso, turno } = armarDeps({
      guion: [texto("¿Qué decisión querés tomar?")],
    });
    const r = await manejarAcceso(unPost(RUTA, { codigo: CODIGO }), acceso);
    const cookie = r.headers.get("set-cookie")!.split(";")[0]!;

    const respuesta = await manejarTurno(
      unPost("/api/interview", unTurno(), { cookie }),
      turno,
    );
    expect(respuesta.status).toBe(200);
  });

  it("no registra el código en el log", async () => {
    const { acceso, logs } = armarDeps();
    await manejarAcceso(unPost(RUTA, { codigo: CODIGO }), acceso);
    await manejarAcceso(
      unPost(RUTA, { codigo: "codigo-equivocado-xyz" }),
      acceso,
    );
    expect(logs.join("\n")).not.toContain(CODIGO);
    expect(logs.join("\n")).not.toContain("codigo-equivocado-xyz");
  });
});
