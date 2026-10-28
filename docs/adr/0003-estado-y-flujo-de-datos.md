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

4. **Las versiones son inmutables.** Una tool call válida produce una propuesta, y el cliente la agrega como `v(n+1)`. Confirmar, reabrir y elegir qué versión mirar son transiciones locales y deterministas: no llaman al LLM. Solo se puede confirmar si `canConfirm(sesion)` lo permite: tiene que ser la versión más reciente, con completitud efectiva `suficiente_para_confirmar` y sin ningún turno en curso.

5. **El transporte es un Route Handler, `POST /api/interview`, con respuesta JSON y sin streaming en v1.** El resultado de un turno se modela como una secuencia de eventos de dominio (`texto`, `propuesta`, `error`, `fin`). En v1 esos eventos se serializan en una única respuesta JSON. Para agregar streaming (NDJSON) solo cambia la serialización, no el modelo.

6. **Un turno a la vez.** El cliente no envía otro mensaje mientras haya un turno en curso o un mensaje fallido sin resolver. Cada turno lleva un `turnId` (UUID). Si llega una respuesta cuyo `turnId` ya no corresponde (por ejemplo, porque se reinició la sesión), se descarta.

## Alternativas descartadas

- **Sesión en el servidor (Redis o KV).** Daría continuidad entre dispositivos y transcripciones guardadas en el servidor. A cambio suma infraestructura, retención de datos del usuario y un estado más que mantener consistente. El enunciado no lo pide.
- **Reenviar el historial completo de tool calls.** Funciona con OpenAI, pero los identificadores y formatos de las tool calls cambian de un proveedor a otro. Además, el modelo vería versiones viejas compitiendo con la vigente.
- **Server Actions.** El cliente las encola y ejecuta de a una, no exponen de forma natural el status HTTP ni cabeceras como `Retry-After` y cuesta más invocarlas en un test aislado. Un handler HTTP es un caso de uso explícito.
- **Streaming desde el día uno.** El artefacto solo se muestra después de validarse (ADR-0004). Si una reparación falla, habría que retractar texto que ya se transmitió. En v1 el beneficio visible del streaming no compensa ese costo. Queda como incremento y no obliga a cambiar el modelo de eventos.
- **`useChat` del AI SDK.** Ver ADR-0001.

## Consecuencias

- El servidor no guarda datos del usuario. El cliente exporta la transcripción y el requerimiento (Markdown y JSON), y esa exportación sirve directamente para los entregables.
- El payload crece con la conversación. Se acota con una ventana de mensajes que siempre conserva el primer mensaje del usuario (el planteo original) y con los límites de tamaño de ADR-0005. Además, el requerimiento vigente reemplaza al historial de versiones.
- Un cliente puede manipular su propia sesión: mensajes del asistente, versión vigente o contadores. Solo se perjudica a sí mismo, y el servidor revalida todo lo que recibe y acota los contadores. Riesgo aceptado.
- No hay continuidad entre dispositivos. Para el alcance del reto se acepta.

## Verificación

- Tests del reducer que cubren cada evento y cada guarda: confirmar sin suficiencia, intentar un segundo turno concurrente y recibir una respuesta con un `turnId` obsoleto.
- Test de hidratación con datos corruptos y con datos de otra versión del esquema.
- Test del engine: el contexto incluye la versión vigente y el historial enviado al LLM no contiene tool calls de turnos anteriores.
