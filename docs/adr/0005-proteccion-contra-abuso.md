# ADR-0005 · Protección contra abuso

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0001, ADR-0004

## Contexto

La URL del despliegue es pública y la key de OpenAI tiene un tope de gasto. Cualquiera que encuentre la URL puede agotar ese tope (denegación por costo) o usar el endpoint como un proxy gratuito de LLM. El enunciado pide "una contraseña simple o un límite de mensajes por sesión". Además, descalifica la entrega si la key aparece en el bundle del cliente, en el repo o en los logs.

## Decisión

Defensa en capas. Dentro del handler se aplican en este orden, y cada capa corta antes de que se gaste en la siguiente.

1. **Origen.** Se rechazan con 403 las requests `POST` cuyo `Origin` no coincide con el host. Complementa la cookie `SameSite=Strict` como defensa contra CSRF.

2. **Tamaño.** Si `Content-Length` supera 64 KB, se responde 413 antes de leer el body. El body se valida con Zod:
   - máximo 40 mensajes;
   - 2.000 caracteres por mensaje del usuario;
   - 4.000 caracteres por mensaje del asistente.

3. **Código de acceso.** Una pantalla inicial pide un código compartido (`ACCESS_CODE`).
   - `POST /api/access` compara el código en tiempo constante.
   - Si es correcto, emite una cookie de sesión `HttpOnly`, `Secure` y `SameSite=Strict`, firmada con HMAC-SHA256 (`SESSION_SECRET`), que contiene un id de sesión y vence a las 24 h.
   - Los intentos fallidos se limitan a 5 cada 10 minutos por IP.
   - En producción, la validación de entorno falla si falta `ACCESS_CODE` o `SESSION_SECRET`, así que el control de acceso no puede quedar apagado por olvido.

4. **Rate limiting en capas,** detrás de un puerto `RateLimiter`. En producción se usa Upstash; en desarrollo y tests, una implementación en memoria. Los valores por defecto se pueden configurar por entorno:

   | Clave | Límite | Motivo |
   |---|---|---|
   | Sesión | 50 turnos cada 24 h | Es el "límite de mensajes por sesión" del enunciado. Alcanza para varias entrevistas completas. |
   | IP | 60 turnos por hora (ventana deslizante) | Impide abrir sesiones nuevas una tras otra desde el mismo origen para saltear el límite por sesión. |
   | Global | 1.000 turnos por día | Corta el circuito: protege el tope de gasto aunque fallen las otras capas. |

   - Se responde 429 con `Retry-After` y `X-RateLimit-Remaining`.
   - En producción, el backend Upstash es obligatorio por configuración.
   - Si Redis no responde durante un request, el limitador pasa a memoria y lo registra. Se prefiere degradar el control a dejar caída la demo. El tope de gasto de la key es la última barrera.

5. **Topes por turno.** Se acotan la ventana de mensajes que se envía al modelo, `maxOutputTokens` por llamada, la cantidad máxima de llamadas por turno y el plazo de 50 s (ADR-0004).

6. **Alcance del agente.** El prompt limita al agente a la entrevista y le indica que rechace en una frase cualquier pedido ajeno. No es una barrera de seguridad, pero le quita valor al endpoint como proxy. La tool no tiene efectos laterales: una inyección de prompt no puede lograr más que una propuesta, y esa propuesta igual se valida.

### Protección de la key

- La key vive solo en las variables de entorno de Vercel y nunca lleva el prefijo `NEXT_PUBLIC_`. Los archivos `.env*` están en `.gitignore`, y `.env.example` no tiene valores.
- Los módulos que leen la key importan `server-only`. Si un componente cliente los importa, el build falla.
- El logger es estructurado y solo acepta los campos de una lista blanca. Nunca registra cabeceras, variables de entorno ni el contenido de los mensajes. Los errores del SDK se convierten a `LlmError` antes de llegar al log.
- En la CI se corre `gitleaks` sobre el repo y se escanea `.next/static`. El escaneo falla si encuentra el patrón `sk-` o el nombre `OPENAI_API_KEY`.

### Cabeceras

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `X-Frame-Options` | `DENY` (repite `frame-ancestors` para navegadores antiguos) |
| `Cache-Control` (solo API) | `no-store` |

- `src/proxy.ts` (`middleware.ts` en versiones de Next anteriores a la 16) genera un nonce por request. Next lo aplica a sus scripts, y `next-themes` lo recibe por prop.
- `style-src` mantiene `'unsafe-inline'` porque Radix posiciona elementos con estilos inline. Para estilos el riesgo es acotado.
- Los mensajes del agente se muestran como texto plano: React escapa todo y una regla de lint prohíbe `dangerouslySetInnerHTML`.

## Alternativas descartadas

- **Rate limiting sin código de acceso.** Sería más cómodo para quienes evalúan, pero cualquier crawler o usuario anónimo podría consumir presupuesto hasta llegar al límite global. El código se entrega junto con la URL.
- **Autenticación real (OAuth, cuentas).** Queda fuera del alcance según el enunciado.
- **Rate limiting en memoria en producción.** Cada instancia serverless tiene su propio contador y lo pierde en cada arranque en frío. No limita de verdad.
- **Vercel WAF o BotID.** Son útiles, pero dependen del plan y de la configuración del proyecto en Vercel, que está fuera del repo. Quedan como refuerzo opcional, no como control principal.
- **CSP con `'unsafe-inline'` en scripts.** Es más simple, pero anula la protección principal de la CSP. El nonce cuesta poco: obliga a renderizar dinámicamente, y la app tiene una sola página.

## Consecuencias

- Quienes evalúan necesitan el código de acceso, que se entrega junto con la URL.
- En producción, los límites dependen de Upstash (plan gratuito).
- Con nonce, la página no se puede servir como estática. Con una sola página, eso no importa.

## Verificación

Tests del handler con dependencias falsas:

- origen ajeno → 403;
- body de más de 64 KB → 413;
- sin cookie → 401;
- cookie con la firma alterada o vencida → 401;
- código incorrecto 6 veces → 429;
- sesión por encima del límite → 429 con `Retry-After`;
- con una key centinela inyectada, ningún cuerpo de respuesta ni línea de log la contiene.

En la CI, `gitleaks` y el escaneo del bundle.
