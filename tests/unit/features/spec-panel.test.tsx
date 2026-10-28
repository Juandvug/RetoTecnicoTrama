import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { sesionVacia, type Sesion } from "@/domain/session";
import { vistaDelPanel } from "@/features/spec-panel/panel-state";
import { unRequerimiento } from "@tests/fixtures/requerimientos";
import {
  aplicar,
  confirmar,
  enviar,
  propuestaDe,
  sesionConfirmable,
  sesionConFaltanDatos,
  turno,
} from "@tests/fixtures/sesiones";
import { renderWorkspace } from "@tests/fixtures/ui";

// El panel (PLAN F7.5): cada estado de ARCHITECTURE §8.4 se distingue por
// borde, fondo, peso de fuente y etiqueta, nunca solo por color.

const estadoDelPanel = () =>
  document.querySelector<HTMLElement>("[data-estado]")!;
const botonConfirmar = () => screen.getByRole("button", { name: "Confirmar" });

describe("vistaDelPanel", () => {
  it.each<[string, () => Sesion, string]>([
    ["sin versión", sesionVacia, "sin_propuesta"],
    ["v1 con faltan datos", sesionConFaltanDatos, "faltan_datos"],
    ["v2 suficiente", sesionConfirmable, "esperando_confirmacion"],
    [
      "v2 confirmada",
      () => aplicar(sesionConfirmable(), confirmar),
      "confirmado",
    ],
    [
      "v1 mientras existe v2",
      () =>
        aplicar(sesionConfirmable(), {
          tipo: "version_seleccionada",
          version: 1,
        }),
      "anterior",
    ],
  ])("%s → %s", (_, sesion, tipo) => {
    expect(vistaDelPanel(sesion()).estado.tipo).toBe(tipo);
  });

  it("compara la versión visible con la anterior", () => {
    const { diff } = vistaDelPanel(sesionConfirmable());
    expect(diff?.campos).toContain("alcance.periodo");
    expect(vistaDelPanel(sesionConFaltanDatos()).diff).toBeNull();
  });
});

