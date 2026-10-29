import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { TurnoInput } from "@/contracts/interview";
import { sesionConfirmable } from "@tests/fixtures/sesiones";
import { unTurno } from "@tests/fixtures/turnos";
import { unRequerimiento } from "@tests/fixtures/requerimientos";
import { propuestaDe } from "@tests/fixtures/sesiones";
import {
  errorHttp,
  flujoAbierto,
  json,
  leerGuardada,
  renderWorkspace,
  respuestaDeTurno,
  simularFetch,
} from "@tests/fixtures/ui";

// El chat (PLAN F7.4) y el ejecutor de turnos (F7.2), con fetch simulado.

const composer = () => screen.getByRole("textbox");
const log = () => screen.getByRole("log");
const turnoDe = (cuerpo: unknown) => cuerpo as TurnoInput;

/** Responde cada turno con un texto; el último cuerpo queda en `llamadas`. */
const responderSiempre = (mensaje = "¿Qué decisión querés tomar?") =>
  simularFetch((_, cuerpo) => json(respuestaDeTurno(turnoDe(cuerpo), mensaje)));

describe("mensajes", () => {
  it("usan los estilos del enunciado para el agente y para el usuario", async () => {
    const user = userEvent.setup();
    responderSiempre();
    await renderWorkspace();

    await user.type(composer(), "Hola{Enter}");
    await screen.findByText("¿Qué decisión querés tomar?");

    const [, propio, respuesta] = within(log()).getAllByRole("article");
    expect(within(propio!).getByText("Vos")).toHaveClass(
      "text-xs",
      "font-medium",
      "text-muted-foreground",
    );
    expect(within(propio!).getByText("Hola").parentElement).toHaveClass(
      "rounded-md",
      "border",
      "border-foreground/20",
      "p-2",
      "text-sm",
    );
    expect(within(respuesta!).getByText("Agente")).toBeInTheDocument();
    expect(
      within(respuesta!).getByText("¿Qué decisión querés tomar?").parentElement,
    ).toHaveClass("rounded-md", "border", "bg-muted", "p-2", "text-sm");
  });

  it("la lista es un log con aria-live y aria-busy mientras el agente piensa", async () => {
    const user = userEvent.setup();
    let responder!: () => void;
    simularFetch(
      (_, cuerpo) =>
        new Promise((r) => {
          responder = () => r(json(respuestaDeTurno(turnoDe(cuerpo))));
        }),
    );
    await renderWorkspace();
    expect(log()).toHaveAttribute("aria-live", "polite");

    await user.type(composer(), "Hola{Enter}");
    expect(log()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Pensando…")).toBeInTheDocument();

    await act(async () => responder());
    expect(log()).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByText("Pensando…")).toBeNull();
  });
});

