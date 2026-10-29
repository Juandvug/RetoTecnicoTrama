import { describe, expect, it } from "vitest";

import {
  EventoDeTurnoSchema,
  TurnoResponseSchema,
  type EventoDeTurno,
} from "@/contracts/interview";
import { manejarTurno } from "@/server/http/interview-handler";
import { falla, texto, type PasoFake } from "@/server/llm/fake/client";
import { DURACION_SESION_MS } from "@/server/security/session-cookie";
import { unRequerimiento } from "@tests/fixtures/requerimientos";
import { conVigente, registrar, unTurno } from "@tests/fixtures/turnos";
import {
  armarDeps,
  CENTINELA,
  cookieDeSesion,
  unPost,
} from "@tests/fixtures/http";

const RUTA = "/api/interview";

function armar(
  guion: PasoFake[] = [texto("¿Qué decisión querés tomar?")],
  limites?: { sesion: number; ip: number; global: number },
) {
  const ctx = armarDeps({ guion, limites });
  const cookie = cookieDeSesion(ctx.reloj.now());
  const enviar = (
    cuerpo: unknown = unTurno(),
    opciones: Parameters<typeof unPost>[2] = {},
  ) => manejarTurno(unPost(RUTA, cuerpo, { cookie, ...opciones }), ctx.turno);
  return { ...ctx, cookie, enviar };
}

const error = async (r: Response) =>
  ((await r.json()) as { error: Record<string, unknown> }).error;

/** Los eventos NDJSON de un turno, validados contra el contrato. */
const eventos = async (r: Response): Promise<EventoDeTurno[]> =>
  (await r.text())
    .split("\n")
    .filter(Boolean)
    .map((linea) => EventoDeTurnoSchema.parse(JSON.parse(linea)));

const fin = async (r: Response) => {
  const ultimo = (await eventos(r)).at(-1);
  if (ultimo?.tipo !== "fin") throw new Error(`Esperaba fin: ${ultimo?.tipo}`);
  return ultimo.respuesta;
};

const errorDelFlujo = async (r: Response) => {
  const ultimo = (await eventos(r)).at(-1);
  if (ultimo?.tipo !== "error")
    throw new Error(`Esperaba error: ${ultimo?.tipo}`);
  return ultimo;
};

describe("POST /api/interview: camino feliz con el fake", () => {
  it("responde 200 en NDJSON, sin caché y con los límites restantes", async () => {
    const { enviar } = armar();
    const respuesta = await enviar();

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("cache-control")).toBe(
      "no-store, no-transform",
    );
    expect(respuesta.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(respuesta.headers.get("x-ratelimit-remaining")).toBe("49");

    const cuerpo = await fin(respuesta);
    expect(TurnoResponseSchema.safeParse(cuerpo).success).toBe(true);
    expect(cuerpo).toMatchObject({
      turnId: unTurno().turnId,
      mensaje: "¿Qué decisión querés tomar?",
      propuesta: null,
      meta: { fase: "delimitar", llamadas: 1 },
    });
  });

  it("devuelve la propuesta validada", async () => {
    const { enviar } = armar([
      registrar(unRequerimiento()),
      texto("Te dejé una propuesta."),
    ]);
    const cuerpo = await fin(await enviar());
    expect(cuerpo.propuesta?.requerimiento).toEqual(unRequerimiento());
    expect(cuerpo.propuesta?.analisis.completitudEfectiva).toBe(
      "suficiente_para_confirmar",
    );
  });

  it("registra una línea por turno, sin contenido", async () => {
    const { enviar, logs } = armar([
      registrar(unRequerimiento()),
      texto("Te dejé una propuesta."),
    ]);
    // El log del turno se escribe cuando termina el flujo.
    await (await enviar()).text();
    const turno = logs
      .map((l) => JSON.parse(l))
      .find((l) => l.evento === "turno");

    expect(turno).toMatchObject({
      nivel: "info",
      turnId: unTurno().turnId,
      fase: "delimitar",
      llamadas: 2,
      reparaciones: 0,
      resultado: "propuesta",
      completitudEfectiva: "suficiente_para_confirmar",
      guardaCifras: "ok",
      tokensEntrada: 200,
      promptVersion: "entrevista-1.0.0",
    });
    expect(turno.sesion).toMatch(/^[0-9a-f]{12}$/);
    const todo = logs.join("\n");
    expect(todo).not.toContain("Te dejé una propuesta");
    expect(todo).not.toContain(unTurno().mensajes[0]!.contenido);
    expect(todo).not.toContain(unRequerimiento().necesidad);
  });
});

