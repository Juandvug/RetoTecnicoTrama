import { describe, expect, it } from "vitest";

import {
  armarVentana,
  LIMITE_PAYLOAD_BYTES,
  MAX_MENSAJES_VENTANA,
  presupuestoDeMensajes,
  type MensajeDeVentana,
} from "@/domain/session";
import { unRequerimiento } from "@tests/fixtures/requerimientos";

const conversacion = (n: number, largo = 10): MensajeDeVentana[] =>
  Array.from({ length: n }, (_, i) => ({
    rol: i % 2 === 0 ? "user" : "assistant",
    contenido: `${i}`.padEnd(largo, "x"),
  }));

describe("armarVentana", () => {
  it("devuelve todo si entra", () => {
    const mensajes = conversacion(5);
    expect(armarVentana(mensajes)).toEqual(mensajes);
  });

  it("devuelve vacío para una conversación vacía", () => {
    expect(armarVentana([])).toEqual([]);
  });

  it("conserva el primer mensaje del usuario y completa con los más recientes hasta 40", () => {
    const mensajes = conversacion(81); // termina en un mensaje del usuario
    const ventana = armarVentana(mensajes);

    expect(ventana).toHaveLength(MAX_MENSAJES_VENTANA);
    expect(ventana[0]).toBe(mensajes[0]);
    expect(ventana.at(-1)).toBe(mensajes.at(-1));
    // El resto son los 39 más recientes, sin huecos entre ellos.
    expect(ventana.slice(1)).toEqual(
      mensajes.slice(-(MAX_MENSAJES_VENTANA - 1)),
    );
  });

  it("el primer mensaje del usuario no es necesariamente el primero de la conversación", () => {
    const mensajes: MensajeDeVentana[] = [
      { rol: "assistant", contenido: "Bienvenido" },
      ...conversacion(60),
    ];
    const ventana = armarVentana(mensajes);
    expect(ventana[0]).toBe(mensajes[1]);
    expect(ventana).toHaveLength(MAX_MENSAJES_VENTANA);
  });

  it("no duplica el primer mensaje cuando ya está entre los recientes", () => {
    const mensajes = conversacion(39);
    expect(armarVentana(mensajes)).toEqual(mensajes);
  });

  it("respeta un máximo distinto", () => {
    expect(armarVentana(conversacion(20), { max: 4 })).toHaveLength(4);
  });

  describe("por bytes", () => {
    it("recorta los mensajes más antiguos para no pasar el presupuesto", () => {
      const mensajes = conversacion(31, 1000); // ~31 KB
      const ventana = armarVentana(mensajes, { presupuesto: 10 * 1024 });

      expect(ventana.length).toBeLessThan(15);
      expect(ventana[0]).toBe(mensajes[0]);
      expect(ventana.at(-1)).toBe(mensajes.at(-1));
      const bytes = new TextEncoder().encode(JSON.stringify(ventana)).length;
      expect(bytes).toBeLessThanOrEqual(10 * 1024);
    });

    it("siempre incluye el último mensaje y el primero, aunque no entren", () => {
      const mensajes = conversacion(5, 1000);
      const ventana = armarVentana(mensajes, { presupuesto: 100 });
      expect(ventana).toEqual([mensajes[0], mensajes[4]]);
    });

    it("cuenta bytes, no caracteres", () => {
      const mensajes: MensajeDeVentana[] = [
        { rol: "user", contenido: "primero" },
        { rol: "assistant", contenido: "ñ".repeat(500) }, // 1000 bytes
        { rol: "user", contenido: "último" },
      ];
      expect(armarVentana(mensajes, { presupuesto: 600 })).toHaveLength(2);
    });
  });
});

describe("presupuestoDeMensajes", () => {
  it("sin requerimiento vigente casi todo el payload queda para los mensajes", () => {
    const presupuesto = presupuestoDeMensajes(null);
    expect(presupuesto).toBeGreaterThan(LIMITE_PAYLOAD_BYTES - 4096);
    expect(presupuesto).toBeLessThan(LIMITE_PAYLOAD_BYTES);
  });

  it("descuenta lo que pesa la versión vigente", () => {
    const vigente = { version: 1, requerimiento: unRequerimiento() };
    const peso = new TextEncoder().encode(JSON.stringify(vigente)).length;
    expect(presupuestoDeMensajes(null) - presupuestoDeMensajes(vigente)).toBe(
      peso,
    );
  });

  it("nunca es negativo", () => {
    expect(
      presupuestoDeMensajes({ version: 1, requerimiento: "x".repeat(70_000) }),
    ).toBe(0);
  });

  it("una conversación al máximo con el requerimiento vigente entra en el payload", () => {
    const vigente = { version: 3, requerimiento: unRequerimiento() };
    const mensajes = conversacion(99, 2000); // mucho más que 64 KB en total
    const ventana = armarVentana(mensajes, {
      presupuesto: presupuestoDeMensajes(vigente),
    });
    const total = new TextEncoder().encode(
      JSON.stringify({ mensajes: ventana, vigente }),
    ).length;
    expect(total).toBeLessThan(LIMITE_PAYLOAD_BYTES);
  });
});
