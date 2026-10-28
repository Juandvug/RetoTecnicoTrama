import { LIMITE_PAYLOAD_BYTES, MAX_MENSAJES_VENTANA } from "./limits";

// La ventana de mensajes que viaja en cada turno (ARCHITECTURE §7.1): siempre
// conserva el primer mensaje del usuario (el planteo original) y el último (el
// que se envía), y completa con los más recientes. Se acota por cantidad y
// también por bytes, porque 40 mensajes largos más el requerimiento vigente
// pueden superar el tope de 64 KB del endpoint.

export type MensajeDeVentana = { rol: "user" | "assistant"; contenido: string };

/** Reserva para turnId, resumen, intención y la estructura del JSON. */
const RESERVA_BYTES = 2048;

const codificador = new TextEncoder();
const bytes = (texto: string) => codificador.encode(texto).length;

export function presupuestoDeMensajes(
  vigente: { version: number; requerimiento: unknown } | null,
  limite = LIMITE_PAYLOAD_BYTES,
): number {
  const ocupado =
    RESERVA_BYTES + (vigente ? bytes(JSON.stringify(vigente)) : 0);
  return Math.max(0, limite - ocupado);
}

export function armarVentana<T extends MensajeDeVentana>(
  mensajes: readonly T[],
  { max = MAX_MENSAJES_VENTANA, presupuesto = Infinity } = {},
): T[] {
  const ultimo = mensajes.length - 1;
  if (ultimo < 0) return [];

  const tamano = (m: T) =>
    bytes(JSON.stringify({ rol: m.rol, contenido: m.contenido })) + 1;
  const elegidos = new Set<number>();
  let usado = 0;
  const elegir = (i: number) => {
    elegidos.add(i);
    usado += tamano(mensajes[i]!);
  };

  elegir(ultimo);
  const primero = mensajes.findIndex((m) => m.rol === "user");
  if (primero !== -1 && primero !== ultimo) elegir(primero);

  for (let i = ultimo - 1; i >= 0 && elegidos.size < max; i--) {
    if (elegidos.has(i)) continue;
    // Los más recientes forman un tramo continuo: al primero que no entra, se corta.
    if (usado + tamano(mensajes[i]!) > presupuesto) break;
    elegir(i);
  }

  return [...elegidos].sort((a, b) => a - b).map((i) => mensajes[i]!);
}
