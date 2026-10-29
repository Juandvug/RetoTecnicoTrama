# ADR-0003 · Estado y flujo de datos

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0001, ADR-0004, ADR-0007

## Contexto

Mientras el usuario conversa, un artefacto tipado (`RequerimientoMotor`) evoluciona en paralelo por versiones: cada ajuste genera una nueva. El enunciado acepta guardar ese estado en el cliente o en `localStorage`, sin base de datos. Robustez (20 %) exige no perder el mensaje del usuario cuando hay errores. El servidor corre en funciones serverless, donde no hay garantía de que dos requests caigan en la misma instancia.

## Decisión

1. **El cliente es dueño de la sesión.** Un reducer puro (`src/domain/session/reducer.ts`, sin React) gestiona mensajes, versiones, confirmación, borrador del composer y turno en curso. React lo usa con `useReducer` y lo persiste en `localStorage` bajo la clave `trama.session.v1`. Al hidratar, la sesión se valida con Zod. Si no valida, se descarta y se avisa al usuario.

2. **El servidor no guarda estado y es la autoridad de validación.** Cada turno llega con un snapshot acotado:
   - una ventana de mensajes;
   - la versión vigente del requerimiento;
   - un resumen numérico de la entrevista (mensajes del usuario y turnos sin versión nueva);
   - la intención (`mensaje` o `ajuste`).

   El servidor revalida todo, incluida la versión vigente que manda el cliente.

3. **El requerimiento se trata como estado, no como historial.** La versión vigente entra al modelo como JSON dentro del bloque de contexto del turno. Las tool calls de turnos anteriores no se reenvían: una tool call y su resultado solo existen dentro del turno que las produce. Con esto:
   - el historial queda neutral al proveedor;
   - el modelo ve una sola versión vigente;
   - el costo en tokens no crece con cada versión.

4. **Las versiones son inmutables.** Una tool call válida produce una propuesta, y el cliente la agrega como `v(n+1)`. Confirmar, reabrir y elegir qué versión mirar son transiciones locales y deterministas: no llaman al LLM. Solo se puede confirmar si `canConfirm(sesion)` lo permite: tiene que ser la versión más reciente, con completitud efectiva `suficiente_para_confirmar`, sin ningún turno en curso y sin un mensaje fallido pendiente. Si el usuario está mirando una versión anterior, no se confirma: así no confirma por error una versión distinta de la que ve.

5. **El transporte es un Route Handler, `POST /api/interview`, que transmite el turno en NDJSON.** El resultado de un turno es una secuencia de eventos, uno por línea (`EventoDeTurnoSchema`):
   - `texto`: un fragmento del mensaje del agente, a medida que el modelo lo escribe;
   - `reinicio`: lo mostrado se descarta (un reintento del proveedor, o un texto previo a una tool call que se reemplaza);
   - `fin`: la respuesta completa y validada (`TurnoResponseSchema`), con el mensaje definitivo y la propuesta;
   - `error`: un fallo después de empezar a transmitir, con el status que habría tenido.

   El texto transmitido es provisional y no toca la sesión: solo `fin` produce `turno_resuelto`, y la propuesta se ve únicamente cuando llega validada. Los rechazos previos al turno (origen, tamaño, sesión, rate limit, body) siguen respondiendo con su status HTTP y un cuerpo JSON. El JSON de una tool call nunca se transmite. La guarda de cifras se aplica mientras se transmite (ADR-0004).

6. **Un turno a la vez.** El cliente no envía otro mensaje mientras haya un turno en curso o un mensaje fallido sin resolver. Cada turno lleva un `turnId` (UUID). Si llega una respuesta cuyo `turnId` ya no corresponde (por ejemplo, porque se reinició la sesión), se descarta.

## Alternativas descartadas

- **Sesión en el servidor (Redis o KV).** Daría continuidad entre dispositivos y transcripciones guardadas en el servidor. A cambio suma infraestructura, retención de datos del usuario y un estado más que mantener consistente. El enunciado no lo pide.
- **Reenviar el historial completo de tool calls.** Funciona con OpenAI, pero los identificadores y formatos de las tool calls cambian de un proveedor a otro. Además, el modelo vería versiones viejas compitiendo con la vigente.
- **Server Actions.** El cliente las encola y ejecuta de a una, no exponen de forma natural el status HTTP ni cabeceras como `Retry-After` y cuesta más invocarlas en un test aislado. Un handler HTTP es un caso de uso explícito.
- **Respuesta JSON única, sin streaming.** Fue la primera versión. Con un modelo de razonamiento, el usuario miraba "Pensando…" hasta que el texto estaba completo. Se pasó a NDJSON sin cambiar el modelo de eventos. Retractar texto ya transmitido (el riesgo que había frenado el streaming) se resuelve con `reinicio` y con `fin` como única fuente de verdad.
- **Server-Sent Events.** Sirve igual, pero `EventSource` solo hace GET, y el turno necesita POST con un body. Con `fetch` y NDJSON alcanza.
- **`useChat` del AI SDK.** Ver ADR-0001.

## Consecuencias

- El servidor no guarda datos del usuario. El cliente exporta la transcripción y el requerimiento (Markdown y JSON), y esa exportación sirve directamente para los entregables.
- El payload crece con la conversación. Se acota con una ventana de mensajes que siempre conserva el primer mensaje del usuario (el planteo original) y el que se envía. La ventana se limita por cantidad (40) y también por **bytes**: 40 mensajes largos más el requerimiento vigente pueden superar los 64 KB de ADR-0005, y el 413 no se puede reintentar. El cliente descuenta de los 64 KB lo que pesa la versión vigente (`presupuestoDeMensajes`) y recorta los mensajes más antiguos con lo que queda. Además, el requerimiento vigente reemplaza al historial de versiones.
- Si se recarga la página con un turno en curso, la respuesta se pierde. Al hidratar, ese mensaje queda como fallido y reintentable (`INTERRUPTED`) con el mismo `turnId`. El análisis de cada versión se recalcula al hidratar, sin confiar en lo guardado.
- Un cliente puede manipular su propia sesión: mensajes del asistente, versión vigente o contadores. Solo se perjudica a sí mismo, y el servidor revalida todo lo que recibe y acota los contadores. Riesgo aceptado.
- No hay continuidad entre dispositivos. Para el alcance del reto se acepta.

## Verificación

- Tests del reducer que cubren cada evento y cada guarda: confirmar sin suficiencia, intentar un segundo turno concurrente y recibir una respuesta con un `turnId` obsoleto.
- Test de hidratación con datos corruptos y con datos de otra versión del esquema.
- Test del engine: el contexto incluye la versión vigente y el historial enviado al LLM no contiene tool calls de turnos anteriores.
- Tests de la transmisión (`tests/unit/server/interview/streaming.test.ts`): lo visible al final coincide con el mensaje, la tool call no se transmite, un reintento reinicia y ninguna cifra no aportada llega a transmitirse. En la UI, el texto parcial no se anuncia a los lectores de pantalla y `fin` lo reemplaza por el mensaje guardado.