describe("SpecPanel", () => {
  it("sin propuesta: borde punteado sobre bg-muted y la etiqueta", async () => {
    await renderWorkspace();
    const estado = estadoDelPanel();
    expect(estado).toHaveTextContent("Todavía no hay requerimiento");
    expect(estado).toHaveClass("border", "border-dashed", "bg-muted");
    expect(botonConfirmar()).toBeDisabled();
  });

  it("faltan datos: borde punteado, los motivos y Confirmar deshabilitado con el motivo enlazado", async () => {
    await renderWorkspace({ sesion: sesionConFaltanDatos() });
    const estado = estadoDelPanel();
    expect(estado).toHaveClass("border-dashed", "bg-background");
    expect(within(estado).getByText("Faltan datos")).toHaveClass("font-medium");
    expect(within(estado).getAllByRole("listitem").length).toBeGreaterThan(0);

    expect(botonConfirmar()).toBeDisabled();
    expect(botonConfirmar()).toHaveAccessibleDescription(/^Faltan datos:/);
  });

  it("esperando confirmación: borde sólido de 1 px y Confirmar habilitado", async () => {
    await renderWorkspace({ sesion: sesionConfirmable() });
    const estado = estadoDelPanel();
    expect(estado).toHaveTextContent("Esperando confirmación");
    expect(estado).toHaveClass("border", "bg-foreground/5", "font-medium");
    expect(estado).not.toHaveClass("border-dashed");
    expect(botonConfirmar()).toBeEnabled();
    expect(botonConfirmar()).not.toHaveAttribute("aria-describedby");
  });

  it("Confirmar pasa a borde de 2 px y Reabrir vuelve a esperar confirmación", async () => {
    const user = userEvent.setup();
    await renderWorkspace({ sesion: sesionConfirmable() });

    await user.click(botonConfirmar());
    expect(estadoDelPanel()).toHaveTextContent("Confirmado · v2");
    expect(estadoDelPanel()).toHaveClass("border-2", "font-semibold");
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ajustar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(estadoDelPanel()).toHaveTextContent("Esperando confirmación");
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("una versión anterior es de solo lectura y no se puede confirmar", async () => {
    const user = userEvent.setup();
    await renderWorkspace({ sesion: sesionConfirmable() });

    await user.selectOptions(screen.getByLabelText("Versión"), "1");
    expect(estadoDelPanel()).toHaveTextContent("v1 · reemplazada por v2");
    expect(estadoDelPanel()).toHaveClass("border-dashed", "bg-muted");
    expect(botonConfirmar()).toHaveAccessibleDescription(
      /Estás viendo una versión anterior/,
    );

    await user.click(
      screen.getByRole("button", { name: "Ver la vigente (v2)" }),
    );
    expect(estadoDelPanel()).toHaveTextContent("Esperando confirmación");
  });

  it("una regla sin cobertura lleva borde punteado y dice qué le falta", async () => {
    const sinCobertura = unRequerimiento((r) => {
      // Sin la fuente de turnos, R1 no tiene columnas para asignadoA ni Turno.
      r.fuentes_requeridas = r.fuentes_requeridas.slice(0, 1);
      r.completitud = "faltan_datos";
    });
    await renderWorkspace({
      sesion: turno(sesionVacia(), "Planteo", 1, propuestaDe(sinCobertura)),
    });

    const regla = screen.getByText("R1").closest("li")!;
    expect(regla).toHaveClass("border-dashed");
    expect(regla).toHaveTextContent(/Sin datos para: .*asignadoA/);
    const cubierta = screen.getByText("R2").closest("li")!;
    expect(cubierta).not.toHaveClass("border-dashed");
  });

  it("marca con texto lo nuevo respecto de la versión anterior", async () => {
    const v1 = unRequerimiento((r) => {
      r.preguntas_abiertas = [];
      r.completitud = "faltan_datos";
    });
    const v2 = unRequerimiento();
    const sesion = turno(
      turno(sesionVacia(), "Planteo", 1, propuestaDe(v1)),
      "Respuesta",
      2,
      propuestaDe(v2),
    );
    await renderWorkspace({ sesion });

    const pregunta = screen.getByText(v2.preguntas_abiertas[0]!, {
      exact: false,
    });
    expect(pregunta).toHaveClass("font-semibold");
    expect(within(pregunta).getByText("nuevo")).toBeInTheDocument();
  });

  it("muestra las columnas de cada fuente con su justificación, en cards", async () => {
    await renderWorkspace({ sesion: sesionConfirmable() });
    const columnas = screen.getByRole("list", { name: "Columnas de Nómina" });
    expect(within(columnas).getByText("supervisor_id")).toBeInTheDocument();
    expect(columnas).toHaveTextContent("Justifica: Supervisor, reportaA");
    expect(columnas.closest("li")).toHaveClass(
      "rounded-xl",
      "ring-1",
      "ring-foreground/10",
      "p-4",
    );
  });

  it("Ajustar pone la intención de ajuste y enfoca el composer", async () => {
    const user = userEvent.setup();
    await renderWorkspace({ sesion: sesionConfirmable() });

    await user.click(screen.getByRole("button", { name: "Ajustar" }));
    const composer = screen.getByRole("textbox", {
      name: "Ajuste de v2: contá qué querés cambiar",
    });
    expect(composer).toHaveFocus();
  });

  it("Confirmar está deshabilitado con un mensaje que no se pudo enviar", async () => {
    // Un turno "enviando" guardado se hidrata como fallido (se cortó con la recarga).
    await renderWorkspace({
      sesion: aplicar(sesionConfirmable(), enviar("Otra cosa", 3)),
    });
    expect(botonConfirmar()).toHaveAccessibleDescription(
      /mensaje que no se pudo enviar/,
    );
  });
});