describe("transmisión", () => {
  const transmitiendo = () =>
    document.querySelector<HTMLElement>("[data-transmitiendo]");

  async function abrirTurno() {
    const user = userEvent.setup();
    const flujo = flujoAbierto();
    const { llamadas } = simularFetch(() => flujo.respuesta);
    await renderWorkspace();
    await user.type(composer(), "Hola{Enter}");
    const turnId = () => turnoDe(llamadas[0]!.cuerpo).turnId;
    return { flujo, turnId };
  }

  it("muestra el texto del agente a medida que llega, en lugar de Pensando…", async () => {
    const { flujo } = await abrirTurno();
    expect(screen.getByText("Pensando…")).toBeInTheDocument();

    await act(async () => flujo.enviar({ tipo: "texto", texto: "¿Qué " }));
    await waitFor(() => expect(transmitiendo()).toHaveTextContent("¿Qué"));
    expect(screen.queryByText("Pensando…")).toBeNull();

    await act(async () => flujo.enviar({ tipo: "texto", texto: "decisión " }));
    await waitFor(() =>
      expect(transmitiendo()).toHaveTextContent("¿Qué decisión"),
    );
  });

  it("el texto parcial no se anuncia: está oculto para los lectores y el log sigue ocupado", async () => {
    const { flujo } = await abrirTurno();
    await act(async () => flujo.enviar({ tipo: "texto", texto: "¿Qué " }));
    await waitFor(() => expect(transmitiendo()).not.toBeNull());
    expect(transmitiendo()).toHaveAttribute("aria-hidden", "true");
    expect(log()).toHaveAttribute("aria-busy", "true");
  });

  it("un reinicio borra lo mostrado y vuelve a Pensando…", async () => {
    const { flujo } = await abrirTurno();
    await act(async () => flujo.enviar({ tipo: "texto", texto: "Algo " }));
    await waitFor(() => expect(transmitiendo()).not.toBeNull());

    await act(async () => flujo.enviar({ tipo: "reinicio" }));
    await waitFor(() => expect(transmitiendo()).toBeNull());
    expect(screen.getByText("Pensando…")).toBeInTheDocument();
  });

  it("el fin reemplaza el parcial por el mensaje definitivo, que se guarda", async () => {
    const { flujo, turnId } = await abrirTurno();
    await act(async () => flujo.enviar({ tipo: "texto", texto: "¿Qué " }));
    await act(async () => {
      flujo.enviar({
        tipo: "fin",
        respuesta: respuestaDeTurno(
          { ...unTurno(), turnId: turnId() },
          "¿Qué decisión querés tomar?",
        ),
      });
      flujo.cerrar();
    });

    await within(log()).findByText("¿Qué decisión querés tomar?");
    expect(transmitiendo()).toBeNull();
    expect(log()).toHaveAttribute("aria-busy", "false");
    expect(leerGuardada().mensajes.at(-1)).toMatchObject({
      rol: "assistant",
      contenido: "¿Qué decisión querés tomar?",
    });
  });

  it("un error a mitad del flujo deja el mensaje como fallido y descarta el parcial", async () => {
    const { flujo } = await abrirTurno();
    await act(async () => flujo.enviar({ tipo: "texto", texto: "¿Qué " }));
    await act(async () => {
      flujo.enviar({
        tipo: "error",
        status: 504,
        error: {
          code: "LLM_TIMEOUT",
          message: "El modelo tardó demasiado.",
          retryable: true,
        },
      });
      flujo.cerrar();
    });

    await screen.findByText("No se pudo enviar");
    expect(transmitiendo()).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});

describe("Composer", () => {
  it("Enter envía y vacía el composer", async () => {
    const user = userEvent.setup();
    const { llamadas } = responderSiempre();
    await renderWorkspace();

    await user.type(composer(), "Aumentaron los reclamos{Enter}");
    await screen.findByText("¿Qué decisión querés tomar?");
    expect(llamadas).toHaveLength(1);
    expect(turnoDe(llamadas[0]!.cuerpo).mensajes).toEqual([
      { rol: "user", contenido: "Aumentaron los reclamos" },
    ]);
    expect(composer()).toHaveValue("");
  });

  it("Shift+Enter inserta un salto de línea sin enviar", async () => {
    const user = userEvent.setup();
    const { llamadas } = responderSiempre();
    await renderWorkspace();

    await user.type(composer(), "Línea uno{Shift>}{Enter}{/Shift}Línea dos");
    expect(composer()).toHaveValue("Línea uno\nLínea dos");
    expect(llamadas).toHaveLength(0);
  });

  it("Enter durante la composición de un IME no envía", async () => {
    const { llamadas } = responderSiempre();
    await renderWorkspace();

    fireEvent.change(composer(), { target: { value: "にほん" } });
    fireEvent.keyDown(composer(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(composer(), { key: "Enter", keyCode: 229 });
    expect(llamadas).toHaveLength(0);
    expect(composer()).toHaveValue("にほん");
  });

  it("no envía un mensaje vacío y Enviar queda deshabilitado", async () => {
    const user = userEvent.setup();
    const { llamadas } = responderSiempre();
    await renderWorkspace();

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.type(composer(), "   {Enter}");
    expect(llamadas).toHaveLength(0);
  });

  describe("largo del mensaje", () => {
    const pegar = (largo: number) =>
      fireEvent.change(composer(), { target: { value: "a".repeat(largo) } });

    it("no muestra el contador mientras sobra espacio", async () => {
      await renderWorkspace();
      pegar(100);
      expect(screen.queryByText(/\/ 2\.000/)).toBeNull();
    });

    it("avisa cuánto falta al acercarse al límite, sin bloquear", async () => {
      await renderWorkspace();
      pegar(1700);
      expect(screen.getByText("1.700 / 2.000")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
    });

    it("al pegar de más avisa de inmediato y deshabilita Enviar, sin esperar al Enter", async () => {
      const { llamadas } = responderSiempre();
      await renderWorkspace();
      pegar(2650);

      expect(screen.getByRole("alert")).toHaveTextContent(
        "El mensaje supera los 2000 caracteres.",
      );
      expect(screen.getByText("2.650 / 2.000")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Enviar" }),
      ).toHaveAccessibleDescription(/supera los 2000/);

      fireEvent.keyDown(composer(), { key: "Enter" });
      expect(llamadas).toHaveLength(0);
    });

    it("el aviso desaparece al recortar el texto y entonces se puede enviar", async () => {
      const user = userEvent.setup();
      const { llamadas } = responderSiempre();
      await renderWorkspace();
      pegar(2650);
      pegar(1500);

      expect(screen.queryByRole("alert")).toBeNull();
      await user.type(composer(), "{Enter}");
      expect(llamadas).toHaveLength(1);
    });
  });

  it("el snapshot lleva la versión vigente y la intención de ajuste", async () => {
    const user = userEvent.setup();
    const { llamadas } = responderSiempre("Listo, ajusté el período.");
    await renderWorkspace({ sesion: sesionConfirmable() });

    await user.click(screen.getByRole("button", { name: "Ajustar" }));
    await user.type(composer(), "El período empieza en marzo{Enter}");
    await screen.findByText("Listo, ajusté el período.");

    const turno = turnoDe(llamadas[0]!.cuerpo);
    expect(turno.intencion).toBe("ajuste");
    expect(turno.vigente?.version).toBe(2);
    expect(turno.resumen.mensajesUsuario).toBe(3);
    expect(turno.mensajes.at(-1)).toEqual({
      rol: "user",
      contenido: "El período empieza en marzo",
    });
  });

  it("una propuesta en la respuesta agrega una versión al panel y se anuncia", async () => {
    const user = userEvent.setup();
    simularFetch((_, cuerpo) =>
      json(
        respuestaDeTurno(
          turnoDe(cuerpo),
          "Te dejé una propuesta.",
          propuestaDe(unRequerimiento()),
        ),
      ),
    );
    await renderWorkspace();

    await user.type(composer(), "Planteo{Enter}");
    await screen.findByText("Te dejé una propuesta.");
    expect(screen.getByLabelText("Versión")).toHaveValue("1");
    expect(
      screen.getByText("Nueva versión v1 · Esperando confirmación"),
    ).toBeInTheDocument();
  });
});

describe("pantallas angostas", () => {
  it("la pestaña Requerimiento avisa con texto que llegó una versión nueva", async () => {
    const user = userEvent.setup();
    simularFetch((_, cuerpo) =>
      json(
        respuestaDeTurno(
          turnoDe(cuerpo),
          "Te dejé una propuesta.",
          propuestaDe(unRequerimiento()),
        ),
      ),
    );
    await renderWorkspace();
    const pestana = () => screen.getByRole("tab", { name: /^Requerimiento/ });
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.type(composer(), "Planteo{Enter}");
    await screen.findByText("Te dejé una propuesta.");
    expect(pestana()).toHaveTextContent("Requerimiento· nueva versión");

    await user.click(pestana());
    expect(pestana()).toHaveAttribute("aria-selected", "true");
    expect(pestana()).toHaveTextContent(/^Requerimiento$/);
  });
});

describe("turno fallido", () => {
  it("conserva el texto; Reintentar lo reenvía con el mismo turnId", async () => {
    const user = userEvent.setup();
    let fallar = true;
    const { llamadas } = simularFetch((_, cuerpo) => {
      if (fallar) {
        fallar = false;
        return errorHttp(504, "LLM_TIMEOUT", true);
      }
      return json(respuestaDeTurno(turnoDe(cuerpo), "Ahora sí."));
    });
    await renderWorkspace();

    await user.type(composer(), "Mensaje importante{Enter}");
    expect(await screen.findByText("No se pudo enviar")).toBeInTheDocument();
    expect(screen.getByText("Mensaje importante")).toBeInTheDocument();
    expect(screen.getByText("Error LLM_TIMEOUT")).toBeInTheDocument();
    expect(leerGuardada().mensajes[0]?.estado).toBe("fallido");

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Ahora sí.");
    expect(turnoDe(llamadas[1]!.cuerpo).turnId).toBe(
      turnoDe(llamadas[0]!.cuerpo).turnId,
    );
    expect(screen.queryByText("No se pudo enviar")).toBeNull();
  });

  it("Editar devuelve el texto al composer y quita el mensaje", async () => {
    const user = userEvent.setup();
    simularFetch(() => errorHttp(503, "SERVICE_UNAVAILABLE", false));
    await renderWorkspace();

    await user.type(composer(), "Texto a corregir{Enter}");
    await screen.findByText("No se pudo enviar");
    // No es reintentable: solo se ofrece Editar.
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(composer()).toHaveValue("Texto a corregir");
    expect(within(log()).queryByText("Texto a corregir")).toBeNull();
  });

  it("un error de red es reintentable", async () => {
    const user = userEvent.setup();
    simularFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await renderWorkspace();

    await user.type(composer(), "Hola{Enter}");
    expect(await screen.findByText(/No se pudo conectar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("no se puede enviar otro mensaje con uno fallido pendiente", async () => {
    const user = userEvent.setup();
    simularFetch(() => errorHttp(504, "LLM_TIMEOUT", true));
    await renderWorkspace();

    await user.type(composer(), "Primero{Enter}");
    await screen.findByText("No se pudo enviar");
    await user.type(composer(), "Segundo");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Enviar" }),
    ).toHaveAccessibleDescription(/Reintentá o editá/);
  });

  it("con 429, Reintentar espera el Retry-After con una cuenta regresiva", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    simularFetch(() => errorHttp(429, "RATE_LIMITED", true, 30));
    await renderWorkspace();

    await user.type(composer(), "Hola{Enter}");
    const boton = await screen.findByRole("button", {
      name: /Reintentar en 30 s/,
    });
    expect(boton).toBeDisabled();

    await act(async () => vi.advanceTimersByTime(31_000));
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });
});

describe("acceso", () => {
  it("sin sesión muestra la pantalla del código, y con 204 entra", async () => {
    const user = userEvent.setup();
    const { llamadas } = simularFetch((url) =>
      url === "/api/access" ? new Response(null, { status: 204 }) : json({}),
    );
    await renderWorkspace({ acceso: false });

    expect(screen.queryByRole("log")).toBeNull();
    await user.type(screen.getByLabelText("Código"), "codigo-correcto{Enter}");
    expect(await screen.findByRole("log")).toBeInTheDocument();
    expect(llamadas[0]).toEqual({
      url: "/api/access",
      cuerpo: { codigo: "codigo-correcto" },
    });
  });

  it("un código incorrecto muestra el error del servidor", async () => {
    const user = userEvent.setup();
    simularFetch(() =>
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
    await renderWorkspace({ acceso: false });

    await user.type(screen.getByLabelText("Código"), "otro{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El código de acceso no es correcto.",
    );
    expect(screen.getByLabelText("Código")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("un 401 en un turno pide el código y, al entrar, reintenta el mismo turno", async () => {
    const user = userEvent.setup();
    let conSesion = false;
    const { llamadas } = simularFetch((url, cuerpo) => {
      if (url === "/api/access") {
        conSesion = true;
        return new Response(null, { status: 204 });
      }
      return conSesion
        ? json(respuestaDeTurno(turnoDe(cuerpo), "Seguimos."))
        : errorHttp(401, "ACCESS_REQUIRED", false);
    });
    await renderWorkspace();

    await user.type(composer(), "Hola{Enter}");
    await user.type(
      await screen.findByLabelText("Código"),
      "codigo-correcto{Enter}",
    );
    await screen.findByText("Seguimos.");

    const turnos = llamadas.filter((l) => l.url === "/api/interview");
    expect(turnos).toHaveLength(2);
    expect(turnoDe(turnos[1]!.cuerpo).turnId).toBe(
      turnoDe(turnos[0]!.cuerpo).turnId,
    );
  });
});

describe("persistencia", () => {
  it("al recargar se conservan la sesión, las versiones y el borrador", async () => {
    const user = userEvent.setup();
    responderSiempre();
    const { unmount } = await renderWorkspace({ sesion: sesionConfirmable() });
    await user.type(composer(), "Borrador sin enviar");
    unmount();

    await renderWorkspace();
    await waitFor(() => expect(composer()).toHaveValue("Borrador sin enviar"));
    expect(screen.getByText("Desde febrero de 2026.")).toBeInTheDocument();
    expect(screen.getByLabelText("Versión")).toHaveValue("2");
  });

  it("una sesión guardada dañada se descarta con un aviso", async () => {
    window.localStorage.setItem("trama.session.v1", "{no es json");
    await renderWorkspace();
    expect(await screen.findByRole("status")).toHaveTextContent(
      /estaba dañada/,
    );
  });

  it("Nueva entrevista pide confirmación y vacía la sesión", async () => {
    const user = userEvent.setup();
    await renderWorkspace({ sesion: sesionConfirmable() });

    await user.click(screen.getByRole("button", { name: "Nueva entrevista" }));
    await user.click(screen.getByRole("button", { name: "Borrar y empezar" }));
    expect(screen.queryByText("Desde febrero de 2026.")).toBeNull();
    expect(
      screen.getByText("Todavía no hay requerimiento"),
    ).toBeInTheDocument();
    expect(leerGuardada().mensajes).toEqual([]);
  });
});
