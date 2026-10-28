import {
  conDemora,
  FakeLlmClient,
  falla,
  llamada,
  rechazo,
  texto,
  truncada,
} from "@/server/llm/fake/client";

import {
  describeLlmClientContract,
  type CasoDeContrato,
} from "./llm-client.contract";

const UNA_HORA = 60 * 60 * 1000;

function paso(caso: CasoDeContrato) {
  switch (caso.tipo) {
    case "texto":
      return texto(caso.texto);
    case "tool_call":
      return llamada(caso.nombre, caso.argumentos);
    case "rechazo":
      return rechazo(caso.mensaje);
    case "truncada":
      return truncada('{"dato": "cor');
    case "error":
      return falla(caso.kind, caso.retryAfterMs);
    case "colgado":
      return conDemora(UNA_HORA, texto("nunca llega"));
  }
}

describeLlmClientContract(
  "FakeLlmClient",
  (caso) => new FakeLlmClient([paso(caso)]),
);