describe("POST /api/interview: rechazos en orden", () => {
  it("403 si el origen es ajeno", async () => {
    const { enviar, fake } = armar();
    const r = await enviar(unTurno(), { origen: "https://atacante.test" });
    expect(r.status).toBe(403);
    expect(await error(r)).toMatchObject({
      code: "FORBIDDEN",
      retryable: false,
    });
    expect(fake.llamadas).toBe(0);
  });

  it("403 sin Origin", async () => {
    const { enviar } = armar();
    expect((await enviar(unTurno(), { origen: null })).status).toBe(403);
  });

  it("413 si el Content-Length declarado supera 64 KB, sin leer el cuerpo", async () => {
    const { enviar } = armar();
    const r = await enviar(unTurno(), {
      cabeceras: { "content-length": String(64 * 1024 + 1) },
    });
    expect(r.status).toBe(413);
    expect(await error(r)).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("413 si el cuerpo real supera 64 KB aunque no lo declare", async () => {
    const { enviar } = armar();
    const r = await enviar(`{"relleno":"${"x".repeat(64 * 1024)}"}`);
    expect(r.status).toBe(413);
  });

  describe("401", () => {
    it("sin cookie", async () => {
      const { turno } = armarDeps();
      const r = await manejarTurno(unPost(RUTA, unTurno()), turno);
      expect(r.status).toBe(401);
      expect(await error(r)).toMatchObject({
        code: "ACCESS_REQUIRED",
        retryable: false,
      });
    });

    it("con la firma alterada", async () => {
      const { turno, reloj } = armarDeps();
      const cookie = cookieDeSesion(reloj.now());
      const alterada = `${cookie.slice(0, -2)}xx`;
      expect(
        (
          await manejarTurno(
            unPost(RUTA, unTurno(), { cookie: alterada }),
            turno,
          )
        ).status,
      ).toBe(401);
    });

    it("con la cookie vencida", async () => {
      const { turno, reloj } = armarDeps();
      const cookie = cookieDeSesion(reloj.now());
      reloj.avanzar(DURACION_SESION_MS);
      expect(
        (await manejarTurno(unPost(RUTA, unTurno(), { cookie }), turno)).status,
      ).toBe(401);
    });
  });

  describe("429", () => {
    it("al pasar el límite por sesión, con Retry-After", async () => {
      const { enviar, fake } = armar([texto("a"), texto("b"), texto("c")], {
        sesion: 2,
        ip: 60,
        global: 1000,
      });
      expect((await enviar()).status).toBe(200);
      expect((await enviar()).status).toBe(200);

      const r = await enviar();
      expect(r.status).toBe(429);
      expect(r.headers.get("retry-after")).toBe(String(24 * 60 * 60));
      expect(r.headers.get("x-ratelimit-remaining")).toBe("0");
      expect(await error(r)).toMatchObject({
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterSec: 86400,
      });
      expect(fake.llamadas).toBe(2);
    });

    it("al pasar el límite por IP, aunque cada request use otra sesión", async () => {
      const { turno, reloj } = armarDeps({
        guion: [texto("a"), texto("b")],
        limites: { sesion: 50, ip: 2, global: 1000 },
      });
      const otraSesion = () => cookieDeSesion(reloj.now());
      for (let i = 0; i < 2; i++) {
        expect(
          (
            await manejarTurno(
              unPost(RUTA, unTurno(), { cookie: otraSesion() }),
              turno,
            )
          ).status,
        ).toBe(200);
      }
      expect(
        (
          await manejarTurno(
            unPost(RUTA, unTurno(), { cookie: otraSesion() }),
            turno,
          )
        ).status,
      ).toBe(429);
    });

    it("al pasar el límite global, aunque cambien sesión e IP", async () => {
      const { turno, reloj } = armarDeps({
        guion: [texto("a")],
        limites: { sesion: 50, ip: 60, global: 1 },
      });
      const pedir = (ip: string) =>
        manejarTurno(
          unPost(RUTA, unTurno(), { cookie: cookieDeSesion(reloj.now()), ip }),
          turno,
        );
      expect((await pedir("198.51.100.1")).status).toBe(200);
      expect((await pedir("198.51.100.2")).status).toBe(429);
    });

    it("una request malformada también consume el límite", async () => {
      const { enviar } = armar([], { sesion: 1, ip: 60, global: 1000 });
      expect((await enviar("{no es json")).status).toBe(400);
      expect((await enviar()).status).toBe(429);
    });
  });

  describe("400", () => {
    it.each([
      ["JSON inválido", "{no es json"],
      ["un body que no cumple el contrato", { hola: "mundo" }],
      ["un turnId que no es UUID", { ...unTurno(), turnId: "1" }],
      [
        "el último mensaje del asistente",
        { ...unTurno(), mensajes: [{ rol: "assistant", contenido: "x" }] },
      ],
    ])("por %s", async (_, cuerpo) => {
      const { enviar, fake } = armar();
      const r = await enviar(cuerpo);
      expect(r.status).toBe(400);
      expect(await error(r)).toMatchObject({
        code: "INVALID_REQUEST",
        retryable: false,
      });
      expect(fake.llamadas).toBe(0);
    });

    it("por una versión vigente con errores", async () => {
      const { enviar, fake } = armar();
      const rota = unRequerimiento((r) => {
        r.esquema.relaciones[0]!.objeto = "Fantasma";
      });
      const r = await enviar(unTurno({ vigente: conVigente(rota) }));
      expect(r.status).toBe(400);
      expect(await error(r)).toMatchObject({
        message: "La versión vigente del requerimiento no es válida.",
      });
      expect(fake.llamadas).toBe(0);
    });

    it("pero acepta una versión vigente con una cifra que ya salió de la ventana", async () => {
      const conCifra = unRequerimiento((r) => {
        r.necesidad =
          "Explicar por qué el 40% de las renuncias son de operaciones";
      });
      const { enviar } = armar();
      expect(
        (await enviar(unTurno({ vigente: conVigente(conCifra) }))).status,
      ).toBe(200);
    });
  });
});

describe("POST /api/interview: errores del modelo", () => {
  it.each([
    ["timeout", 504, "LLM_TIMEOUT", true],
    ["unavailable", 502, "LLM_UNAVAILABLE", true],
    ["rate_limited", 503, "LLM_UNAVAILABLE", true],
    ["quota_exceeded", 503, "SERVICE_UNAVAILABLE", false],
    ["auth", 503, "SERVICE_UNAVAILABLE", false],
    ["bad_request", 500, "INTERNAL", false],
  ] as const)("%s → %i %s", async (kind, status, code, retryable) => {
    const { enviar, logs } = armar([falla(kind)]);
    const r = await enviar();
    // El flujo ya empezó: el error llega como evento, con su status.
    expect(r.status).toBe(200);
    expect(await errorDelFlujo(r)).toMatchObject({
      status,
      error: { code, retryable },
    });
    expect(logs.map((l) => JSON.parse(l))).toContainEqual(
      expect.objectContaining({
        nivel: "error",
        evento: "turno",
        kind,
        status,
        resultado: code,
      }),
    );
  });

  it("propaga el Retry-After del proveedor", async () => {
    const r = await armar([falla("rate_limited", 7500)]).enviar();
    expect(await errorDelFlujo(r)).toMatchObject({
      error: { retryAfterSec: 8 },
    });
  });

  it("un error inesperado responde 500 genérico", async () => {
    const r = await armar([]).enviar(); // el guion vacío lanza un Error común
    const evento = await errorDelFlujo(r);
    expect(evento.status).toBe(500);
    expect(evento.error).toEqual({
      code: "INTERNAL",
      message: "Ocurrió un error inesperado. Probá de nuevo más tarde.",
      retryable: false,
    });
  });
});

describe("POST /api/interview: transmisión del texto", () => {
  it("transmite el texto en fragmentos y cierra con la respuesta completa", async () => {
    const { enviar } = armar([texto("¿Qué decisión querés tomar con esto?")]);
    const lista = await eventos(await enviar());

    const fragmentos = lista.filter((e) => e.tipo === "texto");
    expect(fragmentos.length).toBeGreaterThan(1);
    expect(fragmentos.map((e) => e.texto).join("")).toBe(
      "¿Qué decisión querés tomar con esto?",
    );
    expect(lista.at(-1)).toMatchObject({
      tipo: "fin",
      respuesta: { mensaje: "¿Qué decisión querés tomar con esto?" },
    });
  });

  it("no transmite el JSON de la tool call: solo el texto que la acompaña después", async () => {
    const { enviar } = armar([
      registrar(unRequerimiento()),
      texto("Te dejé una propuesta."),
    ]);
    const lista = await eventos(await enviar());
    const transmitido = lista
      .filter((e) => e.tipo === "texto")
      .map((e) => e.texto)
      .join("");
    expect(transmitido).toBe("Te dejé una propuesta.");
  });

  it("nunca transmite una cifra no aportada: corta y el fin trae el texto corregido", async () => {
    const { enviar } = armar([
      texto("Los reclamos podrían bajar un 30 % si reforzás el chat."),
      texto("Los reclamos podrían bajar si reforzás el chat."),
    ]);
    const lista = await eventos(await enviar());
    const transmitido = lista
      .filter((e) => e.tipo === "texto")
      .map((e) => e.texto)
      .join("");

    expect(transmitido).not.toMatch(/30/);
    expect(lista.at(-1)).toMatchObject({
      tipo: "fin",
      respuesta: {
        mensaje: "Los reclamos podrían bajar si reforzás el chat.",
        meta: { guardaCifras: "corregido" },
      },
    });
  });
});

describe("la key no se filtra", () => {
  it("ni en la respuesta ni en el log, aunque el error del proveedor la incluya", async () => {
    const { turno, reloj, logs } = armarDeps({
      guion: () => {
        throw new Error(`401 Incorrect API key provided: ${CENTINELA}`);
      },
    });
    const r = await manejarTurno(
      unPost(RUTA, unTurno(), { cookie: cookieDeSesion(reloj.now()) }),
      turno,
    );

    expect(await r.text()).not.toContain(CENTINELA);
    expect(logs.join("\n")).not.toContain(CENTINELA);
  });
});
