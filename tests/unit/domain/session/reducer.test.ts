import { describe, expect, it } from "vitest";

import {
  canConfirm,
  esSoloLectura,
  sesionVacia,
  sessionReducer,
  versionVigente,
} from "@/domain/session";
import { unRequerimiento } from "@tests/fixtures/requerimientos";
import {
  aplicar,
  confirmar,
  enviar,
  fallar,
  propuestaDe,
  resolver,
  sesionConfirmable,
  sesionConFaltanDatos,
  turno,
} from "@tests/fixtures/sesiones";

describe("mensaje_enviado", () => {
  it("agrega el mensaje en estado enviando, fija el turno y vacía el borrador", () => {
    const antes = aplicar(sesionVacia(), {
      tipo: "borrador_actualizado",
      texto: "algo a medio escribir",
    });
    const s = aplicar(antes, enviar("  Hola  "));

    expect(s.mensajes).toEqual([
      expect.objectContaining({
        rol: "user",
        contenido: "Hola",
        estado: "enviando",
        turnId: "turno-1",
      }),
    ]);
    expect(s.turnoEnCurso).toBe("turno-1");
    expect(s.borrador).toBe("");
  });

  it("rechaza un segundo turno mientras hay uno en curso", () => {
    const enCurso = aplicar(sesionVacia(), enviar("Primero", 1));
    expect(sessionReducer(enCurso, enviar("Segundo", 2))).toBe(enCurso);
  });

  it("rechaza mensajes nuevos mientras haya un mensaje fallido", () => {
    const fallido = aplicar(sesionVacia(), enviar("Primero"), fallar());
    expect(sessionReducer(fallido, enviar("Segundo", 2))).toBe(fallido);
  });

  it("no se puede enviar con la sesión confirmada", () => {
    const confirmada = aplicar(sesionConfirmable(), confirmar);
    expect(confirmada.confirmacion).not.toBeNull();
    expect(sessionReducer(confirmada, enviar("Otro", 3))).toBe(confirmada);
  });

  it("rechaza un mensaje vacío", () => {
    const s = sesionVacia();
    expect(sessionReducer(s, enviar("   "))).toBe(s);
  });
});

describe("turno_resuelto", () => {
  it("pasa el mensaje a enviado, agrega la respuesta y libera el turno", () => {
    const s = turno(sesionVacia(), "Hola", 1);
    expect(s.mensajes.map((m) => [m.rol, m.estado])).toEqual([
      ["user", "enviado"],
      ["assistant", "enviado"],
    ]);
    expect(s.turnoEnCurso).toBeNull();
  });

  it("sin propuesta incrementa los turnos sin versión nueva", () => {
    let s = turno(sesionVacia(), "Uno", 1);
    s = turno(s, "Dos", 2);
    expect(s.turnosSinVersionNueva).toBe(2);
    expect(s.versiones).toEqual([]);
  });

  it("con propuesta agrega la versión y reinicia el contador", () => {
    let s = turno(sesionVacia(), "Uno", 1);
    s = turno(s, "Dos", 2, propuestaDe());
    expect(s.versiones).toHaveLength(1);
    expect(s.versiones[0]).toMatchObject({
      version: 1,
      turnId: "turno-2",
      promptVersion: "entrevista-1.0.0",
    });
    expect(s.turnosSinVersionNueva).toBe(0);
  });

  it("ignora una respuesta con un turnId obsoleto", () => {
    const enCurso = aplicar(sesionVacia(), enviar("Hola", 2));
    expect(sessionReducer(enCurso, resolver(1))).toBe(enCurso);
    expect(sessionReducer(enCurso, fallar(1))).toBe(enCurso);
  });

  it("ignora una respuesta cuando no hay turno en curso", () => {
    const s = sesionVacia();
    expect(sessionReducer(s, resolver(1))).toBe(s);
  });

  it("vuelve la intención a mensaje y deja la versión visible en la más reciente", () => {
    let s = sesionConFaltanDatos();
    s = aplicar(
      s,
      { tipo: "ajuste_iniciado" },
      { tipo: "version_seleccionada", version: null },
    );
    expect(s.intencion).toBe("ajuste");
    s = turno(s, "Cambiá el período", 2, propuestaDe());
    expect(s.intencion).toBe("mensaje");
    expect(s.versionVisible).toBeNull();
  });
});

describe("turno_fallido, reintento y edición", () => {
  const fallida = () =>
    aplicar(sesionVacia(), enviar("Texto importante"), fallar());

  it("pasa el mensaje a fallido con el error, y lo conserva", () => {
    const s = fallida();
    expect(s.mensajes[0]).toMatchObject({
      estado: "fallido",
      contenido: "Texto importante",
      error: { code: "LLM_TIMEOUT", retryable: true },
    });
    expect(s.turnoEnCurso).toBeNull();
  });

  it("Reintentar lo vuelve a enviar con el mismo turnId", () => {
    const s = aplicar(fallida(), { tipo: "reintento" });
    expect(s.mensajes[0]).toMatchObject({ estado: "enviando", error: null });
    expect(s.turnoEnCurso).toBe("turno-1");
  });

  it("Reintentar no hace nada si no hay un mensaje fallido", () => {
    const s = aplicar(sesionVacia(), enviar("Hola"));
    expect(sessionReducer(s, { tipo: "reintento" })).toBe(s);
  });

  it("Editar devuelve el texto al borrador y quita el mensaje", () => {
    const s = aplicar(fallida(), { tipo: "edicion" });
    expect(s.borrador).toBe("Texto importante");
    expect(s.mensajes).toEqual([]);
  });

  it("Editar conserva lo que ya se había escrito en el borrador", () => {
    const s = aplicar(
      fallida(),
      { tipo: "borrador_actualizado", texto: "Otra idea" },
      { tipo: "edicion" },
    );
    expect(s.borrador).toBe("Texto importante\n\nOtra idea");
  });

  it("después de editar se puede volver a enviar", () => {
    const s = aplicar(
      fallida(),
      { tipo: "edicion" },
      enviar("Texto corregido", 2),
    );
    expect(s.turnoEnCurso).toBe("turno-2");
  });
});

