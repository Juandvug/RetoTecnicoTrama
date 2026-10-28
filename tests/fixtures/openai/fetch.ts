import cuota from "./error-cuota.json";
import auth from "./error-auth.json";
import limite from "./error-limite.json";
import pedido from "./error-pedido.json";
import plazo from "./error-plazo.json";
import servidor from "./error-servidor.json";
import rechazo from "./rechazo.json";
import texto from "./texto.json";
import toolCall from "./tool-call.json";
import truncada from "./truncada.json";

// Un `fetch` que devuelve respuestas grabadas (PLAN F4.6): ejercita el SDK real
// sin red. Cada llamada queda registrada para hacer aserciones sobre el pedido.

export const RESPUESTAS = {
  texto,
  toolCall,
  rechazo,
  truncada,
  limite,
  cuota,
  servidor,
  plazo,
  auth,
  pedido,
};

export type PedidoRegistrado = {
  url: string;
  headers: Headers;
  cuerpo: Record<string, unknown>;
};

export function fetchGrabado(
  status: number,
  cuerpo: unknown,
  headers: Record<string, string> = {},
) {
  const pedidos: PedidoRegistrado[] = [];
  const fetchSimulado: typeof fetch = async (entrada, init) => {
    pedidos.push({
      url: String(entrada),
      headers: new Headers(init?.headers),
      cuerpo: JSON.parse(String(init?.body ?? "null")),
    });
    return new Response(JSON.stringify(cuerpo), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { fetch: fetchSimulado, pedidos };
}

/** Un fetch que no responde hasta que se aborta la señal. */
export const fetchColgado: typeof fetch = (_entrada, init) =>
  new Promise((_, rechazar) => {
    init?.signal?.addEventListener("abort", () =>
      rechazar(new DOMException("Aborted", "AbortError")),
    );
  });
