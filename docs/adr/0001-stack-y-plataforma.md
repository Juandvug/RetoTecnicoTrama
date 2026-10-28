# ADR-0001 · Stack y plataforma

- **Estado:** Aceptada
- **Fecha:** 2026-10-26
- **Relacionadas:** ADR-0002, ADR-0003, ADR-0005, ADR-0008

## Contexto

El enunciado fija el stack de la app de Trama: Next.js (App Router) con TypeScript, Tailwind v4, shadcn/ui (estilo `radix-nova`, base `neutral`), la fuente Geist cargada con `next/font/google`, despliegue en Vercel y OpenAI como proveedor. La UI vale 10 % de la evaluación y exige copiar los tokens de estilo tal cual.

El stack base no está en discusión. Lo que hay que decidir es cómo usarlo y con qué completarlo: runtime, transporte, estado, validación, tests y herramientas.

## Decisión

| Aspecto | Elección | Motivo |
|---|---|---|
| Framework | Next.js App Router con TypeScript (`strict` y `noUncheckedIndexedAccess`) | Lo impone el enunciado. El flag adicional obliga a tratar todo acceso por índice como posiblemente vacío, algo frecuente con listas de mensajes y versiones. |
| Renderizado | El shell (header y layout) es un Server Component; hay una sola isla cliente, `InterviewWorkspace` | El estado de la sesión vive en el cliente (ADR-0003). Con una única frontera cliente no se reparte estado entre componentes de servidor y de cliente. |
| Endpoint | Route Handler `POST /api/interview` en runtime Node.js, con `maxDuration = 60` | El SDK de OpenAI, `node:crypto` (comparación en tiempo constante) y el control explícito de status y cabeceras funcionan sin restricciones en Node. Edge no aporta nada aquí: la latencia la pone el modelo. |
| Estilos | Tailwind v4 con configuración en CSS: los tokens del enunciado se copian tal cual en `globals.css` y se mapean con `@theme inline` | Es la forma nativa de v4 y la que genera shadcn. No hay `tailwind.config.js`. |
| Componentes | shadcn/ui `radix-nova` con base `neutral`, generados dentro del repo | El código de los componentes queda versionado y se puede ajustar a las clases que pide el enunciado (`rounded-md border p-2`, `rounded-xl ring-1 ring-foreground/10`, etc.). |
| Tema | `next-themes` con la clase `.dark` | Usa el mismo selector `.dark` que los tokens y respeta la preferencia del sistema. |
| Tipografía | `Geist` y `Geist_Mono` desde `next/font/google` | Lo impone el enunciado. Las fuentes se sirven desde el propio dominio y no hay requests a Google en runtime. |
| Validación | Zod 4 | Un solo esquema genera el tipo TypeScript (`z.infer`), valida en servidor y cliente y produce el JSON Schema de la tool (`z.toJSONSchema`). Así no puede haber divergencia entre lo que se le pide al modelo y lo que se valida. |
| LLM | SDK oficial `openai`, importado solo por el adaptador | Ver ADR-0002. |
| Rate limiting | Upstash Redis (integración del Vercel Marketplace) con `@upstash/ratelimit`, detrás de un puerto propio | Ver ADR-0005. |
| Tests | Vitest, Testing Library (jsdom) y Playwright | Ver ADR-0008. |
| Herramientas | pnpm, Node.js 24 LTS, ESLint (flat config) con reglas de límites de import, Prettier y GitHub Actions | El lockfile se versiona. La CI ejecuta typecheck, lint, tests, build y escaneo de secretos. |

Las versiones exactas se fijan al crear el proyecto y quedan registradas en el lockfile.

Los mensajes del agente se muestran como texto plano (`whitespace-pre-wrap`), sin Markdown. Así no hay HTML generado por el modelo que pueda abrir una vía de XSS, y el resultado coincide con la maqueta del enunciado.

## Alternativas descartadas

- **Vercel AI SDK (`ai`, `useChat`).** Resuelve streaming y multiproveedor, pero el criterio de arquitectura pide que la lógica de la entrevista no dependa del proveedor gracias a una interfaz propia. Si esa frontera la pone una librería, deja de verse en el código que se evalúa. Además, `useChat` impone su propio modelo de mensajes y de estado, que no encaja con el versionado del requerimiento (ADR-0003). Y el ciclo de reparación de tool calls (ADR-0004) necesita control paso a paso. Se vuelve a evaluar si se agrega streaming.
- **Edge runtime.** Arranca más rápido en frío, pero no tiene las APIs completas de Node y no mejora nada que importe: el tiempo de cada turno lo domina el modelo.
- **Server Actions como transporte.** Ver ADR-0003.
- **Zustand o Redux.** El estado es un único reducer puro (ADR-0003). Una librería de estado no aporta nada que justifique la dependencia.
- **Markdown en los mensajes del agente.** Las listas se verían mejor, pero hay que sanear HTML generado por el modelo y la maqueta del enunciado no lo usa.

## Consecuencias

- El stack es el mismo que el de la app real, así que tokens y componentes se pueden comparar con ella directamente.
- Hay un único despliegue (UI + API) en Vercel. El único servicio externo, además de OpenAI, es Redis para el rate limiting.
- Casi toda la página es de cliente, así que los Server Components aportan poco: el layout y las cabeceras. Se acepta.
- El rate limiting persistente depende de un servicio externo. Por eso está detrás de un puerto que tiene una implementación en memoria para desarrollo y tests.

## Verificación

- La CI ejecuta `typecheck`, `lint` (incluidos los límites de import de ADR-0002), `test` y `build` en cada push.
- Un test de fidelidad compara cada variable de `globals.css`, en `:root` y en `.dark`, con los tokens del enunciado.
- Una regla de lint prohíbe `dangerouslySetInnerHTML`.