describe("reiniciado", () => {
  it("vacía la sesión y descarta las respuestas que estaban en curso", () => {
    const enCurso = aplicar(
      sesionConfirmable(),
      { tipo: "reabierto" },
      enviar("Hola", 3),
    );
    const s = aplicar(enCurso, { tipo: "reiniciado" });
    expect(s).toEqual(sesionVacia());
    expect(sessionReducer(s, resolver(3, propuestaDe()))).toBe(s);
    expect(sessionReducer(s, fallar(3))).toBe(s);
  });
});

describe("caso del enunciado: confirmación", () => {
  it("confirmar marca la última versión y bloquea el envío; Reabrir lo vuelve a permitir", () => {
    const confirmada = aplicar(sesionConfirmable(), confirmar);
    expect(confirmada.confirmacion).toEqual({
      version: 2,
      en: "2026-10-28T10:00:00.000Z",
    });
    expect(sessionReducer(confirmada, enviar("Más", 3))).toBe(confirmada);

    const reabierta = aplicar(confirmada, { tipo: "reabierto" });
    expect(reabierta.confirmacion).toBeNull();
    expect(aplicar(reabierta, enviar("Más", 3)).turnoEnCurso).toBe("turno-3");
  });

  it("rechaza confirmar sin suficiencia y explica por qué", () => {
    const s = sesionConFaltanDatos();
    expect(sessionReducer(s, confirmar)).toBe(s);
    expect(canConfirm(s)).toEqual({
      permitido: false,
      motivo: "Faltan datos: El período no está definido.",
    });
  });

  it("confirmar sin ninguna versión no hace nada", () => {
    const s = sesionVacia();
    expect(sessionReducer(s, confirmar)).toBe(s);
  });

  it("reabrir sin confirmación no hace nada", () => {
    const s = sesionConfirmable();
    expect(sessionReducer(s, { tipo: "reabierto" })).toBe(s);
  });

  it("después de reabrir y ajustar, la versión nueva se confirma por separado", () => {
    let s = aplicar(sesionConfirmable(), confirmar, { tipo: "reabierto" });
    s = turno(
      s,
      "Sumá Sede",
      3,
      propuestaDe(
        unRequerimiento((r) => {
          r.alcance.unidades.push("Logística");
        }),
      ),
    );
    expect(aplicar(s, confirmar).confirmacion?.version).toBe(3);
  });
});

describe("caso del enunciado: ajuste después de una propuesta", () => {
  it("agrega v(n+1), deja v(n) en solo lectura y reinicia el contador", () => {
    let s = sesionConfirmable(); // v1 y v2
    s = turno(s, "Una duda", 3); // sin propuesta
    expect(s.turnosSinVersionNueva).toBe(1);

    s = aplicar(s, { tipo: "ajuste_iniciado" });
    expect(s.intencion).toBe("ajuste");

    const ajustada = unRequerimiento((r) => {
      r.alcance.unidades = ["Operaciones", "Logística"];
    });
    s = turno(s, "Sumá Logística", 4, propuestaDe(ajustada));

    expect(s.versiones.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(versionVigente(s)?.requerimiento.alcance.unidades).toEqual([
      "Operaciones",
      "Logística",
    ]);
    expect(esSoloLectura(s, 2)).toBe(true);
    expect(esSoloLectura(s, 3)).toBe(false);
    expect(s.turnosSinVersionNueva).toBe(0);
  });

  it("no inicia un ajuste sin versión, con la sesión confirmada o con un turno en curso", () => {
    const vacia = sesionVacia();
    expect(sessionReducer(vacia, { tipo: "ajuste_iniciado" })).toBe(vacia);

    const confirmada = aplicar(sesionConfirmable(), confirmar);
    expect(sessionReducer(confirmada, { tipo: "ajuste_iniciado" })).toBe(
      confirmada,
    );

    const enCurso = aplicar(sesionConfirmable(), enviar("Hola", 3));
    expect(sessionReducer(enCurso, { tipo: "ajuste_iniciado" })).toBe(enCurso);
  });
});

describe("version_seleccionada", () => {
  it("fija la versión visible y vuelve a null con la más reciente", () => {
    let s = aplicar(sesionConfirmable(), {
      tipo: "version_seleccionada",
      version: 1,
    });
    expect(s.versionVisible).toBe(1);
    s = aplicar(s, { tipo: "version_seleccionada", version: 2 });
    expect(s.versionVisible).toBeNull();
  });

  it("ignora una versión que no existe", () => {
    const s = sesionConfirmable();
    expect(
      sessionReducer(s, { tipo: "version_seleccionada", version: 9 }),
    ).toBe(s);
  });

  it("no se puede confirmar mirando una versión anterior", () => {
    const s = aplicar(sesionConfirmable(), {
      tipo: "version_seleccionada",
      version: 1,
    });
    expect(canConfirm(s).motivo).toMatch(/versión anterior/);
    expect(sessionReducer(s, confirmar)).toBe(s);
  });
});
